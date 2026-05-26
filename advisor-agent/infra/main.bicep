/*
  main.bicep — the deployment storyboard.
  Every Azure resource the advisor needs, declared once, deployed together.

  This is the entry point for `azd provision`. It wires together every module
  in infra/modules/ and surfaces the outputs that downstream services (and the
  AZD host) need to configure themselves.

  Docs: https://learn.microsoft.com/azure/azure-resource-manager/bicep/
*/

targetScope = 'resourceGroup'

// ---------------------------------------------------------------------------
// Parameters
// ---------------------------------------------------------------------------

@description('Short name for the environment (dev | test | prod).')
param environmentName string

@description('Azure region for all resources.')
param location string = resourceGroup().location

@description('Prefix applied to every resource name.')
param agentNamePrefix string = 'advisor'

@description('Authentication mode: "entra" (default) or "demo" (disables user sign-in outside prod).')
@allowed(['entra', 'demo'])
param authMode string = 'entra'

@description('Enable demo mode features (must be false in production).')
param demoFlag bool = false

@description('Copilot SDK model path: "azure-byom" (preferred) or "github-default" (requires Key Vault token).')
@allowed(['azure-byom', 'github-default'])
param modelPath string = 'azure-byom'

@description('Foundry Hosted Agent invocation protocol.')
@allowed(['responses', 'invocations'])
param hostedAgentProtocol string = 'responses'

@description('Allow public network access to data services. Set false for private-endpoint hardening.')
param publicNetworking bool = true

@description('Cosmos DB account SKU (provisioned throughput tier).')
param skuCosmos string = 'Standard'

@description('Azure AI Search SKU.')
@allowed(['free', 'basic', 'standard', 'standard2', 'standard3'])
param skuSearch string = 'basic'

@description('Resource tags applied to every resource.')
param tags object = {
  project: 'advisor-agent'
  environment: environmentName
}

// ---------------------------------------------------------------------------
// Modules
// ---------------------------------------------------------------------------

module monitoring 'modules/monitoring.bicep' = {
  name: 'monitoring'
  params: {
    namePrefix: agentNamePrefix
    location: location
    tags: tags
  }
}

module cosmos 'modules/cosmos.bicep' = {
  name: 'cosmos'
  params: {
    namePrefix: agentNamePrefix
    location: location
    tags: tags
    publicNetworkAccess: publicNetworking ? 'Enabled' : 'Disabled'
    skuName: skuCosmos
  }
}

module search 'modules/search.bicep' = {
  name: 'search'
  params: {
    namePrefix: agentNamePrefix
    location: location
    tags: tags
    skuName: skuSearch
    publicNetworkAccess: publicNetworking ? 'enabled' : 'disabled'
  }
}

module acr 'modules/container-registry.bicep' = {
  name: 'acr'
  params: {
    namePrefix: agentNamePrefix
    location: location
    tags: tags
  }
}

module identity 'modules/identity.bicep' = {
  name: 'identity'
  params: {
    namePrefix: agentNamePrefix
    location: location
    tags: tags
    cosmosAccountId: cosmos.outputs.accountId
    searchServiceId: search.outputs.serviceId
    acrId: acr.outputs.acrId
  }
}

module foundry 'modules/foundry.bicep' = {
  name: 'foundry'
  params: {
    namePrefix: agentNamePrefix
    hostedAgentProtocol: hostedAgentProtocol
    modelPath: modelPath
  }
}

// ---------------------------------------------------------------------------
// Outputs consumed by AZD and downstream services
// ---------------------------------------------------------------------------

@description('HTTPS endpoint of the advisor Hosted Agent / Container App.')
output agentEndpoint string = 'https://${agentNamePrefix}-agent.${location}.azurecontainerapps.io'

@description('Cosmos DB account name.')
output cosmosAccountName string = cosmos.outputs.accountName

@description('Azure AI Search service name.')
output searchServiceName string = search.outputs.serviceName

@description('Azure Container Registry login server.')
output containerRegistryName string = acr.outputs.loginServer

@description('Application Insights connection string (use with APPLICATIONINSIGHTS_CONNECTION_STRING).')
output appInsightsConnectionString string = monitoring.outputs.appInsightsConnectionString
