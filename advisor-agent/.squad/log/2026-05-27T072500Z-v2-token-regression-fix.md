# Session Log: V2 Token Regression Fix

**Date:** 2026-05-27T07:22:12Z  
**Duration:** ~3 minutes  
**Status:** Complete ✅  

## Problem

`GET /sessions` returned 401 after Ha re-signed in. Root cause: JWT middleware only accepted Entra v2 issuer (`login.microsoftonline.com/{tenantId}/v2.0`), but Entra was propagating v1 issuer (`sts.windows.net/{tenantId}/`) during token version transition.

## Solution

1. **Dual-issuer acceptance:** Updated `jwt-middleware.ts` to accept both v1 and v2 issuer formats via `jose`'s `issuer: string[]` parameter.
2. **Diagnostic logging:** Added decoded token fields (iss, aud, ver, scp, alg, kid) to stderr on verification failure.
3. **azure.yaml fix:** Removed `VITE_ADVISOR_DEMO_MODE=true` from web predeploy hook; added real Entra config vars.

## Deployment

- Revision: `advisor-agent-app--0000005`
- Tests: 30/30 passing (4 new dual-issuer tests added)
- Affected agents: Dallas (backend), Lambert (frontend), Parker (infra)

## Cross-Agent Notification

Lambert and Parker notified via history.md append that JWT middleware now accepts both v1 and v2 issuers—prevents future re-introduction of strict v2-only validation.
