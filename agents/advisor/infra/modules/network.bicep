// ============================================================
// Module: Virtual Network, Subnets
//
// Address plan:
//   10.0.0.0/16  — total VNet
//   10.0.0.0/23  — aca-subnet  (Container Apps, requires /23+, delegated)
//   10.0.4.0/24  — pe-subnet   (private endpoints, PE network policies disabled)
// ============================================================

param vnetName string
param location string
param tags object

var acaSubnetName = 'aca-subnet'
var peSubnetName = 'pe-subnet'

resource vnet 'Microsoft.Network/virtualNetworks@2023-04-01' = {
  name: vnetName
  location: location
  tags: tags
  properties: {
    addressSpace: {
      addressPrefixes: [
        '10.0.0.0/16'
      ]
    }
    subnets: [
      {
        name: acaSubnetName
        properties: {
          addressPrefix: '10.0.0.0/23'
          // Delegation required for Container Apps Consumption workload profile
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
        name: peSubnetName
        properties: {
          addressPrefix: '10.0.4.0/24'
          // Private endpoint network policies must be disabled for PE deployment
          privateEndpointNetworkPolicies: 'Disabled'
          privateLinkServiceNetworkPolicies: 'Disabled'
        }
      }
    ]
  }
}

output vnetId string = vnet.id
output vnetName string = vnet.name
output acaSubnetId string = '${vnet.id}/subnets/${acaSubnetName}'
output privateEndpointSubnetId string = '${vnet.id}/subnets/${peSubnetName}'
