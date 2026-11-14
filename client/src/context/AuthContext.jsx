import React, { createContext, useContext, useState, useEffect } from 'react';
import { api } from '../services/api';

const AuthContext = createContext(null);

// Demo roles for evaluator switcher (contains NO passwords)
export const DEMO_LOGINS = [
  { roleKey: 'admin', label: 'Admin (City Operations)', role: 'admin' },
  { roleKey: 'officer_south', label: 'Officer (South Zone)', role: 'officer', zone: 'south-bangalore' },
  { roleKey: 'officer_junction', label: 'Officer (Silk Board Jn)', role: 'officer', junction: 'JNC-BLR-001' },
  { roleKey: 'ambulance', label: 'Ambulance (AMB-BLR-01)', role: 'ambulance', vehicleId: 'AMB-BLR-01' },
  { roleKey: 'citizen', label: 'Citizen (Logged In)', role: 'citizen' },
  { roleKey: 'anonymous', label: 'Public Anonymous Viewer', role: 'anonymous' },
];

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null); // Anonymous by default (public view)
  const [isLoading, setIsLoading] = useState(false);
  const [demoMode, setDemoMode] = useState(false);

  useEffect(() => {
    // Check demo mode setting from server
    api.getConfig()
      .then((cfg) => {
        if (cfg && cfg.demoMode) setDemoMode(true);
      })
      .catch(() => {});

    // Check existing session
    const token = localStorage.getItem('hp_token');
    if (token) {
      api.getMe()
        .then((res) => {
          if (res.user) setUser(res.user);
          else setUser(null);
        })
        .catch(() => {
          localStorage.removeItem('hp_token');
          setUser(null);
        });
    }
  }, []);

  const login = async (email, password) => {
    setIsLoading(true);
    try {
      const data = await api.login(email, password);
      localStorage.setItem('hp_token', data.token);
      setUser(data.user);
      return data;
    } finally {
      setIsLoading(false);
    }
  };

  const logout = () => {
    localStorage.removeItem('hp_token');
    setUser(null);
  };

  // Switch demo account via server endpoint (zero passwords exposed to browser)
  const switchDemoRole = async (roleKey) => {
    if (roleKey === 'anonymous') {
      logout();
      return;
    }
    setIsLoading(true);
    try {
      const data = await api.demoLogin(roleKey);
      localStorage.setItem('hp_token', data.token);
      setUser(data.user);
      return data;
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <AuthContext.Provider value={{ user, login, logout, switchDemoRole, isLoading, demoMode }}>
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
