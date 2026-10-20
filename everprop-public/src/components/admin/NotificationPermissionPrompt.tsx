"use client";

import { useEffect, useState } from "react";
import { InstallSteps, usePushDevice } from "@/components/admin/PushPreferences";

/**
 * First-run invitation to device alerts. Uses the same flow as Settings: "activated" is only shown
 * once the server confirms this device's subscription, never for a bare browser permission.
 */
const PROMPT_KEY = "everprop:notification-prompt-snoozed-at";
const SNOOZE_MS = 3 * 24 * 60 * 60 * 1000;

export function NotificationPermissionPrompt() {
  const { state, message, activate } = usePushDevice();
  // Opening the panel means the alerts were seen: clear the dot on the installed app's icon.
  useEffect(() => { void (navigator as Navigator & { clearAppBadge?: () => Promise<void> }).clearAppBadge?.().catch(() => {}); }, []);
  // "Ahora no" waits 3 days before asking again: an invitation, never a nag on every visit.
  const [dismissed, setDismissed] = useState(() => {
    try { return typeof window !== "undefined" && Date.now() - Number(localStorage.getItem(PROMPT_KEY) || 0) < SNOOZE_MS; } catch { return false; }
  });

  function dismiss() {
    try { localStorage.setItem(PROMPT_KEY, String(Date.now())); } catch { /* Optional preference. */ }
    setDismissed(true);
  }

  const confirmed = state === "active" && message !== ""; // just activated here, confirmed by the server
  // Blocked means the person already said no: the steps to undo it live in Settings, not in a floating card.
  if (dismissed || (!confirmed && !["inactive", "install", "activating", "error"].includes(state))) return null;

  return (
    <section role="region" aria-label="Avisos con el panel cerrado" className="fixed bottom-4 left-4 right-4 z-50 rounded-2xl border border-border bg-background p-4 shadow-xl sm:left-auto sm:w-96">
      <h2 className="font-semibold">Recibí avisos con el panel cerrado</h2>
      <p className="mt-1 text-sm text-muted-foreground">Te avisamos cuando un cliente espera respuesta o un lead lleva días sin seguimiento, para que ninguno se te escape. Podés desactivarlos cuando quieras.</p>
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
