/*
  container-registry.bicep — Azure Container Registry for advisor agent images.

  Admin user is disabled. Image pulls by the Container App / Hosted Agent runtime
  must use the agent's managed identity with the AcrPull role (see identity.bicep).

  Docs:
    https://learn.microsoft.com/azure/container-registry/container-registry-intro
    https://learn.microsoft.com/azure/container-registry/container-registry-authentication-managed-identity
*/

@description('Prefix used to derive the registry name.')
param namePrefix string

@description('Azure region.')
param location string

@description('Resource tags.')
param tags object

// ACR names are globally unique, alphanumeric only, 5-50 chars.
var registryName = '${replace(namePrefix, '-', '')}acr${uniqueString(resourceGroup().id)}'

resource registry 'Microsoft.ContainerRegistry/registries@2023-07-01' = {
  name: registryName
  location: location
  tags: tags
  sku: {
    name: 'Basic'
  }
  properties: {
    adminUserEnabled: false
    publicNetworkAccess: 'Enabled'
    zoneRedundancy: 'Disabled'
  }
}

// ---------------------------------------------------------------------------
// Outputs
// ---------------------------------------------------------------------------

output name string = registry.name
output acrId string = registry.id
output loginServer string = registry.properties.loginServer
