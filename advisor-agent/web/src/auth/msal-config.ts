// Microsoft Entra / MSAL configuration
// https://learn.microsoft.com/entra/identity-platform/msal-react

import { Configuration, PublicClientApplication } from '@azure/msal-browser';

const isDemoMode = import.meta.env.VITE_ADVISOR_DEMO_MODE === 'true';

const tenantId = import.meta.env.VITE_ADVISOR_TENANT_ID;
const clientId = import.meta.env.VITE_ADVISOR_CLIENT_ID;

if (!isDemoMode && (!tenantId || !clientId)) {
  console.warn(
    '[msal-config] VITE_ADVISOR_TENANT_ID or VITE_ADVISOR_CLIENT_ID are not set. ' +
      'Set VITE_ADVISOR_DEMO_MODE=true to run without authentication.'
  );
}

const redirectUri =
  import.meta.env.VITE_AZURE_REDIRECT_URI ?? window.location.origin;

export const msalConfig: Configuration = isDemoMode
  ? {
      // Demo mode: MSAL is initialised but auth is bypassed in RequireAuth.
      auth: {
        clientId: 'demo-client-id',
        authority: 'https://login.microsoftonline.com/common',
        redirectUri: window.location.origin,
      },
      cache: {
        cacheLocation: 'sessionStorage',
        storeAuthStateInCookie: false,
      },
    }
  : {
      auth: {
        clientId: clientId ?? '',
        authority: `https://login.microsoftonline.com/${tenantId}`,
        redirectUri,
      },
      cache: {
        cacheLocation: 'sessionStorage',
        storeAuthStateInCookie: false,
      },
    };

export const loginRequest = {
  scopes: [`api://${clientId ?? 'demo-client-id'}/access_as_user`],
};

export const msalInstance = new PublicClientApplication(msalConfig);

export { isDemoMode };
