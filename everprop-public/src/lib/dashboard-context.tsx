"use client";

import React, { createContext, useContext, useState, ReactNode } from "react";

type DashboardMode = "agency" | "enterprise";

interface DashboardModeContextType {
  mode: DashboardMode;
  setMode: (mode: DashboardMode) => void;
  globalSelectedAgentId: string;
  setGlobalSelectedAgentId: (id: string) => void;
}

const DashboardModeContext = createContext<DashboardModeContextType | undefined>(undefined);

export function DashboardModeProvider({ children }: { children: ReactNode }) {
  const [mode, setMode] = useState<DashboardMode>("enterprise");
  const [globalSelectedAgentId, setGlobalSelectedAgentId] = useState<string>("all");

  return (
    <DashboardModeContext.Provider value={{ mode, setMode, globalSelectedAgentId, setGlobalSelectedAgentId }}>
      {children}
    </DashboardModeContext.Provider>
  );
}

export function useDashboardMode() {
  const context = useContext(DashboardModeContext);
  if (context === undefined) {
    throw new Error("useDashboardMode must be used within a DashboardModeProvider");
  }
  return context;
}
