"use client";

import { useEffect, useState } from "react";
import { apiFetch, EverpropApiError } from "@/lib/everprop-api";

import { isMockDataMode } from "@/lib/data-mode";
import { useCurrentSession } from "@/hooks/use-current-session";
import { SettingsConfirmation } from "./SettingsConfirmation";

type Mode = "AUTONOMOUS" | "COPILOT" | "DISABLED";
type Settings = { mode: Mode; ai_enabled: boolean; copilot_enabled: boolean; ai_available: boolean; copilot_available: boolean };

const MODES: { value: Mode; title: string; help: string }[] = [
  { value: "AUTONOMOUS", title: "Respuestas automáticas", help: "El asistente responde a los chats nuevos y deriva a un asesor cuando hace falta." },
  { value: "COPILOT", title: "Solo sugerencias (Copiloto)", help: "Los mensajes esperan a un asesor. La IA prepara borradores cuando el asesor los pide; una persona decide si los envía." },
  { value: "DISABLED", title: "IA apagada", help: "El equipo atiende los mensajes sin respuestas automáticas ni sugerencias." },
];

/** Tenant-wide mode; the server applies both existing switches in one audited transaction. */
export function AiSettings() {
  const { user } = useCurrentSession();
  const mockWriter = ["TENANT_ADMIN", "SUPER_ADMIN"].includes(user?.apiRole || "") || (!user?.apiRole && user?.role === "ADMIN");
  const [pending, setPending] = useState<Mode | null>(null);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [hidden, setHidden] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (isMockDataMode) {
      if (!mockWriter) { setHidden(true); return; }
      setHidden(false);
      setSettings({ mode: "COPILOT", ai_enabled: false, copilot_enabled: true, ai_available: true, copilot_available: true });
      return;
    }
    let alive = true;
    apiFetch<{ data: Settings }>("/api/v1/admin/conversations-ai")
      .then(({ data }) => { if (alive) setSettings(data); })
      .catch((error) => {
        if (!alive) return;
        if (error instanceof EverpropApiError && [401, 403].includes(error.status)) { setHidden(true); return; }
        setMessage("No pudimos cargar la configuración de la IA. Recargá la página.");
      });
    return () => { alive = false; };
  }, [mockWriter]);

  async function change(mode: Mode) {
    if (saving || hidden || !settings || settings.mode === mode) return;
    setSaving(true);
    setMessage("");
    try {
      const { data } = isMockDataMode ? { data: { ...settings, mode, ai_enabled: mode === "AUTONOMOUS", copilot_enabled: mode === "COPILOT" } } : await apiFetch<{ data: Settings }>("/api/v1/admin/conversations-ai", { method: "PUT", body: JSON.stringify({ mode }) });
      setSettings(data);
      setPending(null);
      setMessage("Modo de atención guardado.");
    } catch {
      setPending(null);
      setMessage("No se pudo guardar el cambio. Volvé a intentarlo.");
    } finally {
      setSaving(false);
    }
  }

  if (hidden) return <section><h2>Inteligencia artificial</h2><p>Define cómo se atienden los mensajes de la inmobiliaria.</p><p>Solo lectura. Tu cuenta no puede consultar esta configuración. Pedile el detalle a quien administra la inmobiliaria.</p></section>;

  return (
    <section aria-busy={saving} aria-labelledby="ai-settings-title" className="space-y-4 rounded-2xl border border-border bg-card p-5">
      <div>
        <h2 id="ai-settings-title" className="font-semibold">Inteligencia artificial</h2>
        <p className="mt-1 text-sm text-muted-foreground">Se aplica solo a tu inmobiliaria, desde el próximo mensaje.</p>
      </div>
      {settings === null && !message && <p className="text-sm text-muted-foreground">Cargando…</p>}
      {settings && (
        <fieldset disabled={saving} className="space-y-3" aria-describedby="ai-mode-help">
          <legend className="text-sm font-medium">Modo de atención</legend>
          <p id="ai-mode-help" className="text-sm text-muted-foreground">Cambiar a sugerencias o apagar la IA deriva los chats automáticos recientes a un asesor. Volver a respuestas automáticas no quita al asesor de los chats que ya atiende.</p>
          {MODES.map(({ value, title, help }) => (
            <label key={value} className="flex cursor-pointer items-start gap-3 rounded-xl border border-border p-4 has-[:checked]:border-primary has-[:checked]:bg-muted/50">
              <input type="radio" name="ai-mode" value={value} checked={settings.mode === value}
                aria-describedby={`ai-mode-${value}-help`}
                className="mt-1 h-5 w-5 shrink-0 accent-primary focus-visible:outline-2 focus-visible:outline-offset-4"
                onChange={() => setPending(value)} />
              <span>
                <span className="text-sm font-medium">{title}</span>
                <span id={`ai-mode-${value}-help`} className="mt-1 block text-sm text-muted-foreground">{help}</span>
              </span>
            </label>
          ))}
          {settings.ai_enabled && !settings.ai_available && <p className="text-sm font-medium">Las respuestas automáticas están seleccionadas, pero no habilitadas en la plataforma. Los mensajes esperan a un asesor.</p>}
          {settings.copilot_enabled && !settings.copilot_available && <p className="text-sm font-medium">Las sugerencias no están habilitadas en la plataforma.</p>}
        </fieldset>
      )}
      <SettingsConfirmation open={pending !== null} title="¿Cambiar el modo de atención?" before={MODES.find(item => item.value === settings?.mode)?.title || "Sin informar"} after={MODES.find(item => item.value === pending)?.title || "Sin informar"} busy={saving} onCancel={() => setPending(null)} onConfirm={() => { if (pending) void change(pending); }} />
      {message && <p role="status" className="text-sm">{message}</p>}
    </section>
  );
}
