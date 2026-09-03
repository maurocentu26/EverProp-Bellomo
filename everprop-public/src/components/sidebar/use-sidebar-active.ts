"use client";

import { useState, useEffect } from "react";
import { usePathname } from "next/navigation";
import type { NavItem, NavChild } from "./navigation";

export function useSidebarActive() {
  const pathname = usePathname();
  const [currentHash, setCurrentHash] = useState("");

  useEffect(() => {
    // Sincronizar hash inicial y cambios
    const updateHash = () => setCurrentHash(window.location.hash);
    updateHash();

    window.addEventListener("hashchange", updateHash);
    return () => window.removeEventListener("hashchange", updateHash);
  }, []);

  const isItemActive = (item: NavItem): boolean => {
    // Caso 1: Navegación por Hash (Dashboard) en la ruta /admin
    if (item.hash && pathname === "/admin") {
      return currentHash === item.hash || (currentHash === "" && item.hash === "#dashboard");
    }
    
    // Caso 2: Navegación por Rutas (Leads, Propiedades, etc)
    if (item.matchPath) {
      return pathname.startsWith(item.matchPath);
    }

    return false;
  };

  const isChildActive = (child: NavChild): boolean => {
    return pathname === child.href;
  };

  return {
    pathname,
    currentHash,
    isItemActive,
    isChildActive
  };
}