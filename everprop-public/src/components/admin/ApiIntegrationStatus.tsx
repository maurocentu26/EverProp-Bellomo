"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, CheckCircle2, Database, Loader2, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/auth-context";
import { everpropHealth, isInvalidEverpropSession, loadEverpropCatalog } from "@/lib/everprop-api";

type IntegrationState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; projects: number; properties: number };

export default function ApiIntegrationStatus() {
  const { invalidateSession } = useAuth();
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<IntegrationState>({ status: "loading" });

  useEffect(() => {
    let active = true;

    async function inspectIntegration() {
      try {
        const [healthy, catalog] = await Promise.all([everpropHealth(), loadEverpropCatalog()]);
        if (!healthy) throw new Error("El healthcheck no confirmó estado operativo.");
        if (active) {
          setState({
            status: "ready",
            projects: catalog.projects.length,
            properties: catalog.properties.length,
          });
        }
      } catch (reason) {
        if (isInvalidEverpropSession(reason)) {
          invalidateSession();
          return;
        }
        if (active) {
          setState({
            status: "error",
            message: reason instanceof Error ? reason.message : "No se pudo verificar la integración.",
          });
        }
      }
    }

    void inspectIntegration();
    return () => {
      active = false;
    };
  }, [attempt, invalidateSession]);

  if (state.status === "loading") {
    return (
      <div className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-600 shadow-sm" role="status">
        <Loader2 className="h-4 w-4 animate-spin text-blue-600" aria-hidden="true" />
        Verificando Laravel, sesión, tenant y catálogo…
      </div>
    );
  }

  if (state.status === "error") {
    return (
      <div className="flex flex-col gap-3 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-950 sm:flex-row sm:items-center sm:justify-between" role="alert">
        <div className="flex items-start gap-3">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-rose-600" aria-hidden="true" />
          <div>
            <p className="font-semibold">No se pudo consultar EverProp</p>
            <p className="mt-0.5 text-xs text-rose-800">{state.message} No se cargaron datos mock.</p>
          </div>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="shrink-0 border-rose-300 bg-white text-rose-800 hover:bg-rose-100"
          onClick={() => {
            setState({ status: "loading" });
            setAttempt((current) => current + 1);
          }}
        >
          <RotateCcw className="mr-2 h-4 w-4" aria-hidden="true" /> Reintentar
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-950 shadow-sm sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-start gap-3">
        <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" aria-hidden="true" />
        <div>
          <p className="font-semibold">EverProp API conectada · sesión administrativa · tenant Bellomo</p>
          <p className="mt-0.5 text-xs text-emerald-800">
            Los conteos provienen del catálogo administrativo real; un valor cero representa un estado vacío válido.
          </p>
        </div>
      </div>
      <div className="flex items-center gap-3 text-xs font-semibold text-emerald-900">
        <Database className="h-4 w-4" aria-hidden="true" />
        <span>{state.projects} proyectos</span>
        <span>{state.properties} propiedades</span>
      </div>
    </div>
  );
}
