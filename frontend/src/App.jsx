/**
 * App.jsx — Root application with React Router v6
 * Architecture §2.1 (component tree), §2.2 (context providers)
 *
 * Route map:
 *   /          → redirect to /dashboard
 *   /login     → LoginPage (public)
 *   /dashboard → Dashboard (protected)
 *   /knowledge-base → KnowledgeBase (protected, Day 18)
 *   /history   → HistoryPage (protected, future)
 *
 * ProtectedRoute: redirects to /login if not authenticated.
 * AuthRoute: redirects to /dashboard if already logged in.
 * Loading state: blank screen while hydrating token from localStorage.
 */

import { useState } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';

import { AuthProvider, useAuth }   from './contexts/AuthContext.jsx';
import { StockProvider }           from './contexts/StockContext.jsx';

import Navbar              from './components/Navbar.jsx';
import LoginPage           from './pages/LoginPage.jsx';
import Dashboard           from './pages/Dashboard.jsx';
import HistoryPage         from './pages/HistoryPage.jsx';
import KnowledgeBasePage   from './pages/KnowledgeBasePage.jsx';

// ── Route guards ─────────────────────────────────────────────────────────────

/** Redirects to /login if no token. Shows nothing while hydrating. */
function ProtectedRoute({ children }) {
  const { isAuthenticated, loading } = useAuth();
  if (loading)          return <div style={{ minHeight: '100vh' }} />;
  if (!isAuthenticated) return <Navigate to="/login" replace />;
  return children;
}

/** Redirects to /dashboard if already logged in (e.g. hit /login when authed). */
function AuthRoute({ children }) {
  const { isAuthenticated, loading } = useAuth();
  if (loading)         return <div style={{ minHeight: '100vh' }} />;
  if (isAuthenticated) return <Navigate to="/dashboard" replace />;
  return children;
}

// ── Layout — Navbar + page ───────────────────────────────────────────────────
function AppLayout({ children, onSearch }) {
  return (
    <>
      <Navbar onSearch={onSearch} />
      <main className="main-content">
        {children}
      </main>
    </>
  );
}

// ── Inner app — needs auth context ───────────────────────────────────────────
function AppRoutes() {
  // searchSymbol flows from Navbar → Dashboard via state
  const [searchSymbol, setSearchSymbol] = useState(null);

  return (
    <Routes>
      {/* Root → dashboard */}
      <Route path="/" element={<Navigate to="/dashboard" replace />} />

      {/* Login / register — public only */}
      <Route
        path="/login"
        element={
          <AuthRoute>
            <LoginPage />
          </AuthRoute>
        }
      />

      {/* Dashboard — protected */}
      <Route
        path="/dashboard"
        element={
          <ProtectedRoute>
            <AppLayout onSearch={setSearchSymbol}>
              <Dashboard searchSymbol={searchSymbol} />
            </AppLayout>
          </ProtectedRoute>
        }
      />

      {/* Knowledge Base — protected */}
      <Route
        path="/knowledge-base"
        element={
          <ProtectedRoute>
            <AppLayout onSearch={setSearchSymbol}>
              <KnowledgeBasePage />
            </AppLayout>
          </ProtectedRoute>
        }
      />

      {/* History — protected */}
      <Route
        path="/history"
        element={
          <ProtectedRoute>
            <AppLayout onSearch={setSearchSymbol}>
              <HistoryPage />
            </AppLayout>
          </ProtectedRoute>
        }
      />

      {/* 404 fallback */}
      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  );
}

// ── Root export ──────────────────────────────────────────────────────────────
export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <StockProvider>
          <AppRoutes />
        </StockProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}
