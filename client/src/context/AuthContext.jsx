import React, { createContext, useContext, useState, useEffect } from 'react';
import { api } from '../services/api';

const AuthContext = createContext(null);

export const DEMO_LOGINS = [
  { roleKey: 'admin', label: 'Admin (City Operations)', email: 'admin@metropulse.blr', password: 'AdminPassword123!', role: 'admin' },
  { roleKey: 'officer_south', label: 'Officer (South Zone)', email: 'officer.south@metropulse.blr', password: 'Officer123!', role: 'officer', zone: 'south-bangalore' },
  { roleKey: 'officer_junction', label: 'Officer (Silk Board Jn)', email: 'officer.junction@metropulse.blr', password: 'Officer123!', role: 'officer', junction: 'JNC-BLR-001' },
  { roleKey: 'ambulance', label: 'Ambulance (AMB-BLR-01)', email: 'ambulance@metropulse.blr', password: 'Ambulance123!', role: 'ambulance', vehicleId: 'AMB-BLR-01' },
  { roleKey: 'citizen', label: 'Citizen (Logged In)', email: 'citizen@metropulse.blr', password: 'Citizen123!', role: 'citizen' },
  { roleKey: 'anonymous', label: 'Public Anonymous Viewer', email: '', password: '', role: 'anonymous' },
];

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null); // Anonymous by default (public view)
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
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

  const switchDemoRole = async (roleKey) => {
    if (roleKey === 'anonymous') {
      logout();
      return;
    }
    const target = DEMO_LOGINS.find((l) => l.roleKey === roleKey);
    if (target) {
      return await login(target.email, target.password);
    }
  };

  return (
    <AuthContext.Provider value={{ user, login, logout, switchDemoRole, isLoading }}>
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
