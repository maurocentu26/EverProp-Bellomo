"use client";
import { useEffect, useState, useCallback } from "react";
import { useAuth } from "@/lib/auth-context";
import type { MaterialResponse } from "@/lib/bellomo-policy";
export function useBellomoMaterials() {
  const { currentUser } = useAuth();
  const scope = currentUser ? `${currentUser.id}:${currentUser.apiRole || currentUser.role}` : null;
  const [result,setResult] = useState<{ scope: string; data?: MaterialResponse; error?: string } | null>(null);
  const [attempt,setAttempt] = useState(0);
  const retry = useCallback(() => { setResult(null); setAttempt(n=>n+1); }, []);
  useEffect(() => {
    if (!scope) return;
    const controller = new AbortController();
    fetch("/api/bellomo/materials", { cache:"no-store", signal:controller.signal })
      .then(async response => {
        const value = await response.json();
        if (!response.ok) throw new Error(value.message || "No se pudo cargar la biblioteca.");
        return value as MaterialResponse;
      })
      .then(data => { if (!controller.signal.aborted) setResult({ scope,data }); })
      .catch(error => { if (!controller.signal.aborted) setResult({scope,error:error instanceof Error ? error.message : "No se pudo cargar la biblioteca."}); });
    return () => controller.abort();
  }, [scope, attempt]);
  const current = result?.scope === scope ? result : null;
  return { data:current?.data, error:current?.error, loading:!current, retry };
}
