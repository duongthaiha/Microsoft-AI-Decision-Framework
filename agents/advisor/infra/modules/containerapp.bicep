// ============================================================
// Module: Azure Container Apps Environment + API App
//
// Hosting design (AD-01):
//   - Environment is VNet-integrated (acaSubnetId) so outbound
//     traffic to private endpoints stays on the private network.
//   - Environment internal = false: apps can have public ingress.
//   - App ingress: external = true, targetPort = 3000.
//   - User-assigned managed identity attached for ACR pull and
//     data-service access (Cosmos DB, AI Search, Key Vault).
//   - Config injected via env vars (no secrets inline).
//   - azd-service-name tag wires the app to azure.yaml.
// ============================================================

param environmentName string
param appName string
param location string
param tags object
param containerImage string
param acrLoginServer string
param managedIdentityId string
param managedIdentityClientId string
param acaSubnetId string
param logAnalyticsWorkspaceId string
param appInsightsConnectionString string
param advisorAgentMode string
param cosmosEndpoint string
param cosmosDatabaseName string
param searchEndpoint string
param searchIndexName string
@description('Azure OpenAI (Foundry) endpoint for BYOK copilot mode.')
param azureOpenAiEndpoint string = ''
@description('Azure OpenAI deployment name used as the model id in copilot mode.')
param copilotModel string = ''

@minValue(0)
param minReplicas int = 0
@minValue(1)
param maxReplicas int = 3

// Container Apps Environment (VNet-integrated, Consumption tier)
resource acaEnvironment 'Microsoft.App/managedEnvironments@2023-05-01' = {
  name: environmentName
  location: location
  tags: tags
  properties: {
    appLogsConfiguration: {
      destination: 'log-analytics'
      logAnalyticsConfiguration: {
        customerId: reference(logAnalyticsWorkspaceId, '2022-10-01').customerId
        sharedKey: listKeys(logAnalyticsWorkspaceId, '2022-10-01').primarySharedKey
      }
    }
    vnetConfiguration: {
      infrastructureSubnetId: acaSubnetId
      internal: false
    }
    zoneRedundant: false
  }
}

// Container App — @advisor/api
resource containerApp 'Microsoft.App/containerApps@2023-05-01' = {
  name: appName
  location: location
  // azd-service-name tag wires this resource to the 'api' service in azure.yaml
  tags: union(tags, { 'azd-service-name': 'api' })
  identity: {
    type: 'UserAssigned'
    userAssignedIdentities: {
      '${managedIdentityId}': {}
    }
  }
  properties: {
    managedEnvironmentId: acaEnvironment.id
    configuration: {
      // ACR pull uses managed identity — no admin credentials
      registries: [
        {
          server: acrLoginServer
          identity: managedIdentityId
        }
      ]
      ingress: {
        external: true
        targetPort: 3000
        transport: 'http'
        corsPolicy: {
          allowedOrigins: ['*']
          allowedMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS']
          allowedHeaders: ['*']
        }
      }
    }
    template: {
      containers: [
        {
          name: 'advisor-api'
          image: containerImage
          resources: {
            cpu: json('0.5')
            memory: '1Gi'
          }
          env: [
            // Runtime config — no secrets inline
            {
              name: 'PORT'
              value: '3000'
            }
            {
              name: 'NODE_ENV'
              value: 'production'
            }
            {
              name: 'ADVISOR_AGENT_MODE'
              value: advisorAgentMode
            }
            // Managed identity client ID (required for DefaultAzureCredential disambiguation
            // when multiple identities are attached)
            {
              name: 'AZURE_CLIENT_ID'
              value: managedIdentityClientId
            }
            // Cosmos DB
            {
              name: 'COSMOS_ENDPOINT'
              value: cosmosEndpoint
            }
            {
              name: 'COSMOS_DATABASE'
              value: cosmosDatabaseName
            }
            // Azure AI Search
            {
              name: 'SEARCH_ENDPOINT'
              value: searchEndpoint
            }
            {
              name: 'SEARCH_INDEX'
              value: searchIndexName
            }
            // Azure AI Foundry (Azure OpenAI) — LLM for copilot mode (BYOK via managed identity)
            {
              name: 'AZURE_OPENAI_ENDPOINT'
              value: azureOpenAiEndpoint
            }
            {
              name: 'ADVISOR_COPILOT_MODEL'
              value: copilotModel
            }
            // Application Insights
            {
              name: 'APPLICATIONINSIGHTS_CONNECTION_STRING'
              value: appInsightsConnectionString
            }
          ]
          probes: [
            {
              type: 'Liveness'
              httpGet: {
                path: '/health'
                port: 3000
              }
              initialDelaySeconds: 10
              periodSeconds: 30
              failureThreshold: 3
            }
            {
              type: 'Readiness'
              httpGet: {
                path: '/health'
                port: 3000
              }
              initialDelaySeconds: 5
              periodSeconds: 10
              failureThreshold: 3
            }
          ]
        }
      ]
      scale: {
        minReplicas: minReplicas
        maxReplicas: maxReplicas
        rules: [
          {
            name: 'http-scaling'
            http: {
              metadata: {
                concurrentRequests: '20'
              }
            }
          }
        ]
      }
    }
  }
}

output appName string = containerApp.name
output appId string = containerApp.id
output fqdn string = containerApp.properties.configuration.ingress.fqdn
output environmentId string = acaEnvironment.id
output environmentName string = acaEnvironment.name
