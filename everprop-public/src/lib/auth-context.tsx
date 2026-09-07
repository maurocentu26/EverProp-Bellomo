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
const localDemo = process.env.NEXT_PUBLIC_LOCAL_DEMO === "1";
const DEMO_STORAGE_KEY = "everprop:demo-user";

export function AuthProvider({ children }: { children: ReactNode }) {
  const [currentUser, setCurrentUser] = useState<UserProfile | null>(null);
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    let active = true;

    async function restoreSession() {
      if (localDemo) {
        localStorage.removeItem(DEMO_STORAGE_KEY);
        try {
          const response = await fetch("/api/demo/session", { cache: "no-store" });
          const data = response.ok ? await response.json() : { user: null };
          if (active) setCurrentUser(data.user);
        } catch { if (active) setCurrentUser(null); }
        return;
      }
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

    const refresh = () => { if (localDemo) void restoreSession(); };
    window.addEventListener("focus", refresh);
    return () => {
      window.removeEventListener("focus", refresh);
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
    if (localDemo) {
      const response = await fetch("/api/demo/session", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email }) });
      const data = await response.json();
      if (!response.ok) throw Error(data.error || "No se pudo iniciar sesión.");
      localStorage.removeItem(DEMO_STORAGE_KEY);
      setCurrentUser(data.user);
      return;
    }
    const user = MOCK_USERS.find((candidate) => candidate.email === email);
    if (!user) throw new Error("Perfil demo no encontrado.");
    localStorage.setItem(DEMO_STORAGE_KEY, JSON.stringify(user));
    setCurrentUser(user);
  }, []);

  const logout = useCallback(async () => {
    if (localDemo) {
      const response = await fetch("/api/demo/session", { method: "DELETE" });
      if (!response.ok) throw Error("No se pudo cerrar la sesión. Intentá de nuevo.");
    }
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
