// ============================================================
// Module: RBAC Role Assignments
//
// Assigns Azure RBAC roles to the user-assigned managed identity
// for all data services. Cosmos DB data-plane RBAC is handled
// inside cosmosdb.bicep (uses sqlRoleAssignments, not ARM RBAC).
//
// Role IDs (built-in, immutable GUIDs):
//   Search Index Data Contributor : 8ebe5a00-799e-43f5-93ac-243d3dce84a7
//   Search Service Contributor     : 7ca78c08-252a-4471-8644-bb5ff32d4ba0
//   Key Vault Secrets User          : 4633458b-17de-408a-b874-0445c86b69e6
//   AcrPull                         : 7f951dda-4ed3-4680-a7ca-43fe172d538d
//   Monitoring Metrics Publisher    : 3913510d-42f4-4e42-8a64-420c390055eb
//
// Security note: Search roles are scoped to the specific AI Search
// resource (not resourceGroup) to enforce least-privilege.
// ============================================================

param managedIdentityPrincipalId string
param searchServiceId string
@description('Name of the AI Search service — used to scope Search RBAC to the specific resource.')
param searchServiceName string
param keyVaultName string
param acrId string

// Existing Key Vault reference for scoping
resource keyVault 'Microsoft.KeyVault/vaults@2023-07-01' existing = {
  name: keyVaultName
}

// Existing AI Search reference — scopes role assignments to this resource, not the RG
resource searchService 'Microsoft.Search/searchServices@2023-11-01' existing = {
  name: searchServiceName
}

// --- Azure AI Search ---

var searchIndexDataContributorRoleId = '8ebe5a00-799e-43f5-93ac-243d3dce84a7'
var searchServiceContributorRoleId = '7ca78c08-252a-4471-8644-bb5ff32d4ba0'

resource searchIndexDataContributor 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(searchServiceId, managedIdentityPrincipalId, searchIndexDataContributorRoleId)
  scope: searchService
  properties: {
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', searchIndexDataContributorRoleId)
    principalId: managedIdentityPrincipalId
    principalType: 'ServicePrincipal'
    description: 'Allows the advisor API managed identity to index and query AI Search.'
  }
}

resource searchServiceContributor 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(searchServiceId, managedIdentityPrincipalId, searchServiceContributorRoleId)
  scope: searchService
  properties: {
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', searchServiceContributorRoleId)
    principalId: managedIdentityPrincipalId
    principalType: 'ServicePrincipal'
    description: 'Allows the advisor API managed identity to manage AI Search service configuration.'
  }
}

// --- Key Vault ---

var keyVaultSecretsUserRoleId = '4633458b-17de-408a-b874-0445c86b69e6'

resource keyVaultSecretsUser 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(keyVault.id, managedIdentityPrincipalId, keyVaultSecretsUserRoleId)
  scope: keyVault
  properties: {
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', keyVaultSecretsUserRoleId)
    principalId: managedIdentityPrincipalId
    principalType: 'ServicePrincipal'
    description: 'Allows the advisor API managed identity to read Key Vault secrets.'
  }
}

// --- Container Registry ---

var acrPullRoleId = '7f951dda-4ed3-4680-a7ca-43fe172d538d'

resource acrPull 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(acrId, managedIdentityPrincipalId, acrPullRoleId)
  scope: resourceGroup()
  properties: {
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', acrPullRoleId)
    principalId: managedIdentityPrincipalId
    principalType: 'ServicePrincipal'
    description: 'Allows the advisor API managed identity to pull container images from ACR.'
  }
}

// --- Monitoring ---

var monitoringMetricsPublisherRoleId = '3913510d-42f4-4e42-8a64-420c390055eb'

resource monitoringMetricsPublisher 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(resourceGroup().id, managedIdentityPrincipalId, monitoringMetricsPublisherRoleId)
  scope: resourceGroup()
  properties: {
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', monitoringMetricsPublisherRoleId)
    principalId: managedIdentityPrincipalId
    principalType: 'ServicePrincipal'
    description: 'Allows the advisor API managed identity to publish metrics to Azure Monitor.'
  }
}
