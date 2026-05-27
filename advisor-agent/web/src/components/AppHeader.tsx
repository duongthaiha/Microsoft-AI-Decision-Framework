import React from 'react';
import { NavLink } from 'react-router-dom';
import { useMsal, useIsAuthenticated } from '@azure/msal-react';
import { isDemoMode } from '../auth/msal-config';

const ADMIN_ROLE = 'AdvisorAdmin';
// TODO M2.1: switch to 'AdvisorReviewer' once the role is provisioned in Entra
const REVIEWER_ROLE = 'AdvisorAdmin';

function hasRole(
  account: ReturnType<typeof useMsal>['accounts'][number] | undefined,
  role: string,
): boolean {
  if (!account) return false;
  const roles = (account.idTokenClaims as Record<string, unknown> | undefined)?.roles;
  return Array.isArray(roles) && roles.includes(role);
}

export function AppHeader() {
  const { instance, accounts } = useMsal();
  const isAuthenticated = useIsAuthenticated();

  if (isDemoMode || !isAuthenticated) return null;

  const account = accounts[0];
  const displayName = account?.name ?? account?.username ?? 'User';
  const isAdmin = hasRole(account, ADMIN_ROLE);
  const isReviewer = hasRole(account, REVIEWER_ROLE);

  function handleSignOut() {
    instance.logoutPopup({ account: account ?? undefined }).catch((err) => {
      console.error('[AppHeader] logoutPopup failed:', err);
    });
  }

  return (
    <header className="app-header" role="banner">
      <nav className="app-header__nav" aria-label="Primary navigation">
        {isAdmin && (
          <NavLink
            to="/admin"
            className={({ isActive }) =>
              `app-header__nav-link${isActive ? ' app-header__nav-link--active' : ''}`
            }
          >
            Admin
          </NavLink>
        )}
        {isReviewer && (
          <NavLink
            to="/reviewer"
            className={({ isActive }) =>
              `app-header__nav-link${isActive ? ' app-header__nav-link--active' : ''}`
            }
          >
            Reviewer
          </NavLink>
        )}
      </nav>
      <span className="app-header__user" aria-label={`Signed in as ${displayName}`}>
        {displayName}
      </span>
      <button type="button" className="app-header__sign-out" onClick={handleSignOut}>
        Sign out
      </button>
    </header>
  );
}
