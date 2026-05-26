/**
 * Tests for agent/src/auth/identity.ts — resolveCallerId behaviour.
 *
 * Dallas's resolveCallerId is fully implemented in M0 for the three observable paths:
 *   1. Entra oid present on the validated JWT attachment → returns ownerId + isDemo:false
 *   2. ADVISOR_DEMO_MODE === 'true', no oid required  → returns demo id + isDemo:true
 *   3. No oid and no demo mode                        → throws
 *
 * AC-07: when Entra sign-in is enabled, sessions/requests are partitioned and owned
 *        by the Entra oid; demo sessions are isolated under an opaque demo id
 * AC-15: Entra sign-in is enabled by default; can only be disabled through an explicit
 *        demo flag — the agent must never silently fall back to an unauthenticated state
 *
 * https://learn.microsoft.com/entra/identity-platform/id-token-claims-reference
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import { resolveCallerId } from '../../../agent/src/auth/identity.js';
import type { CallerIdentity } from '../../../agent/src/auth/identity.js';
import type { Request as ExpressRequest } from 'express';

afterEach(() => {
  vi.unstubAllEnvs();
});

/** Cast a plain object to ExpressRequest for unit-test purposes. */
function makeReq(overrides: Record<string, unknown> = {}): ExpressRequest {
  return overrides as unknown as ExpressRequest;
}

describe('resolveCallerId', () => {
  // AC-07: Entra oid is the ownership key
  it('returns the Entra oid as ownerId when the request carries an oid claim on auth.payload', () => {
    vi.stubEnv('ADVISOR_DEMO_MODE', 'false');
    const req = makeReq({ auth: { payload: { oid: 'entra-oid-abc123' } } });

    const result: CallerIdentity = resolveCallerId(req);

    expect(result.ownerId).toBe('entra-oid-abc123');
    expect(result.isDemo).toBe(false);
  });

  // AC-15: demo mode bypasses Entra sign-in; demo sessions are isolated
  it('returns an opaque demo id when ADVISOR_DEMO_MODE is true and no oid is present', () => {
    vi.stubEnv('ADVISOR_DEMO_MODE', 'true');
    const req = makeReq({});

    const result: CallerIdentity = resolveCallerId(req);

    expect(typeof result.ownerId).toBe('string');
    expect(result.ownerId.length).toBeGreaterThan(0);
    expect(result.isDemo).toBe(true);
  });

  // AC-07 / AC-15: the agent must never process unauthenticated traffic in production
  it('throws when no oid is present and ADVISOR_DEMO_MODE is not true', () => {
    vi.stubEnv('ADVISOR_DEMO_MODE', 'false');
    const req = makeReq({});

    expect(() => resolveCallerId(req)).toThrow();
  });

  // AC-07: demo sessions must never be co-mingled with Entra-authenticated data
  it('demo id carries a "demo::" prefix so it cannot collide with a real Entra oid', () => {
    vi.stubEnv('ADVISOR_DEMO_MODE', 'true');
    const result = resolveCallerId(makeReq({}));

    // Entra oids are GUIDs; the demo id uses a "demo::" prefix by convention
    // (see identity.ts: DEMO_OWNER_ID = "demo::anonymous")
    expect(result.ownerId).toMatch(/^demo::/);
  });

  // AC-07: secondary oid location — some JWT middleware attaches claims to req.user
  it('returns the Entra oid when the oid claim is on req.user.oid (alternative middleware convention)', () => {
    vi.stubEnv('ADVISOR_DEMO_MODE', 'false');
    const req = makeReq({ user: { oid: 'entra-oid-via-user' } });

    const result: CallerIdentity = resolveCallerId(req);

    expect(result.ownerId).toBe('entra-oid-via-user');
    expect(result.isDemo).toBe(false);
  });
});
