/*
  staticwebapp.bicep — Azure Static Web App for the advisor React frontend.

  Free tier is sufficient for M0/M1 demo workloads (100 GB bandwidth/month,
  custom domains, preview environments).

  AZD deploys the React SPA bundle to this resource via `azd deploy web`.
  The deployment token is fetched at deploy-time by AZD (not stored in code).

  Docs:
    https://learn.microsoft.com/azure/static-web-apps/overview
    https://learn.microsoft.com/azure/static-web-apps/get-started-cli
*/

@description('Prefix for the resource name.')
param namePrefix string

@description('Azure region for the Static Web App.')
param location string

@description('Resource tags.')
param tags object

// ---------------------------------------------------------------------------
// Static Web App
// ---------------------------------------------------------------------------

resource swa 'Microsoft.Web/staticSites@2023-01-01' = {
  name: '${namePrefix}-web-${uniqueString(resourceGroup().id)}'
  location: location
  // azd-service-name tag is required for AZD to discover this SWA
  // when running `azd deploy web`.
  tags: union(tags, { 'azd-service-name': 'web' })
  sku: {
    name: 'Free'
    tier: 'Free'
  }
  properties: {
    stagingEnvironmentPolicy: 'Enabled'
    allowConfigFileUpdates: true
    buildProperties: {
      skipGithubActionWorkflowGeneration: true
    }
  }
}

// ---------------------------------------------------------------------------
// Outputs
// ---------------------------------------------------------------------------

output staticWebAppName string = swa.name
output staticWebAppId string = swa.id
output staticWebAppUrl string = 'https://${swa.properties.defaultHostname}'
output defaultHostname string = swa.properties.defaultHostname
