/*
  container-apps.bicep — Container Apps Environment + Container App for the advisor agent.

  The Container App starts with a public Microsoft hello-world placeholder image
  so the first `azd provision` succeeds even before the Docker image is built.
  `azd deploy` overwrites it with the real advisor image from ACR.

  Managed identity is used for ACR pull (no admin credentials).
  App Insights connection string is injected via environment variable.

  Docs:
    https://learn.microsoft.com/azure/container-apps/overview
    https://learn.microsoft.com/azure/container-apps/managed-identity
*/

@description('Prefix for all resource names.')
param namePrefix string

@description('Azure region.')
param location string

@description('Resource tags.')
param tags object

@description('ACR login server (e.g. advisoracrXXXX.azurecr.io).')
param containerRegistryLoginServer string

@description('Resource ID of the user-assigned managed identity for the Container App.')
param agentIdentityId string

@description('Client ID of the user-assigned managed identity (for AZURE_CLIENT_ID env var).')
param agentIdentityClientId string

@description('Application Insights connection string.')
param appInsightsConnectionString string

@description('Cosmos DB endpoint URL (injected into app env).')
param cosmosEndpoint string

@description('Azure AI Search endpoint URL (injected into app env).')
param searchEndpoint string

@description('Azure OpenAI endpoint URL (injected into app env). Empty string skips injection.')
param aoaiEndpoint string = ''

@description('Enable demo mode (bypass JWT validation). Must be false in production.')
param demoMode bool = false

@description('Entra tenant ID for JWT validation.')
param entraTenantId string = ''

@description('Entra API audience (api://{appId}) for JWT validation.')
param entraApiAudience string = ''

// ---------------------------------------------------------------------------
// Container Apps Environment (Consumption plan — pay-per-use)
// ---------------------------------------------------------------------------

resource cae 'Microsoft.App/managedEnvironments@2024-03-01' = {
  name: '${namePrefix}-cae-${uniqueString(resourceGroup().id)}'
  location: location
  tags: tags
  properties: {
    zoneRedundant: false
  }
}

// ---------------------------------------------------------------------------
// Container App
// ---------------------------------------------------------------------------

resource containerApp 'Microsoft.App/containerApps@2024-03-01' = {
  name: '${namePrefix}-agent-app'
  location: location
  // azd-service-name tag is required for AZD to discover this Container App
  // when running `azd deploy agent`.
  tags: union(tags, { 'azd-service-name': 'agent' })
  identity: {
    type: 'UserAssigned'
    userAssignedIdentities: {
      '${agentIdentityId}': {}
    }
  }
  properties: {
    managedEnvironmentId: cae.id
    configuration: {
      ingress: {
        external: true
        targetPort: 8080
        transport: 'http'
        allowInsecure: false
      }
      registries: [
        {
          server: containerRegistryLoginServer
          identity: agentIdentityId
        }
      ]
    }
    template: {
      containers: [
        {
          // Placeholder image; `azd deploy` replaces this with the real advisor image.
          name: '${namePrefix}-agent'
          image: 'mcr.microsoft.com/azuredocs/containerapps-helloworld:latest'
          resources: {
            cpu: json('0.5')
            memory: '1Gi'
          }
          env: [
            {
              name: 'APPLICATIONINSIGHTS_CONNECTION_STRING'
              value: appInsightsConnectionString
            }
            {
              name: 'AZURE_CLIENT_ID'
              value: agentIdentityClientId
            }
            {
              name: 'COSMOS_ENDPOINT'
              value: cosmosEndpoint
            }
            {
              name: 'SEARCH_ENDPOINT'
              value: searchEndpoint
            }
            {
              name: 'AOAI_ENDPOINT'
              value: aoaiEndpoint
            }
            {
              name: 'ADVISOR_DEMO_MODE'
              value: demoMode ? 'true' : 'false'
            }
            {
              name: 'ENTRA_TENANT_ID'
              value: entraTenantId
            }
            {
              name: 'ENTRA_API_AUDIENCE'
              value: entraApiAudience
            }
            {
              name: 'NODE_ENV'
              value: 'production'
            }
          ]
        }
      ]
      scale: {
        minReplicas: 0
        maxReplicas: 3
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Outputs
// ---------------------------------------------------------------------------

output caeName string = cae.name
output caeId string = cae.id
output caeDefaultDomain string = cae.properties.defaultDomain

output containerAppName string = containerApp.name
output containerAppId string = containerApp.id
// FQDN is only available after deploy; compute from CAE domain as a convenience.
output containerAppUrl string = 'https://${containerApp.properties.configuration.ingress.fqdn}'
