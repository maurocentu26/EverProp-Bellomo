"use client";

import { useEffect, useState } from "react";
import { apiFetch, EverpropApiError } from "@/lib/everprop-api";

type Settings = { ai_enabled: boolean; copilot_enabled: boolean; ai_available: boolean; copilot_available: boolean };
type Key = "ai_enabled" | "copilot_enabled";

const SWITCHES: { key: Key; available: "ai_available" | "copilot_available"; title: string; help: string }[] = [
  { key: "ai_enabled", available: "ai_available", title: "Asistente que responde solo", help: "Atiende primero los chats nuevos y deriva a un asesor cuando hace falta. Al apagarlo deja de responder y los chats que atendía en los últimos 3 días pasan a un asesor." },
  { key: "copilot_enabled", available: "copilot_available", title: "Sugerencias para asesores", help: "El asesor pide un borrador y decide si lo envía. Nada sale sin que lo envíe una persona." },
];

/** EVP-L01: per-tenant switches for the assistant and the copilot. Only tenant admins see the card. */
export function AiSettings() {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [hidden, setHidden] = useState(false);
  const [saving, setSaving] = useState<Key | null>(null);
  const [message, setMessage] = useState("");

  useEffect(() => {
    let alive = true;
    apiFetch<{ data: Settings }>("/api/v1/admin/conversations-ai")
      .then(({ data }) => { if (alive) setSettings(data); })
      .catch((error) => {
        if (!alive) return;
        if (error instanceof EverpropApiError && [401, 403].includes(error.status)) { setHidden(true); return; }
        setMessage("No pudimos cargar la configuración de la IA. Recargá la página.");
      });
    return () => { alive = false; };
  }, []);

  async function change(key: Key, value: boolean) {
    setSaving(key);
    setMessage("");
    try {
      const { data } = await apiFetch<{ data: Settings }>("/api/v1/admin/conversations-ai", { method: "PUT", body: JSON.stringify({ [key]: value }) });
      setSettings(data);
      setMessage(value ? "Encendido." : "Apagado.");
    } catch {
      setMessage("No se pudo guardar el cambio. Volvé a intentarlo.");
    } finally {
      setSaving(null);
    }
  }

  if (hidden) return null;

  return (
    <section aria-labelledby="ai-settings-title" className="space-y-4 rounded-2xl border border-border bg-card p-5">
      <div>
        <h2 id="ai-settings-title" className="font-semibold">Inteligencia artificial</h2>
        <p className="mt-1 text-sm text-muted-foreground">Se aplica solo a tu inmobiliaria, desde el próximo mensaje.</p>
      </div>
      {settings === null && !message && <p className="text-sm text-muted-foreground">Cargando…</p>}
      {settings && SWITCHES.map(({ key, available, title, help }) => (
        <div key={key} className="flex items-start justify-between gap-4 border-t border-border pt-4">
          <div>
            <label htmlFor={`ai-switch-${key}`} className="text-sm font-medium">{title}</label>
            <p id={`ai-switch-${key}-help`} className="mt-1 text-sm text-muted-foreground">{help}</p>
            {settings[key] && !settings[available] && (
              <p className="mt-1 text-sm font-medium">Encendido para tu inmobiliaria, pero todavía no está habilitado en la plataforma.</p>
            )}
          </div>
          <input
            id={`ai-switch-${key}`}
            type="checkbox"
            role="switch"
            aria-describedby={`ai-switch-${key}-help`}
            className="mt-1 h-6 w-6 shrink-0"
            checked={settings[key]}
            disabled={saving !== null}
            onChange={(event) => void change(key, event.target.checked)}
          />
        </div>
      ))}
      {message && <p role="status" className="text-sm">{message}</p>}
    </section>
  );
}
