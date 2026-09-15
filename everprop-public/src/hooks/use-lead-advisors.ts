"use client";
import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/everprop-api";
import { isMockDataMode } from "@/lib/data-mode";
import { MOCK_USERS } from "@/data/auth-sample";
export function useLeadAdvisors(enabled = true) {
  const [advisors, setAdvisors] = useState<{id: string; name: string}[]>(isMockDataMode ? MOCK_USERS.filter(u => u.role === "ADVISOR") : []);
  const [error, setError] = useState("");
  useEffect(() => {
    if (!enabled || isMockDataMode) return;
    let active = true;
    apiFetch<{data: {id: string; name: string}[]}>("/api/v1/admin/lead-advisors")
      .then(r => { if (active) { setAdvisors(r.data); setError(""); } })
      .catch(() => { if (active) setError("No se pudieron cargar los asesores. Volvé a abrir el formulario."); });
    return () => { active = false; };
  }, [enabled]);
  return { advisors, error };
}
