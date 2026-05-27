#!/usr/bin/env bash
# pre-provision.sh — One-time migration: delete Consumption CAE before VNet-integrated CAE is created.
#
# Context:
#   Azure Container Apps does not allow adding vnetConfiguration to an existing
#   Consumption environment (error: "VnetConfigurationUpdateNotAllowed").
#   This script detects the old Consumption CAE (name: advisor-cae-{hash})
#   and deletes it — along with any Container Apps in it — so that
#   azd provision can create the new VNet-integrated CAE (advisor-cae-vnet-{hash}).
#
#   Subsequent runs are idempotent: if no old Consumption CAE exists, the script exits 0.
#
# VITE_API_BASE_URL note:
#   After migration the Container App FQDN changes because the CAE domain changes.
#   Update VITE_API_BASE_URL in the GitHub Actions variable (or your .env file) with
#   the new CONTAINER_APP_URL output from `azd env get-values`.
#
# Docs:
#   https://learn.microsoft.com/azure/container-apps/vnet-custom

set -euo pipefail

RG="${AZURE_RESOURCE_GROUP:-rg-advisor-dev}"

echo "pre-provision: checking for old Consumption CAE in resource group ${RG}..."

# List CAEs whose names start with "advisor-cae-" but NOT "advisor-cae-vnet-"
# (the VNet-integrated variant has "-vnet-" in the name).
OLD_ENVS=$(az containerapp env list \
  --resource-group "$RG" \
  --query "[?starts_with(name,'advisor-cae-') && !contains(name,'-vnet-')].name" \
  -o tsv 2>/dev/null || true)

if [[ -z "$OLD_ENVS" ]]; then
  echo "pre-provision: no old Consumption CAE found — nothing to migrate."
  exit 0
fi

for OLD_CAE in $OLD_ENVS; do
  echo "pre-provision: found old Consumption CAE '${OLD_CAE}' — migrating to VNet-integrated CAE."

  # Delete Container Apps in this environment first.
  APPS=$(az containerapp list \
    --resource-group "$RG" \
    --environment "$OLD_CAE" \
    --query "[].name" -o tsv 2>/dev/null || true)

  for APP in $APPS; do
    echo "pre-provision: deleting Container App '${APP}'..."
    az containerapp delete --name "$APP" --resource-group "$RG" --yes 2>/dev/null || true
  done

  echo "pre-provision: deleting old CAE '${OLD_CAE}'..."
  az containerapp env delete --name "$OLD_CAE" --resource-group "$RG" --yes 2>/dev/null || true
  echo "pre-provision: old CAE '${OLD_CAE}' deleted."
done

echo "pre-provision: migration complete — azd provision will create the VNet-integrated CAE."
