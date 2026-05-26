/**
 * Cosmos DB client factory for the AI Project Advisor Agent.
 *
 * Uses ManagedIdentityCredential in production (no secrets in config).
 * Falls back to DefaultAzureCredential when ADVISOR_LOCAL_DEV === 'true',
 * which covers VS Code credential, Azure CLI, and environment variables
 * so local development works without a managed identity.
 *
 * Microsoft Learn — grant Cosmos DB data-plane RBAC to a managed identity:
 * https://learn.microsoft.com/azure/cosmos-db/nosql/security/how-to-grant-data-plane-role-based-access
 */

import { CosmosClient } from "@azure/cosmos";
import {
  DefaultAzureCredential,
  ManagedIdentityCredential,
  type TokenCredential,
} from "@azure/identity";

/**
 * Returns the appropriate TokenCredential for this runtime environment.
 * In production (ADVISOR_LOCAL_DEV != 'true') we insist on ManagedIdentityCredential
 * so there is no accidental fallback to environment-variable secrets.
 */
function resolveCosmosCredential(
  overrideCredential?: TokenCredential
): TokenCredential {
  if (overrideCredential) return overrideCredential;
  if (process.env.ADVISOR_LOCAL_DEV === "true") {
    // DefaultAzureCredential supports VS Code session, Azure CLI, env vars, etc.
    return new DefaultAzureCredential();
  }
  // Production: hosted agent identity / managed identity only.
  return new ManagedIdentityCredential();
}

/**
 * Creates a Cosmos DB client authenticated with managed identity.
 *
 * @param endpoint  The Cosmos DB account endpoint URL (e.g. https://myaccount.documents.azure.com:443/).
 * @param credential  Optional override credential — defaults to ManagedIdentityCredential in prod,
 *                    DefaultAzureCredential when ADVISOR_LOCAL_DEV === 'true'.
 */
export function createCosmosClient(
  endpoint: string,
  credential?: TokenCredential
): CosmosClient {
  const cred = resolveCosmosCredential(credential);
  return new CosmosClient({ endpoint, aadCredentials: cred });
}
