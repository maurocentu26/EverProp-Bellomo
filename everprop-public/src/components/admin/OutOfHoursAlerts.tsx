"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/everprop-api";
import { endpointHash, registerNotificationWorker } from "@/lib/push-registration";

type Config = { outOfHours?: Record<string, boolean>; businessHoursConfigured?: boolean };

/**
 * EVP-L02: on a device that already receives alerts, choose whether they keep arriving outside the team's business
 * hours. Only shown when the tenant set business hours; the bell in the panel always keeps the alert.
 */
export function OutOfHoursAlerts() {
  const [endpoint, setEndpoint] = useState<string | null>(null);
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    let alive = true;
    (async () => {
      const subscription = await (await registerNotificationWorker(navigator.serviceWorker)).pushManager.getSubscription();
      if (!subscription) return;
      const [config, hash] = await Promise.all([apiFetch<Config>("/api/v1/admin/push/config"), endpointHash(subscription.endpoint)]);
      if (!alive || !config.businessHoursConfigured) return;
      setEndpoint(subscription.endpoint);
      setEnabled(config.outOfHours?.[hash] ?? true);
    })().catch(() => { /* the option shows on the next visit */ });
    return () => { alive = false; };
  }, []);

  async function change(value: boolean) {
    if (!endpoint) return;
    setSaving(true);
    setMessage("");
    try {
      await apiFetch("/api/v1/admin/push/subscriptions/preferences", { method: "PUT", body: JSON.stringify({ endpoint, out_of_hours: value }) });
      setEnabled(value);
      setMessage(value ? "Vas a recibir avisos también fuera de horario." : "Fuera de horario no vas a recibir avisos en este dispositivo.");
    } catch {
      setMessage("No se pudo guardar. Volvé a intentarlo.");
    } finally {
      setSaving(false);
    }
  }

  if (enabled === null) return null;

  return (
    <div className="flex items-start justify-between gap-4 border-t border-border pt-3">
      <div>
        <label htmlFor="out-of-hours-alerts" className="text-sm font-medium">Avisos fuera del horario de atención</label>
        <p id="out-of-hours-alerts-help" className="mt-1 text-sm text-muted-foreground">Solo en este dispositivo. Si los apagás, igual quedan en la campana del panel.</p>
        {message && <p role="status" className="mt-1 text-sm">{message}</p>}
      </div>
      <input id="out-of-hours-alerts" type="checkbox" role="switch" aria-describedby="out-of-hours-alerts-help" className="mt-1 h-6 w-6 shrink-0"
        checked={enabled} disabled={saving} onChange={(event) => void change(event.target.checked)} />
    </div>
  );
}
