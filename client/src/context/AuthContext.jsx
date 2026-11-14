import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { api } from '../services/api';

const AuthContext = createContext(null);

const DEFAULT_ADMIN = {
  id: 'admin-default',
  name: 'Bengaluru Traffic Operations Commander',
  email: 'admin@metropulse.io',
  role: 'admin',
  zones: ['south-bangalore', 'east-bangalore', 'north-bangalore', 'central-bangalore'],
  persona: 'admin',
};

const ANONYMOUS_VIEWER = {
  id: 'anonymous-viewer',
  name: 'Anonymous Viewer',
  email: 'viewer@metropulse.io',
  role: 'viewer',
  zones: [],
  anonymous: true,
  persona: 'anonymous',
};

export function AuthProvider({ children }) {
  const [token, setToken] = useState(() => localStorage.getItem('hp_token') || null);
  const [user, setUser] = useState(DEFAULT_ADMIN);
  const [isLoading, setIsLoading] = useState(false);
  const [authError, setAuthError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    const stored = localStorage.getItem('hp_token');
    if (!stored) {
      // Auto-boot as Admin persona for hackathon demo convenience
      api
        .demoLogin('admin')
        .then((res) => {
          if (!cancelled && res?.token && res?.user) {
            localStorage.setItem('hp_token', res.token);
            setToken(res.token);
            setUser({ ...res.user, persona: 'admin' });
          }
        })
        .catch(() => {});
      return;
    }

    api
      .getMe()
      .then((res) => {
        if (!cancelled && res.user) {
          setUser({
            ...res.user,
            persona: res.user.anonymous
              ? 'anonymous'
              : res.user.role === 'admin'
                ? 'admin'
                : res.user.role === 'operator'
                  ? res.user.zones?.includes('east-bangalore')
                    ? 'east-operator'
                    : 'south-operator'
                  : 'viewer',
          });
        }
      })
      .catch((err) => {
        if (!cancelled) {
          if (err.status === 401) {
            localStorage.removeItem('hp_token');
            setToken(null);
            setUser(DEFAULT_ADMIN);
          }
        }
      });

    return () => {
      cancelled = true;
    };
  }, [token]);

  const login = useCallback(async (email, password) => {
    setIsLoading(true);
    setAuthError(null);
    try {
      const data = await api.login(email, password);
      localStorage.setItem('hp_token', data.token);
      setToken(data.token);
      setUser(data.user);
      return data;
    } catch (err) {
      setAuthError(err.message);
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, []);

  const switchPersona = useCallback(async (persona) => {
    setAuthError(null);
    if (!persona || persona === 'anonymous') {
      localStorage.removeItem('hp_token');
      setToken(null);
      setUser(ANONYMOUS_VIEWER);
      return { success: true, user: ANONYMOUS_VIEWER };
    }

    setIsLoading(true);
    try {
      const data = await api.demoLogin(persona);
      localStorage.setItem('hp_token', data.token);
      setToken(data.token);
      setUser({ ...data.user, persona: data.persona || persona });
      return data;
    } catch (err) {
      setAuthError(err.message);
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem('hp_token');
    setToken(null);
    setAuthError(null);
    setUser(ANONYMOUS_VIEWER);
  }, []);

  const clearAuthError = useCallback(() => setAuthError(null), []);

  return (
    <AuthContext.Provider
      value={{
        user,
        token,
        login,
        switchPersona,
        logout,
        isLoading,
        authError,
        clearAuthError,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return ctx;
}
