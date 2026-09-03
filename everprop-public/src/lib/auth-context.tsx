"use client";

import React, { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { MOCK_USERS, type UserProfile } from "@/data/auth-sample";
import { currentEverpropUser, loginEverprop, logoutEverprop } from "@/lib/everprop-api";
import { isMockDataMode } from "@/lib/data-mode";

interface AuthContextType {
  currentUser: UserProfile | null;
  isLoaded: boolean;
  login: (email: string, password: string) => Promise<void>;
  loginDemo: (email: string, delayMs?: number) => Promise<void>;
  logout: () => Promise<void>;
  invalidateSession: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);
const DEMO_STORAGE_KEY = "everprop:demo-user";

export function AuthProvider({ children }: { children: ReactNode }) {
  const [currentUser, setCurrentUser] = useState<UserProfile | null>(null);
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    let active = true;

    async function restoreSession() {
      if (isMockDataMode) {
        const storedDemo = localStorage.getItem(DEMO_STORAGE_KEY);
        if (!storedDemo) return;

        try {
          const parsed = JSON.parse(storedDemo) as UserProfile;
          if (parsed.source === "demo" && active) setCurrentUser(parsed);
        } catch {
          localStorage.removeItem(DEMO_STORAGE_KEY);
        }
        return;
      }

      localStorage.removeItem(DEMO_STORAGE_KEY);
      try {
        const apiUser = await currentEverpropUser();
        if (!active) return;

        if (apiUser) {
          localStorage.removeItem(DEMO_STORAGE_KEY);
          setCurrentUser(apiUser);
          return;
        }
      } catch {
        // A connectivity error never authorizes a local or mock session.
      }
    }

    void restoreSession().finally(() => {
      if (active) setIsLoaded(true);
    });

    return () => {
      active = false;
    };
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const user = await loginEverprop(email, password);
    localStorage.removeItem(DEMO_STORAGE_KEY);
    setCurrentUser(user);
  }, []);

  const loginDemo = useCallback(async (email: string, delayMs = 400) => {
    if (!isMockDataMode) {
      throw new Error("El modo mock no está habilitado en este entorno.");
    }
    await new Promise((resolve) => window.setTimeout(resolve, delayMs));
    const user = MOCK_USERS.find((candidate) => candidate.email === email);
    if (!user) throw new Error("Perfil demo no encontrado.");
    localStorage.setItem(DEMO_STORAGE_KEY, JSON.stringify(user));
    setCurrentUser(user);
  }, []);

  const logout = useCallback(async () => {
    if (currentUser?.source === "api") {
      try {
        await logoutEverprop();
      } catch {
        // The local state must still be cleared if the API session already expired.
      }
    }

    localStorage.removeItem(DEMO_STORAGE_KEY);
    setCurrentUser(null);
    window.location.assign("/login");
  }, [currentUser?.source]);

  const invalidateSession = useCallback(() => {
    localStorage.removeItem(DEMO_STORAGE_KEY);
    setCurrentUser(null);
  }, []);

  const value = useMemo(
    () => ({ currentUser, isLoaded, login, loginDemo, logout, invalidateSession }),
    [currentUser, invalidateSession, isLoaded, login, loginDemo, logout],
  );

  return (
    <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used within an AuthProvider");
  return context;
}
