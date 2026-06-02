import { useEffect, useState } from 'react';
import axios from 'axios';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useAuthStore } from './store/authStore';
import Layout from './components/layout/Layout';
import Login from './pages/auth/Login';
import Signup from './pages/auth/Signup';
import VerifyOTP from './pages/auth/VerifyOTP';
import ForgotPassword from './pages/auth/ForgotPassword';
import ResetPassword from './pages/auth/ResetPassword';
import Dashboard from './pages/Dashboard';
import Templates from './pages/Templates';
import AIAnalyze from './pages/AIAnalyze';
import Records from './pages/Records';
import Alerts from './pages/Alerts';
import Profile from './pages/Profile';
import Scraper from './pages/Scraper';
import Automation from './pages/Automation';
import Analytics from './pages/Analytics';
import Settings from './pages/Settings';
import OAuthCallback from './pages/OAuthCallback';

/**
 * Runs once on startup. If localStorage has isAuthenticated=true but the
 * access token is gone (page reload), attempt a silent token refresh.
 * Shows a full-screen spinner until resolved so protected routes never
 * render with a stale/empty access token.
 */
function AuthInitializer({ children }: { children: React.ReactNode }) {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const accessToken = useAuthStore((s) => s.accessToken);
  const refreshToken = useAuthStore((s) => s.refreshToken);
  const setTokens = useAuthStore((s) => s.setTokens);
  const logout = useAuthStore((s) => s.logout);

  // Only block rendering if we have persisted auth but no in-memory access token
  const [ready, setReady] = useState(!isAuthenticated || !!accessToken);

  useEffect(() => {
    if (ready) return;

    const publicAuthPaths = ['/login', '/signup', '/verify-email', '/forgot-password', '/reset-password'];
    if (publicAuthPaths.includes(window.location.pathname)) {
      logout();
      setReady(true);
      return;
    }

    if (!refreshToken) {
      logout();
      setReady(true);
      return;
    }

    // Use plain axios (not the intercepted `api` instance) to avoid recursion
    axios
      .post('/api/v1/auth/refresh', { refreshToken })
      .then((res) => {
        setTokens(res.data.accessToken, res.data.refreshToken);
      })
      .catch(() => {
        logout();
      })
      .finally(() => setReady(true));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  if (!ready) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return <>{children}</>;
}

function PrivateRoute({ children }: { children: React.ReactNode }) {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  return isAuthenticated ? <>{children}</> : <Navigate to="/login" replace />;
}

function PublicRoute({ children }: { children: React.ReactNode }) {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  return isAuthenticated ? <Navigate to="/" replace /> : <>{children}</>;
}

/** Any unknown URL → login when guest, dashboard when signed in */
function CatchAllRoute() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  return <Navigate to={isAuthenticated ? '/' : '/login'} replace />;
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthInitializer>
        <Routes>
          {/* Public */}
          <Route path="/login" element={<PublicRoute><Login /></PublicRoute>} />
          <Route path="/signup" element={<PublicRoute><Signup /></PublicRoute>} />
          <Route path="/verify-email" element={<VerifyOTP />} />
          <Route path="/forgot-password" element={<ForgotPassword />} />
          <Route path="/reset-password" element={<ResetPassword />} />

          {/* Protected */}
          <Route path="/" element={<PrivateRoute><Layout /></PrivateRoute>}>
            <Route index element={<Dashboard />} />
            <Route path="instructions" element={<Templates />} />
            <Route path="templates" element={<Navigate to="/instructions" replace />} />
            <Route path="ai-analyze" element={<AIAnalyze />} />
            <Route path="records" element={<Records />} />
            <Route path="alerts" element={<Alerts />} />
            <Route path="analytics" element={<Analytics />} />
            <Route path="profile" element={<Profile />} />
            <Route path="scraper" element={<Scraper />} />
            <Route path="automation" element={<Automation />} />
            <Route path="settings" element={<Settings />} />
          </Route>

          {/* Catch-all: authenticated → dashboard, guest → login */}
          <Route path="*" element={<CatchAllRoute />} />

          {/* OAuth callback — no sidebar, accessible whether logged in or not */}
          <Route path="/oauth-callback" element={<OAuthCallback />} />
        </Routes>
      </AuthInitializer>
    </BrowserRouter>
  );
}
