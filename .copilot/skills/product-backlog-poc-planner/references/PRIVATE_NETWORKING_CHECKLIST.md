# Private Networking Checklist

Use this checklist when the backlog includes a database, storage account, search service, or other data-bearing Azure service.

## Why This Matters

Private networking is not a polish task. If enterprise policy disables public access after the team builds against public endpoints, the POC breaks at the exact moment stakeholders ask whether it can become real.

## Service-Neutral Backlog Requirements

- Identify every data-bearing Azure service.
- Decide which app components must reach each service.
- Add VNet and subnet requirements for private connectivity.
- Add private endpoint requirements for each private service.
- Add private DNS zone requirements so service names resolve to private IPs.
- Add application hosting network integration requirements when the host is not directly inside the VNet.
- Disable public network access where the selected service supports it.
- Add validation tasks proving the deployed app reaches the database privately.
- Add a developer-access decision: local VPN, jumpbox, dev tunnel, or cloud-only access.

## Cosmos DB Notes

Microsoft Learn states that Azure Cosmos DB can use Private Link through private endpoints and that `publicNetworkAccess` can be set to `Disabled` during account creation to block public network access before private endpoints are added.

Backlog acceptance criteria:

- Cosmos DB account Bicep includes private endpoint support.
- `publicNetworkAccess` is disabled during creation unless an approved exception exists.
- Private DNS is configured for the selected Cosmos DB API.
- App connectivity is tested from the deployed host, not only from a developer machine.

Reference: [Configure Azure Private Link for an Azure Cosmos DB account](https://learn.microsoft.com/azure/cosmos-db/how-to-configure-private-endpoints)

## Azure SQL Notes

Microsoft Learn states that adding a private endpoint connection to Azure SQL does not block public routing by default; public network access must be denied/disabled separately.

Backlog acceptance criteria:

- Azure SQL private endpoint is configured.
- Public network access is disabled.
- Firewall rules do not become the long-term access model unless explicitly approved.
- Private DNS resolution is validated from the app host.

Reference: [Azure Private Link for Azure SQL Database](https://learn.microsoft.com/azure/azure-sql/database/private-endpoint-overview)

## Decision Items to Add When Unknown

- Select database service and private endpoint subresource.
- Confirm whether local development needs database access.
- Confirm whether CI/CD validation runs inside a network path that can reach private endpoints.
- Confirm whether app ingress can remain public while database access is private.
- Confirm whether the POC needs cross-premises access through VPN or ExpressRoute.
