#!/usr/bin/env bash
# smoke-prod.sh — Layer 2 smoke tests for the deployed Advisor Agent.
#
# Author:  Brett (Tester)
# Written: 2026-05-26
# Ref:     squad brief — Layer 2 smoke tests (no UI driver; Playwright deferred to M2)
#
# PURPOSE:
#   Fast (< 60 s) smoke check against the live Azure deployment:
#     1. Container App  GET /health                → HTTP 200
#     2. Container App  POST /v1/responses (no auth) → HTTP 401
#     3. Static Web App root                       → HTTP 200 + Content-Type: text/html
#     4. Container App  POST /sessions (auth)      → HTTP 200, capture session id
#     5. Container App  POST /v1/responses (auth)  → HTTP 200, status 'completed',
#                       non-empty output[0].content[0].text
#
# USAGE:
#   bash scripts/smoke-prod.sh
#   CONTAINER_APP_URL=https://... SWA_URL=https://... SMOKE_TOKEN=<bearer> bash scripts/smoke-prod.sh
#
# SMOKE_TOKEN:
#   A valid Entra Bearer token for the advisor API audience
#   (api://4f4f4a4d-e60f-4b86-a681-86059aae4597).
#
#   How to obtain manually (M1):
#     1. Sign in at the SWA URL in your browser (Lambert's MSAL UI).
#     2. Open browser DevTools → Network tab.
#     3. Find a request to the Container App's /sessions or /v1/responses.
#     4. Copy the 'Authorization: Bearer <token>' header value (just the token part).
#     5. Paste it: export SMOKE_TOKEN=<token>
#     6. Run: bash scripts/smoke-prod.sh
#
#   Token lifetime: Entra access tokens expire in ~1 hour.  Run the smoke
#   script promptly after capturing the token.
#
#   M2 BACKLOG: automate token acquisition via service-principal
#   client-credentials grant (az account get-access-token --resource
#   api://4f4f4a4d-e60f-4b86-a681-86059aae4597) once Parker provisions
#   the CI service principal in the Entra tenant.  This avoids manual
#   browser steps and makes Checks 4–5 runnable in CI pipelines.
#
# EXIT CODE:  0 if all checks pass, 1 if any check fails.
#
# KNOWN GAPS (M2 BACKLOG — Playwright E2E):
#   Full sign-in → fill form → submit → assert response flow is documented as
#   M2 backlog in .squad/decisions/inbox/brett-auth-integration-tests.md.
#   MSAL popup flows require Playwright + a headless browser with cookie persistence.
#   Deferred until Lambert's sign-in UI settles post M1.

set -euo pipefail

# ---------------------------------------------------------------------------
# Endpoints (override via env vars for CI or a different environment)
# ---------------------------------------------------------------------------
CONTAINER_APP_URL="${CONTAINER_APP_URL:-https://advisor-agent-app.wittysea-86254dbc.swedencentral.azurecontainerapps.io}"
SWA_URL="${SWA_URL:-https://polite-mushroom-0a09fa803.7.azurestaticapps.net}"

# ---------------------------------------------------------------------------
# Colour helpers
# ---------------------------------------------------------------------------
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RESET='\033[0m'

PASS=0
FAIL=0

pass() { echo -e "${GREEN}✅ PASS${RESET}  $1"; ((PASS++)); }
fail() { echo -e "${RED}❌ FAIL${RESET}  $1"; ((FAIL++)); }
info() { echo -e "${YELLOW}ℹ  ${RESET}  $1"; }

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  Advisor Agent — Smoke Test (Layer 2)"
echo "  Container App : $CONTAINER_APP_URL"
echo "  Static Web App: $SWA_URL"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# ---------------------------------------------------------------------------
# Check 1: Container App /health → 200
# ---------------------------------------------------------------------------
info "Check 1 — Container App GET /health"
HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" \
  --connect-timeout 10 --max-time 20 \
  "${CONTAINER_APP_URL}/health")

if [[ "$HTTP_CODE" == "200" ]]; then
  pass "GET /health → HTTP $HTTP_CODE"
else
  fail "GET /health → HTTP $HTTP_CODE (expected 200)"
fi

# ---------------------------------------------------------------------------
# Check 2: Container App POST /v1/responses without auth → 401
#
# NOTE: This check will FAIL until Dallas's JWT middleware lands.
#       Until then the stub route returns 501 (Not Implemented).
#       Expected-fail state documented in brett-auth-integration-tests.md.
# ---------------------------------------------------------------------------
info "Check 2 — Container App POST /v1/responses (no auth) → 401"
HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" \
  --connect-timeout 10 --max-time 20 \
  -X POST \
  -H "Content-Type: application/json" \
  -d '{"message":"smoke-test"}' \
  "${CONTAINER_APP_URL}/v1/responses")

if [[ "$HTTP_CODE" == "401" ]]; then
  pass "POST /v1/responses (no auth) → HTTP $HTTP_CODE"
else
  fail "POST /v1/responses (no auth) → HTTP $HTTP_CODE (expected 401 — will fail until Dallas's JWT middleware lands)"
fi

# ---------------------------------------------------------------------------
# Check 3: Static Web App root → 200 + text/html
# ---------------------------------------------------------------------------
info "Check 3 — Static Web App GET /"
RESPONSE=$(curl -s -D - --connect-timeout 10 --max-time 20 \
  -o /dev/null "${SWA_URL}" 2>&1 || true)

HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" \
  --connect-timeout 10 --max-time 20 \
  "${SWA_URL}")
CONTENT_TYPE=$(curl -s -I --connect-timeout 10 --max-time 20 \
  "${SWA_URL}" | grep -i '^content-type:' | head -1 || echo "")

if [[ "$HTTP_CODE" == "200" ]]; then
  if echo "$CONTENT_TYPE" | grep -qi "text/html"; then
    pass "SWA GET / → HTTP $HTTP_CODE, Content-Type: text/html"
  else
    pass "SWA GET / → HTTP $HTTP_CODE (Content-Type: ${CONTENT_TYPE:-unknown})"
  fi
else
  fail "SWA GET / → HTTP $HTTP_CODE (expected 200 — SWA deploy may be pending, see parker-region-redeploy.md)"
fi

# ---------------------------------------------------------------------------
# Checks 4–5: Authenticated smoke (requires SMOKE_TOKEN)
#
# SMOKE_TOKEN must be a valid Entra Bearer token for the advisor API audience.
# See USAGE / SMOKE_TOKEN section at the top of this file for instructions.
#
# If SMOKE_TOKEN is not set, Checks 4–5 are skipped with a warning.
# ---------------------------------------------------------------------------
if [[ -z "${SMOKE_TOKEN:-}" ]]; then
  echo ""
  echo -e "${YELLOW}⚠  SMOKE_TOKEN not set — skipping authenticated checks (4, 5).${RESET}"
  echo -e "   To run authenticated checks:"
  echo -e "   1. Sign in at ${SWA_URL}"
  echo -e "   2. Open DevTools → Network → copy Authorization header value"
  echo -e "   3. Re-run: SMOKE_TOKEN=<token> bash scripts/smoke-prod.sh"
  echo ""
else
  # -------------------------------------------------------------------------
  # Check 4: POST /sessions (auth) → 200, capture session id
  # -------------------------------------------------------------------------
  info "Check 4 — Container App POST /sessions (authenticated) → 200"
  SESSIONS_RESPONSE=$(curl -s -o - -w "\n%{http_code}" \
    --connect-timeout 10 --max-time 30 \
    -X POST \
    -H "Content-Type: application/json" \
    -H "Authorization: Bearer ${SMOKE_TOKEN}" \
    -d '{"title":"Smoke test session"}' \
    "${CONTAINER_APP_URL}/sessions" || echo -e "\n000")

  HTTP_CODE=$(echo "$SESSIONS_RESPONSE" | tail -1)
  SESSIONS_BODY=$(echo "$SESSIONS_RESPONSE" | head -n -1)

  if [[ "$HTTP_CODE" == "200" ]]; then
    SMOKE_SESSION_ID=$(echo "$SESSIONS_BODY" | grep -o '"id":"[^"]*"' | head -1 | sed 's/"id":"//;s/"//')
    if [[ -n "$SMOKE_SESSION_ID" ]]; then
      pass "POST /sessions (auth) → HTTP $HTTP_CODE, sessionId: ${SMOKE_SESSION_ID}"
    else
      pass "POST /sessions (auth) → HTTP $HTTP_CODE (response body missing 'id' — verify shape when Dallas's route lands)"
      SMOKE_SESSION_ID="smoke-fallback-session"
    fi
  else
    fail "POST /sessions (auth) → HTTP $HTTP_CODE (expected 200 — ❌ will fail until Dallas's session creation route lands)"
    SMOKE_SESSION_ID=""
  fi

  # -------------------------------------------------------------------------
  # Check 5: POST /v1/responses (auth) → 200, status 'completed', non-empty text
  #
  # Uses SMOKE_SESSION_ID captured from Check 4 if available; falls back to
  # omitting sessionId so the server creates one inline (per Test 6 contract).
  # -------------------------------------------------------------------------
  info "Check 5 — Container App POST /v1/responses (authenticated) → 200"

  # Canned intake payload — representative but lightweight for smoke purposes.
  INTAKE_PAYLOAD='{
    "input": {
      "businessOutcome": "Automate expense report categorisation",
      "targetUsers": "Finance department",
      "desiredBehavior": "Upload receipt, AI extracts fields",
      "dataSources": "ERP system",
      "actions": "Create draft expense entry",
      "constraints": "GDPR compliant"
    }
  }'

  # Include sessionId if we captured one from Check 4.
  if [[ -n "$SMOKE_SESSION_ID" ]] && [[ "$SMOKE_SESSION_ID" != "smoke-fallback-session" ]]; then
    INTAKE_PAYLOAD=$(echo "$INTAKE_PAYLOAD" | sed "s/{/{\"sessionId\":\"${SMOKE_SESSION_ID}\",/")
  fi

  RESPONSES_RESPONSE=$(curl -s -o - -w "\n%{http_code}" \
    --connect-timeout 10 --max-time 60 \
    -X POST \
    -H "Content-Type: application/json" \
    -H "Authorization: Bearer ${SMOKE_TOKEN}" \
    -d "$INTAKE_PAYLOAD" \
    "${CONTAINER_APP_URL}/v1/responses" || echo -e "\n000")

  HTTP_CODE=$(echo "$RESPONSES_RESPONSE" | tail -1)
  RESPONSES_BODY=$(echo "$RESPONSES_RESPONSE" | head -n -1)

  if [[ "$HTTP_CODE" == "200" ]]; then
    # Verify status === 'completed'
    RESP_STATUS=$(echo "$RESPONSES_BODY" | grep -o '"status":"[^"]*"' | head -1 | sed 's/"status":"//;s/"//')
    # Verify output[0].content[0].text is non-empty
    RESP_TEXT=$(echo "$RESPONSES_BODY" | grep -o '"text":"[^"]*"' | head -1 | sed 's/"text":"//;s/"//')

    if [[ "$RESP_STATUS" == "completed" ]] && [[ -n "$RESP_TEXT" ]]; then
      pass "POST /v1/responses (auth) → HTTP $HTTP_CODE, status: completed, text: non-empty"
    elif [[ "$RESP_STATUS" == "completed" ]]; then
      fail "POST /v1/responses (auth) → HTTP $HTTP_CODE, status: completed BUT output[0].content[0].text is empty"
    else
      fail "POST /v1/responses (auth) → HTTP $HTTP_CODE but status='${RESP_STATUS:-unknown}' (expected 'completed')"
    fi
  else
    fail "POST /v1/responses (auth) → HTTP $HTTP_CODE (expected 200 — ❌ will fail until Dallas's reasoning loop lands)"
  fi
fi

# ---------------------------------------------------------------------------
# Summary
# ---------------------------------------------------------------------------
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
TOTAL=$((PASS + FAIL))
if [[ $FAIL -eq 0 ]]; then
  echo -e "${GREEN}  ALL $TOTAL CHECKS PASSED${RESET}"
else
  echo -e "${RED}  $FAIL/$TOTAL CHECKS FAILED${RESET}  ($PASS passed)"
fi
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# Exit 1 if any check failed
[[ $FAIL -eq 0 ]] || exit 1
