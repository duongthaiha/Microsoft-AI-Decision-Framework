# Operational Runbook

> M0: Placeholder with TOC and section headers. Detailed procedures fill in during M1 and M2.

## Table of Contents

1. [Healthcheck and Liveness](#healthcheck-and-liveness)
2. [Common Failures](#common-failures)
3. [Cosmos RBAC Verification](#cosmos-rbac-verification)
4. [AI Search Outage](#ai-search-outage)
5. [Demo Mode Toggle](#demo-mode-toggle)
6. [Submission Write Failure Recovery](#submission-write-failure-recovery)
7. [Auditing Admin Access](#auditing-admin-access)

---

## Healthcheck and Liveness

**What to monitor:** Hosted Agent endpoint availability, Cosmos DB latency, AI Search availability, Managed Identity token acquisition, Entra sign-in endpoint.

<!-- M1: fill in -->

---

## Common Failures

**Symptom:** User can sign in but cannot create a session.

<!-- M1: fill in -->

**Symptom:** Similarity search returns no results or times out.

<!-- M1: fill in -->

**Symptom:** Request submission fails with "Cosmos DB write error."

<!-- M1: fill in -->

**Symptom:** Admin cannot access the Org Context editor.

<!-- M1: fill in -->

---

## Cosmos RBAC Verification

**Procedure:** Verify that the Hosted Agent identity has the correct Azure RBAC role assignments for Cosmos DB.

<!-- M1: fill in -->

**Expected outcome:** Agent can read all containers, write to `sessions/requests`, read from `projects/org-context`.

<!-- M1: fill in -->

---

## AI Search Outage

**Symptom:** Step 1b reuse gate returns "similarity search unavailable."

**Impact:** Users proceed without project similarity matching; recommendations may duplicate existing work.

<!-- M1: fill in -->

**Recovery:** Check Azure AI Search service health in the portal. Restart the search service if needed. Notify users of the outage.

<!-- M1: fill in -->

---

## Demo Mode Toggle

**Purpose:** Enable/disable Entra sign-in for testing.

**Location:** Environment variable `DEMO_FLAG` in `azure.yaml` or AZD env config.

<!-- M1: fill in -->

**Warning:** Demo mode must be disabled before production. Verify in deployment logs.

<!-- M1: fill in -->

---

## Submission Write Failure Recovery

**Scenario:** User confirms submission, but the Cosmos DB write fails partway through.

**Recovery:** Check the Request status in Cosmos DB. If `status: Draft` or `status: ReadyForConfirmation`, the user can retry submission. If `status: New` but Change Feed consumer did not pick it up, manually trigger the consumer or notify the downstream team.

<!-- M1: fill in -->

---

## Auditing Admin Access

**Purpose:** Review who accessed admin endpoints and what they viewed.

**Data source:** Application Insights audit logs.

**Queries:**
- Admin sign-in events: Filter by operation type = "admin_signin"
- Requests list view: Filter by operation type = "admin_requests_list"
- Request detail view: Filter by operation type = "admin_request_detail", group by `requestId` and `ownerId`

<!-- M1: fill in -->

---

## Escalation

- **Cosmos DB issues:** Contact Azure Cosmos DB support
- **AI Search issues:** Check Search service health, contact Azure Search support
- **Entra sign-in issues:** Contact Entra Identity support or your tenant admin
- **Foundry Hosted Agent issues:** Contact Microsoft Foundry support (once available)

See [docs/admin-guide.md](./admin-guide.md) for admin-specific procedures.
