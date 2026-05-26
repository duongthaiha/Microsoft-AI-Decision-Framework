/*
  identity.bicep — User-assigned managed identities and role assignments.

  Two service identities:
    agentIdentity   — used by the advisor Container App runtime.
    adminIdentity   — used by the admin backend service.

  Optional developer principal:
    developerPrincipalId — objectId of the `az login` user for local dev.
    If non-empty, grants Cosmos Data Contributor so DefaultAzureCredential
    works from the codespace without a service principal.

  Role assignment model (product-spec.md §11):
  ┌─────────────────────────────────────────────────────────────────────────┐
  │ agentIdentity                                                           │
  │   Cosmos DB Built-in Data Contributor  → account scope (all containers)│
  │   Search Index Data Reader             → Search service                │
  │   AcrPull                              → Container Registry             │
  │   Cognitive Services OpenAI User       → Azure OpenAI account          │
  ├─────────────────────────────────────────────────────────────────────────┤
  │ adminIdentity                                                           │
  │   Cosmos DB Built-in Data Contributor  → account scope                 │
  └─────────────────────────────────────────────────────────────────────────┘

  NOTE on Cosmos data-plane roles:
  Microsoft.DocumentDB/databaseAccounts/sqlRoleAssignments uses well-known IDs:
    Reader:      00000000-0000-0000-0000-000000000001
    Contributor: 00000000-0000-0000-0000-000000000002
  IMPORTANT: Each (scope, roleDefinitionId, principalId) triple must be unique
  within a Cosmos account. Use ONE assignment per (identity, role) — NOT one
  per container.

  Docs:
    https://learn.microsoft.com/azure/cosmos-db/nosql/security/how-to-grant-data-plane-role-based-access
    https://learn.microsoft.com/azure/role-based-access-control/built-in-roles
*/

@description('Prefix applied to identity names.')
param namePrefix string

@description('Azure region.')
param location string

@description('Resource tags.')
param tags object

@description('Resource ID of the Cosmos DB account (for data-plane role assignments).')
param cosmosAccountId string

@description('Resource ID of the Azure AI Search service (for ARM role assignments).')
param searchServiceId string

@description('Resource ID of the Container Registry (for AcrPull role assignment).')
param acrId string

@description('Resource ID of the Azure OpenAI account (for Cognitive Services OpenAI User role).')
param aoaiAccountId string = ''

@description('Object ID of the developer user (az login). When non-empty, grants Cosmos Contributor for local dev.')
param developerPrincipalId string = ''

// ---------------------------------------------------------------------------
// User-Assigned Managed Identities
// ---------------------------------------------------------------------------

resource agentIdentity 'Microsoft.ManagedIdentity/userAssignedIdentities@2023-01-31' = {
  name: '${namePrefix}-agent-identity'
  location: location
  tags: tags
}

resource adminIdentity 'Microsoft.ManagedIdentity/userAssignedIdentities@2023-01-31' = {
  name: '${namePrefix}-admin-identity'
  location: location
  tags: tags
}

// ---------------------------------------------------------------------------
// ARM Role Assignments (Azure RBAC)
// ---------------------------------------------------------------------------

var acrPullRoleId = '7f951dda-4ed3-4680-a7ca-43fe172d538d'

resource agentAcrPull 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(acrId, agentIdentity.id, acrPullRoleId)
  scope: resourceGroup()
  properties: {
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', acrPullRoleId)
    principalId: agentIdentity.properties.principalId
    principalType: 'ServicePrincipal'
    description: 'Agent identity pulls advisor container images from ACR.'
  }
}

var searchIndexDataReaderRoleId = '1407120a-92aa-4202-b7e9-c0e197c71c8f'

resource agentSearchDataReader 'Microsoft.Authorization/roleAssignments@2022-04-01' = if (!empty(searchServiceId)) {
  name: guid(searchServiceId, agentIdentity.id, searchIndexDataReaderRoleId)
  scope: resourceGroup()
  properties: {
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', searchIndexDataReaderRoleId)
    principalId: agentIdentity.properties.principalId
    principalType: 'ServicePrincipal'
    description: 'Agent identity reads Azure AI Search indexes.'
  }
}

// Cognitive Services OpenAI User — agent identity calls Azure OpenAI via managed identity
var cognitiveServicesOpenAIUserRoleId = '5e0bd9bd-7b93-4f28-af87-19fc36ad61bd'

resource agentAoaiUser 'Microsoft.Authorization/roleAssignments@2022-04-01' = if (!empty(aoaiAccountId)) {
  name: guid(aoaiAccountId, agentIdentity.id, cognitiveServicesOpenAIUserRoleId)
  scope: resourceGroup()
  properties: {
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', cognitiveServicesOpenAIUserRoleId)
    principalId: agentIdentity.properties.principalId
    principalType: 'ServicePrincipal'
    description: 'Agent identity calls Azure OpenAI via managed identity.'
  }
}

// Developer user — Cognitive Services OpenAI User for local dev
resource developerAoaiUser 'Microsoft.Authorization/roleAssignments@2022-04-01' = if (!empty(aoaiAccountId) && !empty(developerPrincipalId)) {
  name: guid(aoaiAccountId, developerPrincipalId, cognitiveServicesOpenAIUserRoleId)
  scope: resourceGroup()
  properties: {
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', cognitiveServicesOpenAIUserRoleId)
    principalId: developerPrincipalId
    principalType: 'User'
    description: 'Developer (az login user) calls Azure OpenAI from local codespace.'
  }
}

// ---------------------------------------------------------------------------
// Cosmos DB Data-Plane Role Assignments
//
// CRITICAL: Each (scope, roleDefinitionId, principalId) triple must be unique
// within a Cosmos account. Use ONE assignment per (identity, role).
// Do NOT create multiple assignments for the same (scope, role, principal)
// even with different GUIDs — Cosmos will reject the duplicates.
// ---------------------------------------------------------------------------

resource existingCosmosAccount 'Microsoft.DocumentDB/databaseAccounts@2023-11-15' existing = {
  name: last(split(cosmosAccountId, '/'))!
}

var cosmosDataContributorRoleId = '00000000-0000-0000-0000-000000000002'

// Agent identity — one Data Contributor assignment at account scope (covers all containers)
resource agentCosmosContributor 'Microsoft.DocumentDB/databaseAccounts/sqlRoleAssignments@2023-11-15' = {
  name: guid(cosmosAccountId, agentIdentity.id, cosmosDataContributorRoleId)
  parent: existingCosmosAccount
  properties: {
    // Account scope — M1 can narrow to container scope once schema is stable.
    scope: cosmosAccountId
    roleDefinitionId: '${cosmosAccountId}/sqlRoleDefinitions/${cosmosDataContributorRoleId}'
    principalId: agentIdentity.properties.principalId
  }
}

// Admin identity — one Data Contributor assignment at account scope
resource adminCosmosContributor 'Microsoft.DocumentDB/databaseAccounts/sqlRoleAssignments@2023-11-15' = {
  name: guid(cosmosAccountId, adminIdentity.id, cosmosDataContributorRoleId)
  parent: existingCosmosAccount
  properties: {
    scope: cosmosAccountId
    roleDefinitionId: '${cosmosAccountId}/sqlRoleDefinitions/${cosmosDataContributorRoleId}'
    principalId: adminIdentity.properties.principalId
  }
}

// Developer (az login user) — Data Contributor for local dev via DefaultAzureCredential
resource developerCosmosContributor 'Microsoft.DocumentDB/databaseAccounts/sqlRoleAssignments@2023-11-15' = if (!empty(developerPrincipalId)) {
  name: guid(cosmosAccountId, developerPrincipalId, cosmosDataContributorRoleId)
  parent: existingCosmosAccount
  properties: {
    scope: cosmosAccountId
    roleDefinitionId: '${cosmosAccountId}/sqlRoleDefinitions/${cosmosDataContributorRoleId}'
    principalId: developerPrincipalId
  }
}

// ---------------------------------------------------------------------------
// Outputs
// ---------------------------------------------------------------------------

output agentIdentityId string = agentIdentity.id
output agentIdentityClientId string = agentIdentity.properties.clientId
output agentIdentityPrincipalId string = agentIdentity.properties.principalId

output adminIdentityId string = adminIdentity.id
output adminIdentityClientId string = adminIdentity.properties.clientId
output adminIdentityPrincipalId string = adminIdentity.properties.principalId
