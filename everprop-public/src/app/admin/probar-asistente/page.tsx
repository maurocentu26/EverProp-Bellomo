"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { AlertTriangle, MessagesSquare, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ChatWidget } from "@/components/public/ChatWidget";
import { useCurrentSession } from "@/hooks/use-current-session";
import { isMockDataMode } from "@/lib/data-mode";
import { loadAssistantWidget, type AssistantWidgetConfig } from "@/lib/assistant-api";
import { chatStorageKey } from "@/lib/chat-session";
import { EverpropApiError } from "@/lib/everprop-api";

const ADMIN_ROLES = new Set(["TENANT_ADMIN", "SUPER_ADMIN"]);

export default function ProbarAsistentePage() {
  const { user, isReady } = useCurrentSession();
  const allowed = Boolean(
    user && (
      (user.source === "api" && ADMIN_ROLES.has(user.apiRole || ""))
      || (isMockDataMode && user.role === "ADMIN")
    ),
  );
  const [config, setConfig] = useState<AssistantWidgetConfig | null>(() =>
    isMockDataMode ? { widget_id: null, display_name: "Asistente (modo demo)", ai_enabled: false } : null,
  );
  const [loading, setLoading] = useState(() => !isMockDataMode);
  const [error, setError] = useState("");
  const [chatKey, setChatKey] = useState(0);

  useEffect(() => {
    if (!isReady || !allowed || isMockDataMode) return;
    const controller = new AbortController();
    loadAssistantWidget(controller.signal)
      .then((res) => {
        if (!controller.signal.aborted) {
          setConfig(res.data);
          setError("");
        }
      })
      .catch((reason) => {
        if (controller.signal.aborted) return;
        if (reason instanceof EverpropApiError && reason.status === 403) {
          setError("Tu perfil no tiene permiso para acceder al chat de prueba.");
        } else {
          setError(reason instanceof Error ? reason.message : "No se pudo cargar el asistente.");
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [isReady, allowed]);

  function resetConversation() {
    if (!config?.widget_id) return;
    const key = chatStorageKey(config.widget_id);
    try { window.localStorage.removeItem(key); } catch { /* blocked */ }
    try { window.sessionStorage.removeItem(key); } catch { /* blocked */ }
    setChatKey((n) => n + 1);
  }

  if (!isReady || !user) {
    return <p role="status" className="p-6 text-sm text-muted-foreground">Cargando sesión…</p>;
  }

  if (!allowed) {
    return (
      <section className="mx-auto max-w-2xl rounded-2xl border border-border bg-card p-6">
        <h1 className="text-xl font-bold">Probar asistente</h1>
        <p role="alert" className="mt-2 text-sm text-muted-foreground">
          Esta página está disponible únicamente para administradores.
        </p>
      </section>
    );
  }

  return (
    <section className="mx-auto flex w-full max-w-4xl flex-col gap-5 pb-8">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Probar asistente</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Entorno de prueba con datos de staging. Toda conversación queda registrada en{" "}
            <Link href="/admin/conversaciones" className="font-medium text-blue-600 underline underline-offset-2 dark:text-blue-400">
              Conversaciones
            </Link>{" "}
            para revisar la traza completa de mensajes.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {config?.widget_id && (
            <Button type="button" variant="outline" size="sm" onClick={resetConversation}>
              <RotateCcw className="mr-1.5 h-4 w-4" aria-hidden="true" />
              Nueva conversación
            </Button>
          )}
          <Button variant="outline" size="sm" nativeButton={false} role="link" render={<Link href="/admin/conversaciones" />}>
            <MessagesSquare className="mr-1.5 h-4 w-4" aria-hidden="true" />
            Ver conversaciones
          </Button>
        </div>
      </header>

      <aside className="rounded-2xl border border-border bg-card p-4 text-sm text-muted-foreground">
        <p className="font-semibold text-foreground">Qué conviene probar</p>
        <ul className="mt-1.5 list-disc space-y-1 pl-5">
          <li>Consultas por proyectos, loteos, departamentos o casas y ubicación.</li>
          <li>Preguntas por precios, cuotas o disponibilidad (el asistente no debe confirmar valores ni stock).</li>
          <li>Pedidos de visita o derivación a un asesor humano.</li>
        </ul>
      </aside>

      {loading && <p role="status" className="text-sm text-muted-foreground">Cargando chat de prueba…</p>}

      {error && (
        <p role="alert" className="rounded-xl border border-red-300 bg-red-50 p-4 text-sm text-red-900 dark:border-red-900 dark:bg-red-950 dark:text-red-100">
          {error}
        </p>
      )}

      {!loading && !error && config && !config.ai_enabled && (
        <div role="status" className="flex items-start gap-2.5 rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950 dark:border-amber-800 dark:bg-amber-950/60 dark:text-amber-100">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <p>
            El asistente automático está desactivado en este entorno. Podés activarlo desde{" "}
            <Link href="/admin/settings" className="font-semibold underline">Configuración</Link>.
          </p>
        </div>
      )}

      {!loading && !error && config && !config.widget_id && (
        <p role="status" className="rounded-xl border border-border bg-card p-4 text-sm text-muted-foreground">
          No hay un canal de chat web activo configurado para esta cuenta.
        </p>
      )}

      {!loading && !error && config?.widget_id && (
        <div className="h-[68dvh] min-h-[460px] max-h-[760px] overflow-hidden rounded-2xl border border-border shadow-sm">
          <ChatWidget
            key={chatKey}
            widgetId={config.widget_id}
            title={config.display_name || "Asistente virtual"}
            embedded
          />
        </div>
      )}
    </section>
  );
}
