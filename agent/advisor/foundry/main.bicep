// Microsoft AI Decision Framework — Advisor Agent Foundry Deployment
//
// Provisions Azure AI Foundry hosted agent infrastructure for the advisor.
// Includes: managed identity for the agent.
//
// Usage: az deployment group create \
//          --resource-group rg-advisor-foundry \
//          --template-file main.bicep \
//          --parameters @main.parameters.json
//
// Or at subscription scope:
//
// Usage: az deployment sub create \
//          --location swedencentral \
//          --template-file main.bicep \
//          --parameters @main.parameters.json \
//        (requires bicepfile to have targetScope='subscription' and create RG explicitly)

targetScope = 'resourceGroup'

param agentName string = 'advisor-agent'
param foundryAuthMode string = 'entra' // 'key' or 'entra'
param foundryApiKey string = '' // Required if foundryAuthMode='key', else omitted
param advisorModel string = 'gpt-4o'
param advisorOrganizationContext string = '' // Optional

// Agent deployment identity name
var agentIdentityName = '${agentName}-id'

// User-assigned managed identity for the agent
resource agentIdentity 'Microsoft.ManagedIdentity/userAssignedIdentities@2023-01-31' = {
  name: agentIdentityName
  location: resourceGroup().location
}

// Output the deployed agent info for post-deployment RBAC setup
output agentIdentityId string = agentIdentity.id
output agentIdentityClientId string = agentIdentity.properties.clientId
output agentIdentityPrincipalId string = agentIdentity.properties.principalId
output deploymentNotes string = 'Foundry project and agent must be created via Portal or Foundry SDK after identity provisioning. Assign the identity Cognitive Services OpenAI User role on Foundry resource if using Entra auth.'
