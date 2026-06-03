// ============================================================
// Module: Azure AI Foundry (Azure OpenAI) — GPT-5 family
//
// Provides the LLM for ADVISOR_AGENT_MODE=copilot. The GitHub
// Copilot SDK reaches this endpoint in BYOK mode using a managed
// identity bearer token (no API keys).
//
// Security posture (consistent with Cosmos DB / AI Search):
//   - Public network access DISABLED
//   - Private endpoint in pe-subnet
//   - Private DNS zone: privatelink.openai.azure.com
//   - Local (key) auth DISABLED — AAD/RBAC only
//   - RBAC: "Cognitive Services OpenAI User" assigned to the
//     managed identity in roleassignments.bicep
//
// A single model deployment (default: gpt-5) is created. The
// Copilot SDK provider uses this deployment name as the model.
// ============================================================

param accountName string
param location string
param tags object
param vnetId string
param privateEndpointSubnetId string
param logAnalyticsWorkspaceId string

@description('Azure OpenAI model to deploy (must be available in the region).')
param modelName string = 'gpt-5'

@description('Model version for the deployment.')
param modelVersion string = '2025-08-07'

@description('Deployment name — used as the model id by the Copilot SDK provider.')
param deploymentName string = 'gpt-5'

@description('Provisioned throughput (thousands of tokens/min) for the deployment.')
@minValue(1)
param modelCapacity int = 50

var privateDnsZoneName = 'privatelink.openai.azure.com'
var privateEndpointName = 'pe-${accountName}'

resource account 'Microsoft.CognitiveServices/accounts@2024-10-01' = {
  name: accountName
  location: location
  tags: tags
  kind: 'OpenAI'
  sku: {
    name: 'S0'
  }
  identity: {
    type: 'SystemAssigned'
  }
  properties: {
    // customSubDomainName is required for AAD token auth and private endpoints
    customSubDomainName: accountName
    publicNetworkAccess: 'Disabled'
    disableLocalAuth: true
    networkAcls: {
      defaultAction: 'Deny'
      ipRules: []
      virtualNetworkRules: []
    }
  }
}

// Model deployment. GlobalStandard SKU for GPT-5 family.
resource deployment 'Microsoft.CognitiveServices/accounts/deployments@2024-10-01' = {
  parent: account
  name: deploymentName
  sku: {
    name: 'GlobalStandard'
    capacity: modelCapacity
  }
  properties: {
    model: {
      format: 'OpenAI'
      name: modelName
      version: modelVersion
    }
    versionUpgradeOption: 'OnceNewDefaultVersionAvailable'
    raiPolicyName: 'Microsoft.DefaultV2'
  }
}

// Diagnostic settings
resource accountDiagnostics 'Microsoft.Insights/diagnosticSettings@2021-05-01-preview' = {
  name: 'foundry-diagnostics'
  scope: account
  properties: {
    workspaceId: logAnalyticsWorkspaceId
    logs: [
      {
        categoryGroup: 'allLogs'
        enabled: true
      }
    ]
    metrics: [
      {
        category: 'AllMetrics'
        enabled: true
      }
    ]
  }
}

// Private DNS Zone
resource privateDnsZone 'Microsoft.Network/privateDnsZones@2020-06-01' = {
  name: privateDnsZoneName
  location: 'global'
  tags: tags
}

resource dnsZoneVnetLink 'Microsoft.Network/privateDnsZones/virtualNetworkLinks@2020-06-01' = {
  name: 'link-foundry-vnet'
  parent: privateDnsZone
  location: 'global'
  properties: {
    virtualNetwork: {
      id: vnetId
    }
    registrationEnabled: false
  }
}

// Private Endpoint
resource privateEndpoint 'Microsoft.Network/privateEndpoints@2023-04-01' = {
  name: privateEndpointName
  location: location
  tags: tags
  // Depend on the model deployment so the private endpoint is created only after
  // the account has settled back to "Succeeded". Applying a deployment transiently
  // flips the account to "Accepted", and a concurrent PE create fails with
  // AccountProvisioningStateInvalid.
  dependsOn: [
    deployment
  ]
  properties: {
    subnet: {
      id: privateEndpointSubnetId
    }
    privateLinkServiceConnections: [
      {
        name: '${privateEndpointName}-conn'
        properties: {
          privateLinkServiceId: account.id
          groupIds: [
            'account'
          ]
        }
      }
    ]
  }
}

resource dnsZoneGroup 'Microsoft.Network/privateEndpoints/privateDnsZoneGroups@2023-04-01' = {
  name: 'foundry-dns-zone-group'
  parent: privateEndpoint
  properties: {
    privateDnsZoneConfigs: [
      {
        name: 'config-foundry'
        properties: {
          privateDnsZoneId: privateDnsZone.id
        }
      }
    ]
  }
}

output id string = account.id
output name string = account.name
output endpoint string = account.properties.endpoint
output deploymentName string = deployment.name
