import React from 'react';
import { useIsAuthenticated, useMsal } from '@azure/msal-react';
import { isDemoMode, loginRequest } from './msal-config';

interface RequireAuthProps {
  children: React.ReactNode;
}

export function RequireAuth({ children }: RequireAuthProps) {
  const isAuthenticated = useIsAuthenticated();
  const { instance } = useMsal();

  if (isDemoMode || isAuthenticated) {
    return <>{children}</>;
  }

  return (
    <main className="auth-gate">
      <h1>Sign in to continue</h1>
      <p>The AI Project Advisor requires a Microsoft Entra account.</p>
      <button
        type="button"
        onClick={() => instance.loginRedirect(loginRequest)}
      >
        Sign in with Microsoft
      </button>
    </main>
  );
}
