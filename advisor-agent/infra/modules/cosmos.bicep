/*
  cosmos.bicep — Cosmos DB account, database, and four containers.

  Partition key design mirrors the product-spec data model:
    sessions      /ownerId  — user owns their conversation turns
    requests      /ownerId  — user owns their submitted requests
    projects      /projectId — project-scoped records
    org-context   /orgId    — organisation-level configuration (admin-write, agent-read)

  Local auth (account keys / connection strings) is disabled; all access is via
  managed identity and Cosmos DB data-plane RBAC role assignments (see identity.bicep).

  Docs: https://learn.microsoft.com/azure/cosmos-db/nosql/
*/

@description('Prefix applied to the Cosmos DB account name.')
param namePrefix string

@description('Azure region for the account.')
param location string

@description('Resource tags.')
param tags object

@description('Public network access toggle.')
@allowed(['Enabled', 'Disabled'])
param publicNetworkAccess string = 'Disabled'

@description('Cosmos DB account tier (Standard).')
param skuName string = 'Standard'

// ---------------------------------------------------------------------------
// Account
// ---------------------------------------------------------------------------

var accountName = '${namePrefix}-cosmos-${uniqueString(resourceGroup().id)}'

resource cosmosAccount 'Microsoft.DocumentDB/databaseAccounts@2023-11-15' = {
  name: accountName
  location: location
  tags: tags
  kind: 'GlobalDocumentDB'
  properties: {
    databaseAccountOfferType: skuName
    publicNetworkAccess: publicNetworkAccess
    // Disable shared-key access — all callers must use managed identity + RBAC.
    disableLocalAuth: true
    consistencyPolicy: {
      defaultConsistencyLevel: 'Session'
    }
    locations: [
      {
        locationName: location
        failoverPriority: 0
        isZoneRedundant: false
      }
    ]
    capabilities: []
  }
}

// ---------------------------------------------------------------------------
// Database
// ---------------------------------------------------------------------------

resource advisorDatabase 'Microsoft.DocumentDB/databaseAccounts/sqlDatabases@2023-11-15' = {
  parent: cosmosAccount
  name: 'advisor'
  properties: {
    resource: {
      id: 'advisor'
    }
  }
}

// ---------------------------------------------------------------------------
// Containers
// ---------------------------------------------------------------------------

resource sessionsContainer 'Microsoft.DocumentDB/databaseAccounts/sqlDatabases/containers@2023-11-15' = {
  parent: advisorDatabase
  name: 'sessions'
  properties: {
    resource: {
      id: 'sessions'
      partitionKey: {
        paths: ['/ownerId']
        kind: 'Hash'
      }
      indexingPolicy: {
        indexingMode: 'consistent'
        automatic: true
      }
    }
  }
}

resource requestsContainer 'Microsoft.DocumentDB/databaseAccounts/sqlDatabases/containers@2023-11-15' = {
  parent: advisorDatabase
  name: 'requests'
  properties: {
    resource: {
      id: 'requests'
      partitionKey: {
        paths: ['/ownerId']
        kind: 'Hash'
      }
      indexingPolicy: {
        indexingMode: 'consistent'
        automatic: true
      }
    }
  }
}

resource projectsContainer 'Microsoft.DocumentDB/databaseAccounts/sqlDatabases/containers@2023-11-15' = {
  parent: advisorDatabase
  name: 'projects'
  properties: {
    resource: {
      id: 'projects'
      partitionKey: {
        paths: ['/projectId']
        kind: 'Hash'
      }
      indexingPolicy: {
        indexingMode: 'consistent'
        automatic: true
      }
    }
  }
}

resource orgContextContainer 'Microsoft.DocumentDB/databaseAccounts/sqlDatabases/containers@2023-11-15' = {
  parent: advisorDatabase
  name: 'org-context'
  properties: {
    resource: {
      id: 'org-context'
      partitionKey: {
        paths: ['/orgId']
        kind: 'Hash'
      }
      indexingPolicy: {
        indexingMode: 'consistent'
        automatic: true
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Outputs
// ---------------------------------------------------------------------------

output accountName string = cosmosAccount.name
output accountId string = cosmosAccount.id
output endpoint string = cosmosAccount.properties.documentEndpoint
