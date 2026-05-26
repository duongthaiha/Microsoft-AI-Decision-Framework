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

@description('Entra tenant ID — used for JWT validation. Defaults to the deployed Entra app tenant.')
param entraTenantId string = 'cdfe81b5-821e-4f07-9ea7-516efc8497e4'

@description('Entra API audience (api://{appId}) — must match the audience claim on tokens.')
param entraApiAudience string = 'api://4f4f4a4d-e60f-4b86-a681-86059aae4597'

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

@description('Deploy Azure AI Search. Set false if eastus2 has quota constraints (re-add in M1).')
param deploySearch bool = true

@description('Deploy Azure OpenAI account + gpt-4.1-mini. Set false to skip (e.g. quota constraints).')
param deployAoai bool = true

@description('Object ID of the developer az-login user. Grants Cosmos + AOAI access for local dev with DefaultAzureCredential.')
param developerPrincipalId string = ''

@description('Azure region for the Static Web App. Must be one of the SWA-supported regions (centralus, eastus2, westus2, westeurope, eastasia). Defaults to westeurope so SWA can co-exist with swedencentral deployments.')
param staticWebAppLocation string = 'westeurope'

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

module search 'modules/search.bicep' = if (deploySearch) {
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

module aoai 'modules/aoai.bicep' = if (deployAoai) {
  name: 'aoai'
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
    searchServiceId: search.?outputs.serviceId ?? ''
    acrId: acr.outputs.acrId
    aoaiAccountId: aoai.?outputs.accountId ?? ''
    developerPrincipalId: developerPrincipalId
  }
}

module containerApps 'modules/container-apps.bicep' = {
  name: 'containerApps'
  params: {
    namePrefix: agentNamePrefix
    location: location
    tags: tags
    containerRegistryLoginServer: acr.outputs.loginServer
    agentIdentityId: identity.outputs.agentIdentityId
    agentIdentityClientId: identity.outputs.agentIdentityClientId
    appInsightsConnectionString: monitoring.outputs.appInsightsConnectionString
    cosmosEndpoint: cosmos.outputs.endpoint
    searchEndpoint: search.?outputs.endpoint ?? ''
    aoaiEndpoint: aoai.?outputs.endpoint ?? ''
    demoMode: demoFlag
    entraTenantId: entraTenantId
    entraApiAudience: entraApiAudience
  }
}

module staticWebApp 'modules/staticwebapp.bicep' = {
  name: 'staticWebApp'
  params: {
    namePrefix: agentNamePrefix
    location: staticWebAppLocation
    tags: tags
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
//
// AZD picks up AZURE_* outputs automatically to wire service deployments.
// All other outputs land in `.azure/<env>/.env` for local dev use.
// ---------------------------------------------------------------------------

// AZD Container App discovery
@description('Container App name — AZD uses this to push the advisor image.')
output AZURE_CONTAINER_APP_NAME string = containerApps.outputs.containerAppName

@description('Container Apps Environment name.')
output AZURE_CONTAINER_APP_ENVIRONMENT_NAME string = containerApps.outputs.caeName

@description('ACR login server — AZD uses this to tag and push Docker images.')
output AZURE_CONTAINER_REGISTRY_ENDPOINT string = acr.outputs.loginServer

// AZD Static Web App discovery
@description('Static Web App name — AZD uses this to deploy the React SPA.')
output AZURE_STATIC_WEB_APP_NAME string = staticWebApp.outputs.staticWebAppName

// Service endpoints (safe to commit — no keys)
@description('HTTPS URL of the deployed Container App.')
output CONTAINER_APP_URL string = containerApps.outputs.containerAppUrl

@description('Cosmos DB account endpoint URL.')
output COSMOS_ENDPOINT string = cosmos.outputs.endpoint

@description('Azure AI Search endpoint URL. Empty when deploySearch=false.')
output SEARCH_ENDPOINT string = search.?outputs.endpoint ?? ''

@description('Azure OpenAI endpoint URL. Empty when deployAoai=false.')
output AOAI_ENDPOINT string = aoai.?outputs.endpoint ?? ''

@description('Azure OpenAI model deployment name.')
output AOAI_MODEL_DEPLOYMENT string = aoai.?outputs.modelDeploymentName ?? ''

@description('Application Insights connection string (safe for env var; not a secret).')
output APPLICATIONINSIGHTS_CONNECTION_STRING string = monitoring.outputs.appInsightsConnectionString

@description('Static Web App URL.')
output STATIC_WEB_APP_URL string = staticWebApp.outputs.staticWebAppUrl

// Identity outputs for local dev wiring
@description('Client ID of the agent managed identity.')
output AZURE_AGENT_IDENTITY_CLIENT_ID string = identity.outputs.agentIdentityClientId

// Resource names (for az CLI lookups during ops)
@description('Cosmos DB account name.')
output cosmosAccountName string = cosmos.outputs.accountName

@description('Azure AI Search service name. Empty when deploySearch=false.')
output searchServiceName string = search.?outputs.serviceName ?? ''

@description('Log Analytics workspace resource ID.')
output logAnalyticsWorkspaceId string = monitoring.outputs.workspaceId

