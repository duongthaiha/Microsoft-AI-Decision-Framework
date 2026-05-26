/**
 * Smoke tests for agent/src/data/models.ts canonical document shapes.
 *
 * These tests are the living contract between Brett (tests) and Dallas (data layer).
 * If partition-key field names change, these tests break — intentionally.
 * They also document the compile-time constraints: every sample object must satisfy
 * the interface at compile time or the build fails.
 *
 * Cosmos DB partition-key layout (from spec §7 and infra/modules/cosmos.bicep):
 *   sessions    → /ownerId   (Session, Request)
 *   requests    → /ownerId
 *   projects    → /projectId
 *   org-context → /orgId
 *
 * https://learn.microsoft.com/azure/cosmos-db/nosql/
 *
 * AC-05: the advisor captures each intake/framework answer against a Request stored in Cosmos DB
 * AC-06: a signed-in user sees only their own sessions — partition isolation is structural
 * AC-07: Entra oid is the ownership key; demo mode uses an isolated opaque id
 */

import { describe, it, expect } from 'vitest';
import type {
  Session,
  Request,
  Project,
  OrgContext,
  ReuseGateDecision,
} from '../../../agent/src/data/models.js';

// ---------------------------------------------------------------------------
// Sample documents — satisfy the interface at compile time via `satisfies`.
// Any shape mismatch is a TypeScript error before a single test runs.
// ---------------------------------------------------------------------------

const sampleSession = {
  id: 'sess-001',
  sessionId: 'sess-001',
  ownerId: 'entra-oid-abc123',
  ownerType: 'entra' as const,
  title: 'Explore AI for HR onboarding',
  status: 'active' as const,
  createdAt: '2026-05-26T17:00:00Z',
  lastActiveAt: '2026-05-26T17:18:00Z',
  turnCount: 3,
} satisfies Session;

const sampleReuseDecision: ReuseGateDecision = {
  decision: 'pending',
  matchesPresented: [],
};

const sampleRequest = {
  id: 'req-001',
  requestId: 'req-001',
  sessionId: 'sess-001',
  ownerId: 'entra-oid-abc123',
  title: 'AI onboarding chatbot',
  businessOutcome: 'Reduce HR onboarding time by 30%',
  targetUsers: 'New hires, HR team',
  desiredBehavior: 'Answer policy questions and guide through onboarding steps',
  dataSources: 'SharePoint HR policies, HRIS',
  actions: 'answer-questions, send-email',
  constraints: 'no PII storage, EU data residency',
  frameworkAnswers: {},
  similarProjectMatches: [],
  reuseDecision: sampleReuseDecision,
  status: 'Draft' as const,
  createdAt: '2026-05-26T17:05:00Z',
  updatedAt: '2026-05-26T17:18:00Z',
} satisfies Request;

const sampleProject = {
  id: 'proj-001',
  projectId: 'proj-001',
  name: 'Employee Onboarding Pilot',
  summary: 'Copilot Studio chatbot for HR onboarding, deployed 2025',
  owner: 'hr-team@contoso.com',
  businessOutcomes: ['Reduce onboarding time by 30%'],
  userGroups: ['New hires'],
  technologies: ['Copilot Studio', 'SharePoint'],
  dataDomains: ['HR'],
  status: 'active' as const,
  linkedRequestIds: [],
  tags: [],
  createdAt: '2025-01-15T09:00:00Z',
  updatedAt: '2025-06-01T12:00:00Z',
} satisfies Project;

const sampleOrgContext = {
  id: 'org-context-v1',
  orgId: 'default',
  version: '1',
  editorId: 'admin-oid-xyz',
  editedAt: '2026-05-01T09:00:00Z',
  changeSummary: 'Initial org context — M0 scaffold',
  systemInventory: [],
  entitlements: [],
  customInstructions: [],
  published: true,
} satisfies OrgContext;

// ---------------------------------------------------------------------------
// Runtime assertions — partition-key field presence and type
// ---------------------------------------------------------------------------

describe('data model shapes', () => {
  // AC-05 / AC-06
  it('a Session document carries ownerId as its partition-key field', () => {
    expect(sampleSession).toHaveProperty('ownerId');
    expect(typeof sampleSession.ownerId).toBe('string');
  });

  // AC-05 / AC-06
  it('a Request document carries ownerId as its partition-key field', () => {
    expect(sampleRequest).toHaveProperty('ownerId');
    expect(typeof sampleRequest.ownerId).toBe('string');
  });

  it('a Project document carries projectId as its partition-key field', () => {
    expect(sampleProject).toHaveProperty('projectId');
    expect(typeof sampleProject.projectId).toBe('string');
  });

  it('an OrgContext document carries orgId as its partition-key field', () => {
    expect(sampleOrgContext).toHaveProperty('orgId');
    expect(typeof sampleOrgContext.orgId).toBe('string');
  });

  // AC-06: per-user partition isolation — Session and its Request must share ownerId
  it('a Session and its Request share the same ownerId (user-level partition boundary is structural)', () => {
    expect(sampleSession.ownerId).toBe(sampleRequest.ownerId);
  });

  // AC-07
  it('a Session ownerType is either entra or demo', () => {
    expect(['entra', 'demo']).toContain(sampleSession.ownerType);
  });

  it('an OrgContext document uses orgId "default" in the MVP single-org model', () => {
    expect(sampleOrgContext.orgId).toBe('default');
  });
});
