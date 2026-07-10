"use client";

import { createContext, useContext, useEffect, useState } from "react";
import { User, login as apiLogin, fetchMe, setAuthToken, getAuthToken } from "./api";

type Ctx = {
  user: User | null;
  loading: boolean;
  login: (username: string, password: string) => Promise<void>;
  logout: () => void;
  setUser: (u: User) => void;
  hasPerm: (perm: string) => boolean;
};

const AuthContext = createContext<Ctx>({} as Ctx);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (getAuthToken()) {
      fetchMe()
        .then(setUser)
        .catch(() => setAuthToken(null))
        .finally(() => setLoading(false));
    } else {
      setLoading(false);
    }
  }, []);

  const login = async (username: string, password: string) => {
    const { token, user } = await apiLogin(username, password);
    setAuthToken(token);
    setUser(user);
  };

  const logout = () => {
    setAuthToken(null);
    setUser(null);
  };

  const hasPerm = (perm: string) =>
    !!user && (user.role === "admin" || (user.permissions || []).includes(perm));

  return (
    <AuthContext.Provider value={{ user, loading, login, logout, setUser, hasPerm }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
