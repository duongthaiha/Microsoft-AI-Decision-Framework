import { NavLink } from 'react-router-dom';
import type { PropsWithChildren } from 'react';

export function Layout({ children }: PropsWithChildren) {
  return (
    <div className="app-shell">
      <header className="header">
        <div className="header-inner">
          <NavLink to="/" className="brand">AI Framework Advisor</NavLink>
          <nav className="nav" aria-label="Main navigation">
            <NavLink to="/">Home</NavLink>
            <NavLink to="/admin">Admin</NavLink>
          </nav>
        </div>
      </header>
      <main className="main">{children}</main>
      <footer className="footer">Built for outcome-first Microsoft AI decision making.</footer>
    </div>
  );
}
