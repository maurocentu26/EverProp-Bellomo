"use client";

import { useState } from "react";
import { InstallSteps, usePushDevice } from "@/components/admin/PushPreferences";

/**
 * First-run invitation to device alerts. Uses the same flow as Settings: "activated" is only shown
 * once the server confirms this device's subscription, never for a bare browser permission.
 */
export function NotificationPermissionPrompt() {
  const { state, message, activate } = usePushDevice();
  const [dismissed, setDismissed] = useState(() => {
    try { return typeof window !== "undefined" && sessionStorage.getItem("everprop:notification-prompt") === "seen"; } catch { return false; }
  });

  function dismiss() {
    try { sessionStorage.setItem("everprop:notification-prompt", "seen"); } catch { /* Optional preference. */ }
    setDismissed(true);
  }

  const confirmed = state === "active" && message !== ""; // just activated here, confirmed by the server
  if (dismissed || (!confirmed && !["inactive", "install", "activating", "error"].includes(state))) return null;

  return (
    <section role="region" aria-label="Avisos con el panel cerrado" className="fixed bottom-4 left-4 right-4 z-50 rounded-2xl border border-border bg-background p-4 shadow-xl sm:left-auto sm:w-96">
      <h2 className="font-semibold">Recibí avisos con el panel cerrado</h2>
      <p className="mt-1 text-sm text-muted-foreground">Te avisamos en este dispositivo cuando un cliente espera respuesta.</p>
      {state === "install" && <div className="mt-2"><InstallSteps /></div>}
      {message && <p role="status" className="mt-2 text-sm">{message}</p>}
      <div className="mt-3 grid grid-cols-2 gap-2">
        <button type="button" disabled={state === "activating"} onClick={dismiss} className="min-h-11 rounded-xl border px-3 text-sm">{confirmed ? "Listo" : state === "install" ? "Entendido" : "Ahora no"}</button>
        {state !== "install" && !confirmed && (
          <button type="button" disabled={state === "activating"} onClick={activate} className="min-h-11 rounded-xl bg-blue-600 px-3 text-sm font-semibold text-white disabled:opacity-50">
            {state === "activating" ? "Activando…" : state === "error" ? "Reintentar" : "Activar"}
          </button>
        )}
      </div>
    </section>
  );
}
