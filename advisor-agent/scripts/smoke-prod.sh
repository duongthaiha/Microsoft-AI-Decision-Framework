#!/usr/bin/env bash
# smoke-prod.sh — Layer 2 smoke tests for the deployed Advisor Agent.
#
# Author:  Brett (Tester)
# Written: 2026-05-26T22:52:00Z
# Ref:     squad brief — Layer 2 smoke tests (no UI driver; Playwright deferred to M2)
#
# PURPOSE:
#   Fast (< 30 s) smoke check against the live Azure deployment:
#     1. Container App  GET /health       → HTTP 200
#     2. Container App  POST /v1/responses (no auth) → HTTP 401
#     3. Static Web App root              → HTTP 200 + Content-Type: text/html
#
# USAGE:
#   bash scripts/smoke-prod.sh
#   CONTAINER_APP_URL=https://... SWA_URL=https://... bash scripts/smoke-prod.sh
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
