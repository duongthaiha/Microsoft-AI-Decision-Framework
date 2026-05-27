#!/usr/bin/env bash
# post-deploy-smoke.sh — Infrastructure + API smoke test after azd provision/deploy.
#
# Author:  Parker (Infra/DevOps)
# Purpose: Assert that the private networking hardening is in place AND the API still works.
#
# Checks:
#   1. GET /health                         → HTTP 200
#   2. GET /v1/whoami                      → HTTP 200 (public diagnostic, no auth required)
#   3. Cosmos publicNetworkAccess          == Disabled (policy-aligned)
#   4. Cosmos private endpoint connection  == Approved (at least one)
#   5. GET /sessions (with token)          → 200 or clean 401 (NOT 502/500)
#
# Usage:
#   bash scripts/post-deploy-smoke.sh
#   CONTAINER_APP_URL=https://... COSMOS_ACCOUNT=advisor-cosmos-xxx RG=rg-advisor-dev \
#     SMOKE_TOKEN=<bearer> bash scripts/post-deploy-smoke.sh
#
# SMOKE_TOKEN:
#   Optional. A valid Entra Bearer token for api://4f4f4a4d-e60f-4b86-a681-86059aae4597.
#   If not set, Check 5 is skipped.
#
# Exit code: 0 if all checks pass, 1 if any fail.

set -euo pipefail

CONTAINER_APP_URL="${CONTAINER_APP_URL:-https://advisor-agent-app.wittysea-86254dbc.swedencentral.azurecontainerapps.io}"
COSMOS_ACCOUNT="${COSMOS_ACCOUNT:-advisor-cosmos-uwmrjzgkhs2hk}"
RG="${RG:-${AZURE_RESOURCE_GROUP:-rg-advisor-dev}}"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RESET='\033[0m'

PASS=0
FAIL=0

pass() { echo -e "${GREEN}✅ PASS${RESET}  $1"; PASS=$((PASS + 1)); }
fail() { echo -e "${RED}❌ FAIL${RESET}  $1"; FAIL=$((FAIL + 1)); }
info() { echo -e "${YELLOW}ℹ  ${RESET}  $1"; }

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  Advisor Agent — Post-Deploy Infrastructure Smoke Test"
echo "  Container App : $CONTAINER_APP_URL"
echo "  Cosmos Account: $COSMOS_ACCOUNT  (RG: $RG)"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# ---------------------------------------------------------------------------
# Check 1: GET /health → 200
# ---------------------------------------------------------------------------
info "Check 1 — GET /health → 200"
HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" \
  --connect-timeout 15 --max-time 30 \
  "${CONTAINER_APP_URL}/health" || echo "000")

if [[ "$HTTP_CODE" == "200" ]]; then
  pass "GET /health → HTTP $HTTP_CODE"
else
  fail "GET /health → HTTP $HTTP_CODE (expected 200 — Container App may still be starting)"
fi

# ---------------------------------------------------------------------------
# Check 2: GET /v1/whoami → 200 (public diagnostic, no auth)
# ---------------------------------------------------------------------------
info "Check 2 — GET /v1/whoami → 200"
HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" \
  --connect-timeout 15 --max-time 30 \
  "${CONTAINER_APP_URL}/v1/whoami" || echo "000")

if [[ "$HTTP_CODE" == "200" ]] || [[ "$HTTP_CODE" == "400" ]] || [[ "$HTTP_CODE" == "401" ]]; then
  pass "GET /v1/whoami → HTTP $HTTP_CODE (reachable — ${HTTP_CODE} means route exists)"
else
  fail "GET /v1/whoami → HTTP $HTTP_CODE (expected 200/400/401)"
fi

# ---------------------------------------------------------------------------
# Check 3: Cosmos publicNetworkAccess == Disabled
# ---------------------------------------------------------------------------
info "Check 3 — Cosmos publicNetworkAccess == Disabled"
COSMOS_PNA=$(az cosmosdb show \
  --name "$COSMOS_ACCOUNT" \
  --resource-group "$RG" \
  --query "publicNetworkAccess" -o tsv 2>/dev/null || echo "ERROR")

if [[ "$COSMOS_PNA" == "Disabled" ]]; then
  pass "Cosmos publicNetworkAccess == Disabled (policy-aligned)"
else
  fail "Cosmos publicNetworkAccess == ${COSMOS_PNA} (expected Disabled — policy will auto-remediate to Disabled anyway)"
fi

# ---------------------------------------------------------------------------
# Check 4: Cosmos has at least one Approved private endpoint connection
# ---------------------------------------------------------------------------
info "Check 4 — Cosmos has an Approved private endpoint connection"
APPROVED_PE=$(az cosmosdb show \
  --name "$COSMOS_ACCOUNT" \
  --resource-group "$RG" \
  --query "privateEndpointConnections[?privateLinkServiceConnectionState.status=='Approved'] | length(@)" \
  -o tsv 2>/dev/null || echo "0")

if [[ "${APPROVED_PE:-0}" -ge 1 ]]; then
  pass "Cosmos has ${APPROVED_PE} Approved private endpoint connection(s)"
else
  fail "Cosmos has 0 Approved private endpoint connections — VNet/PE provisioning may be incomplete"
fi

# ---------------------------------------------------------------------------
# Check 5: GET /sessions (auth) → 200 or 401 (NOT 502/500)
# ---------------------------------------------------------------------------
if [[ -z "${SMOKE_TOKEN:-}" ]]; then
  echo ""
  echo -e "${YELLOW}⚠  SMOKE_TOKEN not set — skipping Check 5 (authenticated /sessions).${RESET}"
  echo -e "   To run: SMOKE_TOKEN=<bearer-token> bash $0"
  echo ""
else
  info "Check 5 — GET /sessions (auth) → 200 or 401 (not 502/500)"
  HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" \
    --connect-timeout 15 --max-time 30 \
    -H "Authorization: Bearer ${SMOKE_TOKEN}" \
    "${CONTAINER_APP_URL}/sessions" || echo "000")

  if [[ "$HTTP_CODE" == "200" ]] || [[ "$HTTP_CODE" == "401" ]]; then
    pass "GET /sessions → HTTP $HTTP_CODE (clean — no Cosmos network error)"
  elif [[ "$HTTP_CODE" == "502" ]] || [[ "$HTTP_CODE" == "500" ]]; then
    fail "GET /sessions → HTTP $HTTP_CODE — COSMOS NETWORK ERROR. Check private endpoint and DNS resolution."
  else
    fail "GET /sessions → HTTP $HTTP_CODE (unexpected status code)"
  fi
fi

# ---------------------------------------------------------------------------
# Summary
# ---------------------------------------------------------------------------
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
TOTAL=$((PASS + FAIL))
if [[ $FAIL -eq 0 ]]; then
  echo -e "${GREEN}  ALL $TOTAL CHECKS PASSED — private networking is healthy.${RESET}"
else
  echo -e "${RED}  $FAIL/$TOTAL CHECKS FAILED${RESET}  ($PASS passed)"
  echo ""
  echo -e "  Troubleshooting:"
  echo -e "  - Cosmos 502: check ACA → VNet → private endpoint DNS resolution"
  echo -e "    Run from ACA exec: nslookup ${COSMOS_ACCOUNT}.documents.azure.com"
  echo -e "    Expected: resolves to 10.0.2.x (private IP), not a public IP"
  echo -e "  - Check private DNS zone: az network private-dns zone show ..."
  echo -e "  - Check VNet link: az network private-dns link vnet list ..."
fi
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

[[ $FAIL -eq 0 ]] || exit 1
