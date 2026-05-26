/*
  aoai.bicep — Azure OpenAI account + gpt-4.1-mini + text-embedding-3-small deployments.

  Uses Standard (S0) pricing tier with pay-as-you-go capacity.
  Local auth is DISABLED — callers must use managed identity with the
  "Cognitive Services OpenAI User" role (see identity.bicep).

  Models:
    - gpt-4.1-mini (Standard SKU): chat/completion, ~$0.15/1M input tokens.
    - text-embedding-3-small (GlobalStandard SKU): 1536-dim embeddings for AI Search
      integrated vectorization. NOTE: Standard SKU is not available in swedencentral
      for this model; GlobalStandard is required.
  Capacity: 10K TPM each — safe for dev/demo workloads.

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

// ---------------------------------------------------------------------------
// Model Deployment — Chat/Completion
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
// Embedding Deployment — text-embedding-3-small (GlobalStandard required in swedencentral)
// ---------------------------------------------------------------------------

resource embeddingDeployment 'Microsoft.CognitiveServices/accounts/deployments@2024-04-01-preview' = {
  parent: aoaiAccount
  name: 'text-embedding-3-small'
  dependsOn: [modelDeployment]
  sku: {
    name: 'GlobalStandard'
    capacity: capacityK
  }
  properties: {
    model: {
      format: 'OpenAI'
      name: 'text-embedding-3-small'
      version: '1'
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
output embeddingDeploymentName string = embeddingDeployment.name
