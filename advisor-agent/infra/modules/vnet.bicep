/*
  vnet.bicep — Virtual Network for private networking.

  Two subnets:
    aca-subnet  — delegated to Microsoft.App/environments so the Container Apps
                  Environment can inject its infrastructure into the VNet.
                  Sized /23 (512 addresses) — Microsoft minimum for Consumption
                  workload-profile environments.
    pe-subnet   — for Private Endpoints (Cosmos DB, AI Search, etc.).
                  No delegation; privateEndpointNetworkPolicies must be Disabled.

  Docs:
    https://learn.microsoft.com/azure/container-apps/networking
    https://learn.microsoft.com/azure/private-link/private-endpoint-overview
*/

@description('Prefix applied to the VNet name.')
param namePrefix string

@description('Azure region for the VNet.')
param location string

@description('Resource tags.')
param tags object

// ---------------------------------------------------------------------------
// Virtual Network
// ---------------------------------------------------------------------------

var vnetName = '${namePrefix}-vnet-${uniqueString(resourceGroup().id)}'

resource vnet 'Microsoft.Network/virtualNetworks@2023-11-01' = {
  name: vnetName
  location: location
  tags: tags
  properties: {
    addressSpace: {
      addressPrefixes: ['10.0.0.0/22']
    }
    subnets: [
      {
        // Delegated to ACA environment infrastructure.
        // /23 = 512 addresses; satisfies Microsoft minimum for Consumption plan VNet integration.
        name: 'aca-subnet'
        properties: {
          addressPrefix: '10.0.0.0/23'
          delegations: [
            {
              name: 'Microsoft.App.environments'
              properties: {
                serviceName: 'Microsoft.App/environments'
              }
            }
          ]
        }
      }
      {
        // Private endpoint subnet — no delegation, network policies disabled.
        // /27 = 32 addresses; enough for up to ~10 private endpoints.
        name: 'pe-subnet'
        properties: {
          addressPrefix: '10.0.2.0/27'
          privateEndpointNetworkPolicies: 'Disabled'
        }
      }
    ]
  }
}

// ---------------------------------------------------------------------------
// Outputs
// ---------------------------------------------------------------------------

output vnetId string = vnet.id
output vnetName string = vnet.name
// Reference subnet IDs from the deployed resource to avoid ordering issues.
output acaSubnetId string = vnet.properties.subnets[0].id
output peSubnetId string = vnet.properties.subnets[1].id
