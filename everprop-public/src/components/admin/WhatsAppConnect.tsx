"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { apiFetch, EverpropApiError } from "@/lib/everprop-api";
import { connectPayload, parseSignupMessage, type SignupSession } from "@/lib/whatsapp-signup";

import { isMockDataMode } from "@/lib/data-mode";
import { useCurrentSession } from "@/hooks/use-current-session";
import { SettingsConfirmation } from "./SettingsConfirmation";

type Connection = { id: string; status: "ACTIVE" | "DEGRADED" | "PENDING" | string; display_phone_number: string | null };
type Config = { enabled: boolean; app_id: string | null; config_id: string | null; graph_version: string; connections: Connection[] };
type Connected = { display_phone_number: string; state: "ACTIVE" | "REGISTRATION_PENDING" };
type State = "checking" | "hidden" | "unavailable" | "loading-sdk" | "ready" | "connecting" | "done" | "cancelled" | "error";

type FacebookSdk = {
  init(options: Record<string, unknown>): void;
  login(callback: (response: { authResponse?: { code?: string } | null }) => void, options: Record<string, unknown>): void;
};
declare global {
  interface Window { FB?: FacebookSdk; fbAsyncInit?: () => void }
}

/** Load Meta's SDK once, only for an admin who can actually connect (no third-party script for everyone else). */
function loadSdk(config: Config): Promise<FacebookSdk> {
  if (window.FB) return Promise.resolve(window.FB);
  return new Promise((resolve, reject) => {
    window.fbAsyncInit = () => {
      window.FB!.init({ appId: config.app_id, autoLogAppEvents: true, xfbml: false, version: config.graph_version });
      resolve(window.FB!);
    };
    const script = document.createElement("script");
    script.src = "https://connect.facebook.net/es_LA/sdk.js";
    script.async = true;
    script.crossOrigin = "anonymous";
    script.onerror = () => reject(new Error("sdk"));
    document.body.appendChild(script);
  });
}

/**
 * "Conectar WhatsApp" (Tech Provider W5). Meta's dialog returns a short-lived code (FB.login) and the
 * account ids (window message); both go to the backend at once, which verifies them with Meta.
 */
export function WhatsAppConnect() {
  const { user } = useCurrentSession();
  const mockWriter = ["TENANT_ADMIN", "SUPER_ADMIN"].includes(user?.apiRole || "") || (!user?.apiRole && user?.role === "ADMIN");
  const [connectConfirm, setConnectConfirm] = useState(false);
  const [state, setState] = useState<State>("checking");
  const [message, setMessage] = useState("");
  const [connected, setConnected] = useState<Connected | null>(null);
  const [sdkReady, setSdkReady] = useState(false);
  const [connections, setConnections] = useState<Connection[]>([]);
  const [confirming, setConfirming] = useState<string | null>(null);
  const [disconnecting, setDisconnecting] = useState(false);

  const reloadConnections = useCallback(async () => {
    try {
      const { data } = await apiFetch<{ data: Config }>("/api/v1/admin/integrations/whatsapp/config");
      setConnections(data.connections ?? []);
    } catch { /* the list refreshes on the next visit */ }
  }, []);

  async function disconnect(id: string) {
    if (disconnecting || state === "hidden") return;
    setDisconnecting(true);
    try {
      if (isMockDataMode) setConnections(current => current.filter(item => item.id !== id));
      else await apiFetch(`/api/v1/admin/integrations/whatsapp/${encodeURIComponent(id)}/disconnect`, { method: "POST" });
      setMessage("WhatsApp desconectado. Los mensajes de ese número ya no llegan a la bandeja.");
      setConfirming(null);
      if (!isMockDataMode) await reloadConnections();
    } catch {
      setConfirming(null);
      setMessage("No pudimos desconectar. Volvé a intentarlo.");
    } finally {
      setDisconnecting(false);
    }
  }
  const config = useRef<Config | null>(null);
  const code = useRef<string | null>(null);
  const session = useRef<SignupSession | null>(null);
  const sent = useRef(false);

  const submit = useCallback(async () => {
    const body = connectPayload(code.current, session.current);
    if (!body || sent.current) return;
    sent.current = true;
    setState("connecting");
    try {
      const result = await apiFetch<{ data: Connected }>("/api/v1/admin/integrations/whatsapp/connect", { method: "POST", body: JSON.stringify(body) });
      setConnected(result.data);
      void reloadConnections();
      setState("done");
    } catch {
      setMessage("No pudimos conectar WhatsApp. Volvé a intentarlo.");
      setState("error");
    } finally {
      code.current = null;
      session.current = null;
    }
  }, [reloadConnections]);

  useEffect(() => {
    if (isMockDataMode) {
      if (!mockWriter) { setState("hidden"); return; }
      setConnections([{ id: "sample-whatsapp", status: "ACTIVE", display_phone_number: "sample" }]);
      setSdkReady(true); setState("ready");
      return;
    }
    let alive = true;
    apiFetch<{ data: Config }>("/api/v1/admin/integrations/whatsapp/config")
      .then(async ({ data }) => {
        if (!alive) return;
        config.current = data;
        setConnections(data.connections ?? []);
        if (!data.enabled) { setState("unavailable"); return; }
        setState("loading-sdk");
        await loadSdk(data);
        if (alive) { setSdkReady(true); setState("ready"); }
      })
      .catch((error) => {
        if (!alive) return;
        // Without manageIntegrations the card is not shown at all.
        if (error instanceof EverpropApiError && [401, 403].includes(error.status)) { setState("hidden"); return; }
        setMessage("No pudimos cargar la conexión con Meta. Recargá la página.");
        setState("error");
      });

    function onMessage(event: MessageEvent) {
      const parsed = parseSignupMessage(event.origin, event.data);
      if (!parsed) return;
      if (parsed.kind === "finish") { session.current = parsed.session; void submit(); return; }
      code.current = null;
      session.current = null;
      setMessage(parsed.kind === "error" ? "No pudimos completar la conexión. Volvé a intentarlo." : "Cerraste la ventana de Meta antes de terminar.");
      setState(parsed.kind === "error" ? "error" : "cancelled");
    }
    window.addEventListener("message", onMessage);
    return () => { alive = false; window.removeEventListener("message", onMessage); };
  }, [submit, mockWriter]);

  // Straight from the click: the SDK is already loaded, so Meta's popup is not blocked.
  function start() {
    setConnectConfirm(false);
    if (isMockDataMode) { setConnections([{ id: "sample-whatsapp", status: "ACTIVE", display_phone_number: "sample" }]); setState("ready"); setMessage("Conexión guardada."); return; }
    const sdk = window.FB;
    if (!sdk || !config.current?.config_id) return;
    code.current = null;
    session.current = null;
    sent.current = false;
    setMessage("");
    setState("connecting");
    sdk.login((response) => {
      const received = response.authResponse?.code;
      if (!received) { setState((current) => (current === "connecting" ? "cancelled" : current)); return; }
      code.current = received;
      void submit();
    }, {
      config_id: config.current.config_id,
      response_type: "code",
      override_default_response_type: true,
      extras: { setup: {} },
    });
  }

  if (state === "hidden") return <section><h2>WhatsApp de la inmobiliaria</h2><p>Conecta los mensajes de la empresa con la bandeja del equipo.</p><p>Solo lectura. Tu cuenta no puede consultar esta conexión. Pedile el detalle a quien administra la inmobiliaria.</p></section>;

  return (
    <section id="whatsapp" className="space-y-3 rounded-2xl border border-border bg-card p-4">
      <div>
        <h2 className="font-semibold">WhatsApp de la inmobiliaria</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Conectá la cuenta de WhatsApp Business de la inmobiliaria para recibir y responder sus mensajes en la bandeja. Se abre una ventana de Meta donde elegís la cuenta y el número.
        </p>
      </div>
      <p role="status" className="text-sm font-semibold">
        {state === "checking" && "Comprobando conexión…"}
        {state === "unavailable" && "La conexión con WhatsApp todavía no está habilitada en este entorno."}
        {state === "loading-sdk" && "Preparando la conexión con Meta…"}
        {state === "ready" && (connections.length ? "Configurado" : "Sin configurar. Podés conectar una cuenta de WhatsApp.")}
        {state === "connecting" && "Conectando… completá los pasos en la ventana de Meta."}
        {state === "done" && connected?.state === "ACTIVE" && "Configurado"}
        {state === "done" && connected?.state === "REGISTRATION_PENDING" && "Configurado. Meta todavía no habilitó el número. Volvé a conectar en unos minutos."}
        {state === "cancelled" && "No se conectó."}
        {state === "error" && "No se pudo conectar."}
      </p>
      {message && <p className="text-sm">{message}</p>}
      {connections.length > 0 && (
        <ul className="divide-y divide-border rounded-xl border border-border" aria-label="Números conectados">
          {connections.map((connection) => (
            <li key={connection.id} className="flex flex-wrap items-center justify-between gap-2 p-3 text-sm">
              <span>
                <strong>{connection.display_phone_number ? "Configurado" : "Sin configurar"}</strong>
                <span className="ml-2 text-muted-foreground">{connection.status === "ACTIVE" ? "Conectado" : "Pendiente de habilitación en Meta"}</span>
              </span>
              <button type="button" disabled={disconnecting} onClick={() => setConfirming(connection.id)} className="min-h-11 rounded-lg border border-border px-3 font-semibold">Desconectar</button>
            </li>
          ))}
        </ul>
      )}
      <SettingsConfirmation open={confirming !== null} title="¿Desconectar WhatsApp?" before="Conectado a la bandeja del equipo" after="Desconectado. El equipo dejará de recibir y enviar mensajes de esta cuenta." busy={disconnecting} onCancel={() => setConfirming(null)} onConfirm={() => { if (confirming) void disconnect(confirming); }} />
      <SettingsConfirmation open={connectConfirm} title="¿Conectar WhatsApp?" before={connections.length ? "Cuenta configurada" : "Sin configurar"} after="Cuenta que elijas en Meta conectada a la bandeja del equipo" busy={false} onCancel={() => setConnectConfirm(false)} onConfirm={start} />
      {["ready", "cancelled", "error", "done"].includes(state) && (
        <button type="button" onClick={() => setConnectConfirm(true)} disabled={!sdkReady}
          className="min-h-11 rounded-xl bg-blue-600 px-4 text-sm font-semibold text-white disabled:opacity-50">
          {state === "done" ? "Volver a conectar" : state === "ready" ? "Conectar WhatsApp" : "Reintentar"}
        </button>
      )}
    </section>
  );
}
