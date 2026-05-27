/*
  private-endpoint.bicep — Private endpoint + private DNS zone for a PaaS service.

  Creates four resources:
    1. Microsoft.Network/privateEndpoints          — the NIC in pe-subnet
    2. Microsoft.Network/privateDnsZones           — zone for the service (e.g. privatelink.documents.azure.com)
    3. privateDnsZones/virtualNetworkLinks         — links the zone to the VNet so VNet DNS resolves it
    4. privateEndpoints/privateDnsZoneGroups       — auto-registers the endpoint IP in the DNS zone

  Call this module once per PaaS service that requires private networking.

  Docs:
    Cosmos DB:  https://learn.microsoft.com/azure/cosmos-db/how-to-configure-private-endpoints
    AI Search:  https://learn.microsoft.com/azure/search/service-create-private-endpoint
    Private DNS: https://learn.microsoft.com/azure/private-link/private-endpoint-dns
*/

@description('Prefix used in resource names.')
param namePrefix string

@description('Azure region for the private endpoint (must match the service region).')
param location string

@description('Resource tags.')
param tags object

@description('Full resource ID of the PaaS service to connect to.')
param targetResourceId string

@description('Short identifier used in resource naming (e.g. "cosmos", "search").')
param resourceShortName string

@description('Private link sub-resource group ID. Use "Sql" for Cosmos DB, "searchService" for AI Search.')
param groupId string

@description('Private DNS zone name (e.g. "privatelink.documents.azure.com").')
param privateDnsZoneName string

@description('Subnet resource ID where the private endpoint NIC will be placed.')
param subnetId string

@description('VNet resource ID — required to link the private DNS zone for in-VNet resolution.')
param vnetId string

// ---------------------------------------------------------------------------
// Private Endpoint
// ---------------------------------------------------------------------------

resource privateEndpoint 'Microsoft.Network/privateEndpoints@2023-11-01' = {
  name: '${namePrefix}-pe-${resourceShortName}'
  location: location
  tags: tags
  properties: {
    subnet: {
      id: subnetId
    }
    privateLinkServiceConnections: [
      {
        name: '${namePrefix}-plsc-${resourceShortName}'
        properties: {
          privateLinkServiceId: targetResourceId
          groupIds: [groupId]
        }
      }
    ]
  }
}

// ---------------------------------------------------------------------------
// Private DNS Zone + VNet Link
// ---------------------------------------------------------------------------

resource privateDnsZone 'Microsoft.Network/privateDnsZones@2020-06-01' = {
  name: privateDnsZoneName
  // Private DNS zones are always global — region is irrelevant.
  location: 'global'
  tags: tags
}

resource privateDnsZoneVnetLink 'Microsoft.Network/privateDnsZones/virtualNetworkLinks@2020-06-01' = {
  parent: privateDnsZone
  name: '${namePrefix}-dnslink-${resourceShortName}'
  location: 'global'
  properties: {
    virtualNetwork: {
      id: vnetId
    }
    // Auto-registration is for VMs; we don't need it — the DNS zone group handles endpoint registration.
    registrationEnabled: false
  }
}

// ---------------------------------------------------------------------------
// DNS Zone Group (auto-registers the endpoint IP into the DNS zone)
// ---------------------------------------------------------------------------

resource privateDnsZoneGroup 'Microsoft.Network/privateEndpoints/privateDnsZoneGroups@2023-11-01' = {
  parent: privateEndpoint
  name: 'default'
  properties: {
    privateDnsZoneConfigs: [
      {
        name: replace(privateDnsZoneName, '.', '-')
        properties: {
          privateDnsZoneId: privateDnsZone.id
        }
      }
    ]
  }
}

// ---------------------------------------------------------------------------
// Outputs
// ---------------------------------------------------------------------------

output privateEndpointId string = privateEndpoint.id
output privateDnsZoneId string = privateDnsZone.id
