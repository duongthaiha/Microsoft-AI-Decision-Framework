import React from 'react';
import { useMsal } from '@azure/msal-react';
import { isDemoMode } from './msal-config';

const ADMIN_ROLE = 'AdvisorAdmin';

interface RequireAdminProps {
  children: React.ReactNode;
}

function hasAdminRole(account: ReturnType<typeof useMsal>['accounts'][number] | null): boolean {
  if (!account) return false;
  const roles = (account.idTokenClaims as Record<string, unknown> | undefined)?.roles;
  if (!Array.isArray(roles)) return false;
  return roles.includes(ADMIN_ROLE);
}

export function RequireAdmin({ children }: RequireAdminProps) {
  const { accounts } = useMsal();
  const activeAccount = accounts[0] ?? null;

  // In demo mode there is no token; treat as non-admin for safety.
  if (!isDemoMode && hasAdminRole(activeAccount)) {
    return <>{children}</>;
  }

  return (
    <main className="error-gate">
      <h1>403 — admin role required</h1>
      <p>
        This section requires the <code>{ADMIN_ROLE}</code> role. Contact your
        administrator if you believe this is an error.
      </p>
    </main>
  );
}
