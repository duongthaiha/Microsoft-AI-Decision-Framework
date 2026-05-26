/*
  identity.bicep — User-assigned managed identities and role assignments.

  Two identities:
    agentIdentity   — used by the advisor Hosted Agent / Container App runtime.
    adminIdentity   — used by the admin backend service.

  Role assignment model (product-spec.md §11):
  ┌─────────────────────────────────────────────────────────────────────────┐
  │ agentIdentity                                                           │
  │   Cosmos DB Built-in Data Contributor  → sessions, requests, projects  │
  │   Cosmos DB Built-in Data Reader       → org-context                   │
  │   Search Index Data Reader             → Search service                │
  │   AcrPull                              → Container Registry             │
  ├─────────────────────────────────────────────────────────────────────────┤
  │ adminIdentity                                                           │
  │   Cosmos DB Built-in Data Contributor  → org-context                   │
  │   Cosmos DB Built-in Data Reader       → sessions, requests, projects  │
  └─────────────────────────────────────────────────────────────────────────┘

  IMPORTANT — Cosmos DB data-plane role assignments use
  Microsoft.DocumentDB/databaseAccounts/sqlRoleAssignments, NOT ARM RBAC.
  The built-in role definition IDs below are placeholders; replace with the
  actual GUIDs for your subscription once confirmed via:
    az cosmosdb sql role definition list --account-name <name> -g <rg>

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

// AcrPull — agent identity pulls images from ACR
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

// Search Index Data Reader — agent identity queries Search
var searchIndexDataReaderRoleId = '1407120a-92aa-4202-b7e9-c0e197c71c8f'

resource agentSearchDataReader 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(searchServiceId, agentIdentity.id, searchIndexDataReaderRoleId)
  scope: resourceGroup()
  properties: {
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', searchIndexDataReaderRoleId)
    principalId: agentIdentity.properties.principalId
    principalType: 'ServicePrincipal'
    description: 'Agent identity reads Azure AI Search indexes.'
  }
}

// ---------------------------------------------------------------------------
// Cosmos DB Data-Plane Role Assignments
//
// These use Microsoft.DocumentDB/databaseAccounts/sqlRoleAssignments, which
// are distinct from ARM RBAC and operate on the Cosmos DB data plane.
//
// Built-in role definition IDs (00000000-... are well-known Cosmos DB roles):
//   Cosmos DB Built-in Data Reader:      00000000-0000-0000-0000-000000000001
//   Cosmos DB Built-in Data Contributor: 00000000-0000-0000-0000-000000000002
//
// Scope examples:
//   Account scope:    /subscriptions/{sub}/resourceGroups/{rg}/providers/Microsoft.DocumentDB/databaseAccounts/{account}
//   Database scope:   .../databaseAccounts/{account}/dbs/advisor
//   Container scope:  .../databaseAccounts/{account}/dbs/advisor/colls/sessions
//
// For production, scope role assignments to the minimum required container,
// not the entire account.
// ---------------------------------------------------------------------------

var cosmosDataReaderRoleId = '00000000-0000-0000-0000-000000000001'
var cosmosDataContributorRoleId = '00000000-0000-0000-0000-000000000002'

// Agent identity — Data Contributor on sessions, requests, projects
resource agentCosmosContributorSessions 'Microsoft.DocumentDB/databaseAccounts/sqlRoleAssignments@2023-11-15' = {
  name: guid(cosmosAccountId, agentIdentity.id, cosmosDataContributorRoleId, 'sessions')
  parent: existingCosmosAccount
  properties: {
    // TODO: Narrow to container scope once containers are provisioned:
    //   scope: '${cosmosAccountId}/dbs/advisor/colls/sessions'
    scope: cosmosAccountId
    roleDefinitionId: '${cosmosAccountId}/sqlRoleDefinitions/${cosmosDataContributorRoleId}'
    principalId: agentIdentity.properties.principalId
  }
}

resource agentCosmosContributorRequests 'Microsoft.DocumentDB/databaseAccounts/sqlRoleAssignments@2023-11-15' = {
  name: guid(cosmosAccountId, agentIdentity.id, cosmosDataContributorRoleId, 'requests')
  parent: existingCosmosAccount
  properties: {
    scope: cosmosAccountId
    roleDefinitionId: '${cosmosAccountId}/sqlRoleDefinitions/${cosmosDataContributorRoleId}'
    principalId: agentIdentity.properties.principalId
  }
}

resource agentCosmosContributorProjects 'Microsoft.DocumentDB/databaseAccounts/sqlRoleAssignments@2023-11-15' = {
  name: guid(cosmosAccountId, agentIdentity.id, cosmosDataContributorRoleId, 'projects')
  parent: existingCosmosAccount
  properties: {
    scope: cosmosAccountId
    roleDefinitionId: '${cosmosAccountId}/sqlRoleDefinitions/${cosmosDataContributorRoleId}'
    principalId: agentIdentity.properties.principalId
  }
}

// Agent identity — Data Reader on org-context (read-only)
resource agentCosmosReaderOrgContext 'Microsoft.DocumentDB/databaseAccounts/sqlRoleAssignments@2023-11-15' = {
  name: guid(cosmosAccountId, agentIdentity.id, cosmosDataReaderRoleId, 'org-context')
  parent: existingCosmosAccount
  properties: {
    scope: cosmosAccountId
    roleDefinitionId: '${cosmosAccountId}/sqlRoleDefinitions/${cosmosDataReaderRoleId}'
    principalId: agentIdentity.properties.principalId
  }
}

// Admin identity — Data Contributor on org-context
resource adminCosmosContributorOrgContext 'Microsoft.DocumentDB/databaseAccounts/sqlRoleAssignments@2023-11-15' = {
  name: guid(cosmosAccountId, adminIdentity.id, cosmosDataContributorRoleId, 'org-context')
  parent: existingCosmosAccount
  properties: {
    scope: cosmosAccountId
    roleDefinitionId: '${cosmosAccountId}/sqlRoleDefinitions/${cosmosDataContributorRoleId}'
    principalId: adminIdentity.properties.principalId
  }
}

// Admin identity — Data Reader on sessions, requests, projects (admin browse screens)
resource adminCosmosReaderSessions 'Microsoft.DocumentDB/databaseAccounts/sqlRoleAssignments@2023-11-15' = {
  name: guid(cosmosAccountId, adminIdentity.id, cosmosDataReaderRoleId, 'sessions')
  parent: existingCosmosAccount
  properties: {
    scope: cosmosAccountId
    roleDefinitionId: '${cosmosAccountId}/sqlRoleDefinitions/${cosmosDataReaderRoleId}'
    principalId: adminIdentity.properties.principalId
  }
}

resource adminCosmosReaderRequests 'Microsoft.DocumentDB/databaseAccounts/sqlRoleAssignments@2023-11-15' = {
  name: guid(cosmosAccountId, adminIdentity.id, cosmosDataReaderRoleId, 'requests')
  parent: existingCosmosAccount
  properties: {
    scope: cosmosAccountId
    roleDefinitionId: '${cosmosAccountId}/sqlRoleDefinitions/${cosmosDataReaderRoleId}'
    principalId: adminIdentity.properties.principalId
  }
}

resource adminCosmosReaderProjects 'Microsoft.DocumentDB/databaseAccounts/sqlRoleAssignments@2023-11-15' = {
  name: guid(cosmosAccountId, adminIdentity.id, cosmosDataReaderRoleId, 'projects')
  parent: existingCosmosAccount
  properties: {
    scope: cosmosAccountId
    roleDefinitionId: '${cosmosAccountId}/sqlRoleDefinitions/${cosmosDataReaderRoleId}'
    principalId: adminIdentity.properties.principalId
  }
}

// Reference to the existing Cosmos account (passed in as a resource ID param)
resource existingCosmosAccount 'Microsoft.DocumentDB/databaseAccounts@2023-11-15' existing = {
  name: last(split(cosmosAccountId, '/'))!
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
