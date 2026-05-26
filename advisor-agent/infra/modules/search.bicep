/*
  search.bicep — Azure AI Search service.

  System-assigned identity is enabled so the agent can use managed identity
  to authenticate to the Search data plane (no admin keys).

  Index resources are NOT declared in M0 — Dallas (Data Engineer) adds the
  index schema in M1 once the document model is stable.

  Public network access is parameter-controlled; set publicNetworkAccess to
  'disabled' to block the public endpoint for private hardening.

  Docs: https://learn.microsoft.com/azure/search/search-security-rbac
*/

@description('Prefix applied to the Search service name.')
param namePrefix string

@description('Azure region.')
param location string

@description('Resource tags.')
param tags object

@description('Azure AI Search SKU.')
@allowed(['free', 'basic', 'standard', 'standard2', 'standard3'])
param skuName string = 'basic'

@description('Public network access: "enabled" or "disabled".')
@allowed(['enabled', 'disabled'])
param publicNetworkAccess string = 'enabled'

// ---------------------------------------------------------------------------
// Search Service
// ---------------------------------------------------------------------------

var serviceName = '${namePrefix}-search-${uniqueString(resourceGroup().id)}'

resource searchService 'Microsoft.Search/searchServices@2023-11-01' = {
  name: serviceName
  location: location
  tags: tags
  sku: {
    name: skuName
  }
  identity: {
    type: 'SystemAssigned'
  }
  properties: {
    replicaCount: 1
    partitionCount: 1
    publicNetworkAccess: publicNetworkAccess
    // Disable API key authentication — prefer RBAC via managed identity.
    authOptions: {
      aadOrApiKey: {
        aadAuthFailureMode: 'http403'
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Outputs
// ---------------------------------------------------------------------------

output serviceName string = searchService.name
output serviceId string = searchService.id
output endpoint string = 'https://${searchService.name}.search.windows.net'
output principalId string = searchService.identity.principalId
