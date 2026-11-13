import React, { createContext, useContext, useState, useEffect } from 'react';
import { api } from '../services/api';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState({
    id: 'guest-operator-01',
    name: 'Mission Flight Controller',
    email: 'operator@hyperpulse.io',
    role: 'operator',
    apiKey: 'hp_key_demo_public_operator',
  });
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    // Check if authenticated
    api.getMe()
      .then((res) => {
        if (res.user) setUser(res.user);
      })
      .catch(() => {
        // Fallback to default operator
      });
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
    setUser({
      id: 'guest-viewer',
      name: 'Guest Viewer',
      email: 'viewer@hyperpulse.io',
      role: 'viewer',
    });
  };

  return (
    <AuthContext.Provider value={{ user, login, logout, isLoading }}>
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
