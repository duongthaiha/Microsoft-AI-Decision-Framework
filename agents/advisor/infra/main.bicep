// ============================================================
// AI Framework Advisor Agent POC — Main Infrastructure
// Scope: Subscription (creates the resource group)
// Bicep source of truth. No secrets in params or env files.
// Managed identity for all data-service access.
// Data services (Cosmos DB, AI Search, Key Vault) are private.
// Public ingress only on the Container App.
// ============================================================

targetScope = 'subscription'

// ------------------------------------
// Parameters
// ------------------------------------

@minLength(1)
@maxLength(32)
@description('Environment name used to generate unique resource names (e.g. dev, poc, prod).')
param environmentName string

@minLength(1)
@description('Primary Azure region for all resources.')
param location string

@description('Advisor agent mode: mock (no LLM) or copilot (GitHub Copilot SDK).')
@allowed(['mock', 'copilot'])
param advisorAgentMode string = 'mock'

@description('Cosmos DB database name.')
param cosmosDatabaseName string = 'advisor'

@description('Azure AI Search index name for the project knowledge base.')
param searchIndexName string = 'advisor-project-knowledge'

@description('Container image to deploy on first provision. azd replaces this on deploy.')
param apiContainerImage string = 'mcr.microsoft.com/azuredocs/containerapps-helloworld:latest'

@description('Minimum replica count for the Container App (0 = scale to zero).')
@minValue(0)
@maxValue(3)
param containerAppMinReplicas int = 0

@description('Maximum replica count for the Container App.')
@minValue(1)
@maxValue(10)
param containerAppMaxReplicas int = 3

// ------------------------------------
// Variables
// ------------------------------------

var resourceToken = toLower(uniqueString(subscription().id, environmentName, location))
var abbr = {
  resourceGroup: 'rg-'
  managedIdentity: 'id-'
  logAnalytics: 'log-'
  appInsights: 'appi-'
  keyVault: 'kv-'
  cosmosDb: 'cosmos-'
  search: 'srch-'
  acr: 'acr'
  containerAppsEnv: 'cae-'
  containerApp: 'ca-'
  virtualNetwork: 'vnet-'
}

var resourceGroupName = '${abbr.resourceGroup}advisor-${environmentName}'

var tags = {
  'azd-env-name': environmentName
  project: 'advisor-poc'
  managedBy: 'bicep'
}

// ------------------------------------
// Resource Group
// ------------------------------------

resource rg 'Microsoft.Resources/resourceGroups@2022-09-01' = {
  name: resourceGroupName
  location: location
  tags: tags
}

// ------------------------------------
// Managed Identity
// ------------------------------------

module identity 'modules/identity.bicep' = {
  name: 'identity'
  scope: rg
  params: {
    name: '${abbr.managedIdentity}advisor-${resourceToken}'
    location: location
    tags: tags
  }
}

// ------------------------------------
// Networking (VNet, subnets)
// ------------------------------------

module network 'modules/network.bicep' = {
  name: 'network'
  scope: rg
  params: {
    vnetName: '${abbr.virtualNetwork}advisor-${resourceToken}'
    location: location
    tags: tags
  }
}

// ------------------------------------
// Monitoring (Log Analytics + App Insights)
// ------------------------------------

module monitoring 'modules/monitoring.bicep' = {
  name: 'monitoring'
  scope: rg
  params: {
    logAnalyticsName: '${abbr.logAnalytics}advisor-${resourceToken}'
    appInsightsName: '${abbr.appInsights}advisor-${resourceToken}'
    location: location
    tags: tags
  }
}

// ------------------------------------
// Key Vault
// ------------------------------------

module keyvault 'modules/keyvault.bicep' = {
  name: 'keyvault'
  scope: rg
  params: {
    keyVaultName: '${abbr.keyVault}${resourceToken}'
    location: location
    tags: tags
    vnetId: network.outputs.vnetId
    privateEndpointSubnetId: network.outputs.privateEndpointSubnetId
    logAnalyticsWorkspaceId: monitoring.outputs.logAnalyticsWorkspaceId
  }
}

// ------------------------------------
// Cosmos DB (SQL API)
// ------------------------------------

module cosmosdb 'modules/cosmosdb.bicep' = {
  name: 'cosmosdb'
  scope: rg
  params: {
    accountName: '${abbr.cosmosDb}advisor-${resourceToken}'
    databaseName: cosmosDatabaseName
    location: location
    tags: tags
    vnetId: network.outputs.vnetId
    privateEndpointSubnetId: network.outputs.privateEndpointSubnetId
    managedIdentityPrincipalId: identity.outputs.principalId
    logAnalyticsWorkspaceId: monitoring.outputs.logAnalyticsWorkspaceId
  }
}

// ------------------------------------
// Azure AI Search
// ------------------------------------

module search 'modules/search.bicep' = {
  name: 'search'
  scope: rg
  params: {
    searchServiceName: '${abbr.search}advisor-${resourceToken}'
    location: location
    tags: tags
    vnetId: network.outputs.vnetId
    privateEndpointSubnetId: network.outputs.privateEndpointSubnetId
    logAnalyticsWorkspaceId: monitoring.outputs.logAnalyticsWorkspaceId
  }
}

// ------------------------------------
// Azure Container Registry
// ------------------------------------

module acr 'modules/acr.bicep' = {
  name: 'acr'
  scope: rg
  params: {
    registryName: '${abbr.acr}advisor${resourceToken}'
    location: location
    tags: tags
    logAnalyticsWorkspaceId: monitoring.outputs.logAnalyticsWorkspaceId
  }
}

// ------------------------------------
// Container Apps Environment + App
// ------------------------------------

module containerapp 'modules/containerapp.bicep' = {
  name: 'containerapp'
  scope: rg
  params: {
    environmentName: '${abbr.containerAppsEnv}advisor-${resourceToken}'
    appName: '${abbr.containerApp}advisor-${resourceToken}'
    location: location
    tags: tags
    containerImage: apiContainerImage
    acrLoginServer: acr.outputs.loginServer
    managedIdentityId: identity.outputs.id
    managedIdentityClientId: identity.outputs.clientId
    acaSubnetId: network.outputs.acaSubnetId
    logAnalyticsWorkspaceId: monitoring.outputs.logAnalyticsWorkspaceId
    appInsightsConnectionString: monitoring.outputs.appInsightsConnectionString
    advisorAgentMode: advisorAgentMode
    cosmosEndpoint: cosmosdb.outputs.endpoint
    cosmosDatabaseName: cosmosDatabaseName
    searchEndpoint: search.outputs.endpoint
    searchIndexName: searchIndexName
    minReplicas: containerAppMinReplicas
    maxReplicas: containerAppMaxReplicas
  }
}

// ------------------------------------
// RBAC Role Assignments
// ------------------------------------

module roleAssignments 'modules/roleassignments.bicep' = {
  name: 'roleAssignments'
  scope: rg
  params: {
    managedIdentityPrincipalId: identity.outputs.principalId
    searchServiceId: search.outputs.id
    searchServiceName: search.outputs.name
    keyVaultName: keyvault.outputs.name
    acrId: acr.outputs.id
  }
}

// ------------------------------------
// Outputs (consumed by azd + app config)
// ------------------------------------

output AZURE_LOCATION string = location
output AZURE_TENANT_ID string = tenant().tenantId
output AZURE_RESOURCE_GROUP string = rg.name

output AZURE_CONTAINER_APP_NAME string = containerapp.outputs.appName
output AZURE_CONTAINER_APP_FQDN string = containerapp.outputs.fqdn
output AZURE_CONTAINER_REGISTRY_ENDPOINT string = acr.outputs.loginServer
output AZURE_CONTAINER_REGISTRY_NAME string = acr.outputs.name

output AZURE_CLIENT_ID string = identity.outputs.clientId
output AZURE_MANAGED_IDENTITY_ID string = identity.outputs.id

output COSMOS_ENDPOINT string = cosmosdb.outputs.endpoint
output SEARCH_ENDPOINT string = search.outputs.endpoint
output KEY_VAULT_ENDPOINT string = keyvault.outputs.vaultUri
output APPINSIGHTS_CONNECTION_STRING string = monitoring.outputs.appInsightsConnectionString
