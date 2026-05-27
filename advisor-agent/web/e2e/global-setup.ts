/**
 * Playwright global setup — SP token acquisition for live-API mode.
 *
 * In mock mode (no E2E_SP_* env vars): writes an empty token store so
 * tests know to mock API responses rather than forward to the real API.
 *
 * In live mode (E2E_SP_* set): acquires a client-credentials token from
 * Entra for the API audience api://4f4f4a4d-e60f-4b86-a681-86059aae4597
 * and stores it at e2e/.auth/token.json for test fixtures to read.
 *
 * Auth approach: MSAL Node ConfidentialClientApplication with
 * acquireTokenByClientCredential. This avoids MSAL browser popup entirely.
 * The SP must be granted the Advisor.Smoke application role on the API app
 * registration (see .squad/decisions/inbox/brett-playwright-spa-smoke.md).
 *
 * Microsoft Learn — client credentials flow:
 *   https://learn.microsoft.com/entra/identity-platform/v2-oauth2-client-creds-grant-flow
 */

import { writeFile, mkdir } from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const API_AUDIENCE = 'api://4f4f4a4d-e60f-4b86-a681-86059aae4597';

export interface TokenStore {
  accessToken: string;
  expiresOn: string | null;
  /** true when SP credentials were available and token was actually acquired */
  live: boolean;
}

export default async function globalSetup(): Promise<void> {
  const clientId     = process.env.E2E_SP_CLIENT_ID;
  const clientSecret = process.env.E2E_SP_CLIENT_SECRET;
  const tenantId     = process.env.E2E_SP_TENANT_ID;

  const authDir = path.join(__dirname, '.auth');
  await mkdir(authDir, { recursive: true });
  const tokenPath = path.join(authDir, 'token.json');

  if (!clientId || !clientSecret || !tenantId) {
    console.log(
      '[global-setup] E2E_SP_* credentials not set — running in API-mock mode. ' +
      'API calls will be intercepted with mock responses.',
    );
    const store: TokenStore = { accessToken: '', expiresOn: null, live: false };
    await writeFile(tokenPath, JSON.stringify(store, null, 2));
    return;
  }

  // Dynamically import @azure/msal-node so the package is optional in mock-mode runs.
  // CI must have it installed: npm install -D @azure/msal-node
  let ConfidentialClientApplication: typeof import('@azure/msal-node').ConfidentialClientApplication;
  try {
    ({ ConfidentialClientApplication } = await import('@azure/msal-node'));
  } catch {
    throw new Error(
      '[global-setup] @azure/msal-node is not installed. ' +
      'Run: cd web && npm install -D @azure/msal-node',
    );
  }

  const cca = new ConfidentialClientApplication({
    auth: {
      clientId,
      clientSecret,
      authority: `https://login.microsoftonline.com/${tenantId}`,
    },
  });

  const result = await cca.acquireTokenByClientCredential({
    scopes: [`${API_AUDIENCE}/.default`],
  });

  if (!result?.accessToken) {
    throw new Error(
      '[global-setup] acquireTokenByClientCredential returned no token. ' +
      'Verify the SP has the Advisor.Smoke app role on the API registration.',
    );
  }

  const store: TokenStore = {
    accessToken: result.accessToken,
    expiresOn: result.expiresOn?.toISOString() ?? null,
    live: true,
  };

  await writeFile(tokenPath, JSON.stringify(store, null, 2));
  console.log(`[global-setup] SP token acquired; expires ${store.expiresOn}`);
}
