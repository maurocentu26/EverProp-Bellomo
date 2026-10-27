"use client";

import { useEffect, useState } from "react";
import { apiFetch, EverpropApiError } from "@/lib/everprop-api";
import { isMockDataMode } from "@/lib/data-mode";
import { SettingsConfirmation } from "./SettingsConfirmation";

type Connection = { id: string; username: string | null; display_name: string; status: string; token_status: string; expires_at: string | null };
type Config = { enabled: boolean; connections: Connection[] };
const endpoint = "/api/v1/admin/integrations/instagram";

export function InstagramConnect() {
  const [config, setConfig] = useState<Config | null>(isMockDataMode ? { enabled: false, connections: [] } : null);
  const [hidden, setHidden] = useState(false);
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (isMockDataMode) return;
    let alive = true;
    apiFetch<{ data: Config }>(`${endpoint}/config`).then(({ data }) => { if (alive) setConfig(data); })
      .catch(error => {
        if (!alive) return;
        if (error instanceof EverpropApiError && [401, 403].includes(error.status)) setHidden(true);
        else setMessage("No pudimos consultar Instagram. Recargá la página para volver a intentarlo.");
      });
    return () => { alive = false; };
  }, []);

  async function start() {
    setConfirm(false); setBusy(true); setMessage("");
    try {
      const { data } = await apiFetch<{ data: { authorization_url: string } }>(`${endpoint}/authorize`, { method: "POST" });
      window.location.assign(data.authorization_url);
    } catch {
      setBusy(false); setMessage("No pudimos iniciar la conexión. Recargá Ajustes e intentá nuevamente.");
    }
  }

  async function refresh(id: string) {
    setBusy(true); setMessage("");
    try {
      await apiFetch(`${endpoint}/${encodeURIComponent(id)}/refresh`, { method: "POST", signal: AbortSignal.timeout(15_000) });
      const { data } = await apiFetch<{ data: Config }>(`${endpoint}/config`);
      setConfig(data); setMessage("El acceso a Instagram fue renovado.");
    } catch {
      setMessage("No pudimos renovar el acceso. Meta exige esperar 24 horas desde la conexión o última renovación. Si el acceso venció o fue retirado, volvé a conectar Instagram.");
    } finally { setBusy(false); }
  }

  if (hidden) return <section id="instagram"><h2>Instagram de la inmobiliaria</h2><p>Solo lectura. Tu cuenta no puede consultar esta conexión. Pedile el detalle a quien administra la inmobiliaria.</p></section>;

  return <section id="instagram" className="space-y-3 rounded-2xl border border-border bg-card p-4">
    <h2 className="font-semibold">Instagram de la inmobiliaria</h2>
    <p className="text-sm text-muted-foreground">Conectá una cuenta profesional para recibir y responder sus mensajes desde EverProp. Instagram te pedirá acceso al perfil y a los mensajes.</p>
    {!config && !message && <p role="status">Comprobando conexión…</p>}
    {config && !config.enabled && <p className="text-sm">La conexión con Instagram todavía no está habilitada en este entorno.</p>}
    {config?.connections.length === 0 && <p className="text-sm">No hay una cuenta de Instagram conectada.</p>}
    {!!config?.connections.length && <ul aria-label="Cuentas de Instagram conectadas" className="divide-y divide-border rounded-xl border border-border">
      {config.connections.map(connection => <li key={connection.id} className="space-y-2 p-3 text-sm">
        <p className="break-words font-semibold">{connection.username ? `@${connection.username}` : connection.display_name}</p>
        <p>{connection.token_status === "VALID" ? "Conectado" : connection.token_status === "UNKNOWN" ? "Vigencia sin confirmar. Volvé a conectar para confirmar el acceso." : "Acceso vencido o retirado. Volvé a conectar Instagram."}</p>
        {connection.expires_at && <p>Vencimiento del acceso: <time dateTime={connection.expires_at}>{new Date(connection.expires_at).toLocaleString("es-AR")}</time></p>}
        {connection.token_status === "VALID" && <button type="button" disabled={busy} onClick={() => void refresh(connection.id)} className="min-h-11 rounded-lg border border-border px-3 font-semibold disabled:opacity-50">Renovar acceso</button>}
      </li>)}
    </ul>}
    <p role="status" className="text-sm">{busy ? "Procesando la conexión con Instagram…" : message}</p>
    {config?.enabled && <button type="button" disabled={busy} onClick={() => setConfirm(true)} className="min-h-11 rounded-xl bg-blue-600 px-4 text-sm font-semibold text-white disabled:opacity-50">Conectar Instagram</button>}
    <SettingsConfirmation open={confirm} title="¿Conectar Instagram?" before={config?.connections.length ? "Cuenta configurada" : "Sin cuenta conectada"} after="La cuenta profesional que autorices en Instagram podrá recibir y responder mensajes desde EverProp." busy={busy} onCancel={() => setConfirm(false)} onConfirm={() => void start()} />
  </section>;
}
