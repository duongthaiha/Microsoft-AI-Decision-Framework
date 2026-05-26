/*
  aoai.bicep — Azure OpenAI account + gpt-4o-mini deployment.

  Uses Standard (S0) pricing tier with pay-as-you-go capacity.
  Local auth is DISABLED — callers must use managed identity with the
  "Cognitive Services OpenAI User" role (see identity.bicep).

  Model: gpt-4o-mini (cheapest capable model, ~$0.15/1M input tokens).
  Capacity: 10K TPM — safe for dev/demo workloads.

  Docs:
    https://learn.microsoft.com/azure/ai-services/openai/overview
    https://learn.microsoft.com/azure/ai-services/openai/how-to/role-based-access-control
*/

@description('Prefix for the resource name.')
param namePrefix string

@description('Azure region.')
param location string

@description('Resource tags.')
param tags object

@description('Model to deploy.')
param modelName string = 'gpt-4.1-mini'

@description('Model version.')
param modelVersion string = '2025-04-14'

@description('Capacity in thousands of tokens per minute.')
param capacityK int = 10

// ---------------------------------------------------------------------------
// Azure OpenAI Account
// ---------------------------------------------------------------------------

var accountName = '${namePrefix}-aoai-${uniqueString(resourceGroup().id)}'

resource aoaiAccount 'Microsoft.CognitiveServices/accounts@2024-04-01-preview' = {
  name: accountName
  location: location
  tags: tags
  kind: 'OpenAI'
  sku: {
    name: 'S0'
  }
  properties: {
    publicNetworkAccess: 'Enabled'
    // Disable shared-key access — callers must authenticate via managed identity.
    disableLocalAuth: true
    customSubDomainName: accountName
  }
}

// ---------------------------------------------------------------------------
// Model Deployment
// ---------------------------------------------------------------------------

resource modelDeployment 'Microsoft.CognitiveServices/accounts/deployments@2024-04-01-preview' = {
  parent: aoaiAccount
  name: modelName
  sku: {
    name: 'Standard'
    capacity: capacityK
  }
  properties: {
    model: {
      format: 'OpenAI'
      name: modelName
      version: modelVersion
    }
  }
}

// ---------------------------------------------------------------------------
// Outputs
// ---------------------------------------------------------------------------

output accountName string = aoaiAccount.name
output accountId string = aoaiAccount.id
output endpoint string = aoaiAccount.properties.endpoint
output modelDeploymentName string = modelDeployment.name
