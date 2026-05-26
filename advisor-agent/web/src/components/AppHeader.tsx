import React from 'react';
import { useMsal, useIsAuthenticated } from '@azure/msal-react';
import { isDemoMode } from '../auth/msal-config';

export function AppHeader() {
  const { instance, accounts } = useMsal();
  const isAuthenticated = useIsAuthenticated();

  // Nothing to show in demo mode or when signed out.
  if (isDemoMode || !isAuthenticated) return null;

  const account = accounts[0];
  const displayName = account?.name ?? account?.username ?? 'User';

  function handleSignOut() {
    instance.logoutPopup({ account: account ?? undefined }).catch((err) => {
      console.error('[AppHeader] logoutPopup failed:', err);
    });
  }

  return (
    <header className="app-header" role="banner">
      <span className="app-header__user" aria-label={`Signed in as ${displayName}`}>
        {displayName}
      </span>
      <button type="button" className="app-header__sign-out" onClick={handleSignOut}>
        Sign out
      </button>
    </header>
  );
}
