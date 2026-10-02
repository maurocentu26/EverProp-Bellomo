"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { apiFetch } from "@/lib/everprop-api";
import { activatePush, currentPushState, deactivatePush, endpointHash, registerNotificationWorker, type PushDeps, type PushEnvironment, type PushState } from "@/lib/push-registration";

type PushConfig = { enabled: boolean; publicKey: string; subscriptionHashes: string[] };

function environment(): PushEnvironment {
  const nav = navigator as Navigator & { standalone?: boolean };
  return {
    secure: window.isSecureContext,
    serviceWorker: "serviceWorker" in navigator,
    pushManager: "PushManager" in window,
    notification: "Notification" in window,
    appleMobile: /iPhone|iPad|iPod/.test(nav.userAgent) || (nav.platform === "MacIntel" && nav.maxTouchPoints > 1),
    standalone: window.matchMedia("(display-mode: standalone)").matches || nav.standalone === true,
    permission: "Notification" in window ? Notification.permission : "unsupported",
  };
}

/** Single source for device alerts: the settings card and the first-run prompt share it. */
export function usePushDevice() {
  const [state, setState] = useState<PushState>("checking");
  const [message, setMessage] = useState("");
  const publicKey = useRef("");
  const deps = useRef<PushDeps>({
    requestPermission: () => Notification.requestPermission(),
    registration: () => registerNotificationWorker(navigator.serviceWorker),
    config: async () => {
      const config = await apiFetch<PushConfig>("/api/v1/admin/push/config");
      publicKey.current = config.publicKey;
      return config;
    },
    register: (subscription) => apiFetch("/api/v1/admin/push/subscriptions", { method: "POST", body: JSON.stringify(subscription) }),
    hash: endpointHash,
  });

  const mounted = useRef(true);
  const check = useCallback(() => {
    currentPushState(environment(), deps.current)
      .then((next) => { if (mounted.current) setState(next); })
      .catch(() => { if (mounted.current) { setState("error"); setMessage("No pudimos comprobar los avisos de este dispositivo. Reintentá."); } });
  }, []);

  useEffect(() => {
    mounted.current = true;
    check();
    return () => { mounted.current = false; };
  }, [check]);

  // Called directly from a click: activatePush asks for permission before awaiting anything else.
  const activate = useCallback(() => {
    if (!publicKey.current) { setState("checking"); setMessage(""); check(); return; }
    setState("activating");
    setMessage("");
    void activatePush(deps.current, publicKey.current).then((result) => { setState(result.state); setMessage(result.message); });
  }, [check]);

  const deactivate = useCallback(async () => {
    setState("activating");
    setMessage("");
    try {
      await deactivatePush({
        registration: deps.current.registration,
        unregister: (endpoint) => apiFetch("/api/v1/admin/push/subscriptions", { method: "DELETE", body: JSON.stringify({ endpoint }) }),
      });
      setState("inactive");
      setMessage("Avisos desactivados en este dispositivo.");
    } catch {
      setState("active");
      setMessage("No pudimos desactivarlos. Reintentá.");
    }
  }, []);

  return { state, message, activate, deactivate };
}

const STATUS: Record<PushState, string> = {
  checking: "Comprobando este dispositivo…",
  unsupported: "Este navegador no puede recibir avisos con el panel cerrado.",
  install: "En iPhone o iPad, los avisos funcionan solo con el panel instalado.",
  "server-off": "Los avisos con el panel cerrado todavía no están configurados en el servidor.",
  blocked: "Las notificaciones están bloqueadas para el panel en este dispositivo.",
  inactive: "No activados en este dispositivo.",
  activating: "Activando…",
  active: "Activados: este dispositivo recibe avisos con el panel cerrado.",
  error: "No se pudieron activar.",
};

export function InstallSteps() {
  return (
    <ol className="list-decimal space-y-1 pl-5 text-sm">
      <li>Abrí el panel en Safari.</li>
      <li>Tocá Compartir y elegí <strong>Agregar a inicio</strong>.</li>
      <li>Abrí Bellomo desde ese ícono, iniciá sesión y volvé a esta pantalla para activar los avisos.</li>
    </ol>
  );
}

export function PushPreferences() {
  const { state, message, activate, deactivate } = usePushDevice();
  return (
    <section id="avisos-dispositivo" className="space-y-3 rounded-2xl border border-border bg-card p-4">
      <div>
        <h2 className="font-semibold">Avisos con el panel cerrado</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Te avisan en este dispositivo, aunque el panel esté cerrado, cuando un cliente espera respuesta. La campana y el sonido del panel funcionan solo mientras lo tenés abierto.
        </p>
      </div>
      <p role="status" className="text-sm font-semibold">{STATUS[state]}</p>
      {state === "install" && <InstallSteps />}
      {state === "blocked" && <p className="text-sm text-muted-foreground">Habilitalas en Configuración del dispositivo → Notificaciones → Bellomo (o en los permisos del sitio del navegador) y volvé a esta pantalla.</p>}
      {message && state !== "active" && <p className="text-sm">{message}</p>}
      {(state === "inactive" || state === "error") && (
        <button type="button" onClick={activate} className="min-h-11 rounded-xl bg-blue-600 px-4 text-sm font-semibold text-white">
          {state === "error" ? "Reintentar" : "Activar avisos en este dispositivo"}
        </button>
      )}
      {state === "active" && (
        <button type="button" onClick={() => void deactivate()} className="min-h-11 rounded-xl border border-border px-4 text-sm font-semibold">Desactivar en este dispositivo</button>
      )}
      <p className="text-xs text-muted-foreground">El sistema decide cómo se muestran: modos de concentración, ajustes de notificaciones o falta de señal pueden demorarlos u ocultarlos.</p>
    </section>
  );
}
