/**
 * AuthContext.jsx — Authentication state management
 * Architecture §2.2
 *
 * Provides: user, token, login(), logout(), register()
 * Token stored in localStorage under key 'qs_token'.
 * User profile stored under 'qs_user'.
 *
 * Consumed by: Navbar (greeting + logout), authMiddleware (route guards),
 *              LoginPage (login/register forms).
 */

import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { authService } from '../services/authService.js';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user,    setUser]    = useState(null);
  const [token,   setToken]   = useState(null);
  const [loading, setLoading] = useState(true);   // true while hydrating from localStorage

  // ── Hydrate from localStorage on mount ───────────────────────────────────────
  useEffect(() => {
    try {
      const storedToken = localStorage.getItem('qs_token');
      const storedUser  = localStorage.getItem('qs_user');
      if (storedToken && storedUser) {
        setToken(storedToken);
        setUser(JSON.parse(storedUser));
      }
    } catch {
      // Corrupted localStorage — clear and start fresh
      localStorage.removeItem('qs_token');
      localStorage.removeItem('qs_user');
    } finally {
      setLoading(false);
    }
  }, []);

  // ── login — called by LoginPage after successful POST /api/auth/login ────────
  const login = useCallback((token, user) => {
    localStorage.setItem('qs_token', token);
    localStorage.setItem('qs_user',  JSON.stringify(user));
    setToken(token);
    setUser(user);
  }, []);

  // ── logout — clears all state and localStorage ───────────────────────────────
  const logout = useCallback(() => {
    localStorage.removeItem('qs_token');
    localStorage.removeItem('qs_user');
    setToken(null);
    setUser(null);
  }, []);

  // ── register — wraps authService.register, then auto-logs in on success ──────
  const register = useCallback(async (email, password, displayName) => {
    const data = await authService.register(email, password, displayName);
    login(data.token, data.user);
    return data;
  }, [login]);

  // ── loginWithCredentials — wraps authService.login ───────────────────────────
  const loginWithCredentials = useCallback(async (email, password) => {
    const data = await authService.login(email, password);
    login(data.token, data.user);
    return data;
  }, [login]);

  const value = {
    user,
    token,
    loading,
    isAuthenticated: !!token,
    login,
    logout,
    register,
    loginWithCredentials,
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}

// ── Custom hook ──────────────────────────────────────────────────────────────
export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}
