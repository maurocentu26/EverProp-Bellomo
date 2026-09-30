"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Send } from "lucide-react";

type WidgetMessage = { sequence: number; from: "visitor" | "assistant" | "advisor"; text: string | null; at: string };
type Pending = { clientId: string; text: string; failed: boolean };

const TENANT_HEADER = process.env.NODE_ENV === "development" ? process.env.NEXT_PUBLIC_EVERPROP_TENANT || "bellomo" : null;

function storageKey(widgetId: string) {
  return `eversys-chat:${widgetId}`;
}

function readToken(widgetId: string): string | null {
  try { return window.sessionStorage.getItem(storageKey(widgetId)); } catch { return null; }
}

function writeToken(widgetId: string, token: string | null) {
  try {
    if (token) window.sessionStorage.setItem(storageKey(widgetId), token);
    else window.sessionStorage.removeItem(storageKey(widgetId));
  } catch { /* storage unavailable: the session lives only in memory */ }
}

async function call<T>(path: string, init: RequestInit & { token?: string | null } = {}): Promise<{ status: number; body: T | null }> {
  const headers = new Headers({ Accept: "application/json" });
  if (init.body) headers.set("Content-Type", "application/json");
  if (init.token) headers.set("Authorization", `Bearer ${init.token}`);
  if (TENANT_HEADER) headers.set("X-Everprop-Tenant", TENANT_HEADER);
  const response = await fetch(path, { ...init, headers, credentials: "omit", cache: "no-store", signal: AbortSignal.timeout(10_000) });
  return { status: response.status, body: (await response.json().catch(() => null)) as T | null };
}

/**
 * Visitor chat. Anonymous: the session token only grants access to this one conversation.
 * Messages are durable on the server before they show up; retries reuse the same client id.
 */
export function ChatWidget({ widgetId, title = "Chateá con nosotros" }: { widgetId: string; title?: string }) {
  // Lazy init: the token is never rendered, so server (null) and client values cannot mismatch markup.
  const [token, setToken] = useState<string | null>(() => (typeof window === "undefined" ? null : readToken(widgetId)));
  const [messages, setMessages] = useState<WidgetMessage[]>([]);
  const [pending, setPending] = useState<Pending[]>([]);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState("");
  const lastSequence = useRef(0);
  const sessionPromise = useRef<Promise<string | null> | null>(null);
  const bottom = useRef<HTMLLIElement>(null);

  const startSession = useCallback(async (): Promise<string | null> => {
    const response = await call<{ data: { token: string } }>("/api/v1/public/chat/sessions", {
      method: "POST", body: JSON.stringify({ widget_id: widgetId }),
    }).catch(() => null);
    if (!response || response.status !== 201 || !response.body) {
      setError(response?.status === 429 ? "Demasiados intentos. Probá en un minuto." : "El chat no está disponible en este momento.");
      return null;
    }
    writeToken(widgetId, response.body.data.token);
    setToken(response.body.data.token);
    setError("");
    return response.body.data.token;
  }, [widgetId]);

  const poll = useCallback(async () => {
    if (!token) return;
    const response = await call<{ data: WidgetMessage[]; next_after: number }>(`/api/v1/public/chat/messages?after=${lastSequence.current}`, { token }).catch(() => null);
    if (!response) return;
    if (response.status === 401) { writeToken(widgetId, null); setToken(null); sessionPromise.current = null; lastSequence.current = 0; setMessages([]); return; }
    const fresh = response.body?.data ?? [];
    // The server holds the cursor back behind replies that are not visible yet, so none is skipped.
    if (typeof response.body?.next_after === "number") lastSequence.current = response.body.next_after;
    if (fresh.length > 0) {
      setMessages((current) => [...current, ...fresh.filter((m) => !current.some((c) => c.sequence === m.sequence))]
        .sort((a, b) => a.sequence - b.sequence));
    }
  }, [token, widgetId]);

  useEffect(() => {
    void poll();
    const timer = window.setInterval(() => void poll(), 3000);
    return () => window.clearInterval(timer);
  }, [poll]);

  useEffect(() => { bottom.current?.scrollIntoView({ block: "end" }); }, [messages.length, pending.length]);

  async function deliver(item: Pending) {
    // Concurrent first messages share one session instead of creating two conversations.
    sessionPromise.current ??= token ? Promise.resolve(token) : startSession();
    const active = await sessionPromise.current;
    if (!active) sessionPromise.current = null;
    if (!active) { setPending((list) => list.map((p) => p.clientId === item.clientId ? { ...p, failed: true } : p)); return; }
    const response = await call("/api/v1/public/chat/messages", {
      method: "POST", token: active, body: JSON.stringify({ client_message_id: item.clientId, text: item.text }),
    }).catch(() => null);
    if (response && (response.status === 201 || response.status === 200)) {
      await poll();
      setPending((list) => list.filter((p) => p.clientId !== item.clientId));
    } else {
      setPending((list) => list.map((p) => p.clientId === item.clientId ? { ...p, failed: true } : p));
    }
  }

  function submit(event: React.FormEvent) {
    event.preventDefault();
    const text = draft.trim();
    if (!text) return;
    const item = { clientId: crypto.randomUUID(), text, failed: false };
    setPending((list) => [...list, item]);
    setDraft("");
    void deliver(item);
  }

  return (
    <section className="flex h-dvh flex-col bg-background text-foreground" aria-label={title}>
      <header className="border-b border-border bg-blue-600 px-4 py-3 text-white">
        <h1 className="text-base font-bold">{title}</h1>
        <p className="text-xs opacity-90">Te responde un asistente y, si hace falta, un asesor del equipo.</p>
      </header>
      {error && <p role="alert" className="m-3 rounded-lg bg-red-50 p-3 text-sm text-red-800 dark:bg-red-500/10 dark:text-red-200">{error}</p>}
      <ol aria-label="Mensajes" aria-live="polite" className="min-h-0 flex-1 space-y-2 overflow-y-auto p-3">
        {messages.length === 0 && pending.length === 0 && (
          <li className="rounded-xl bg-muted p-3 text-sm text-muted-foreground">¡Hola! Contanos qué estás buscando: zona, tipo de propiedad o código de unidad.</li>
        )}
        {messages.map((m) => (
          <li key={m.sequence} className={`flex ${m.from === "visitor" ? "justify-end" : "justify-start"}`}>
            <div className={`max-w-[85%] rounded-2xl px-3 py-2 text-sm ${m.from === "visitor" ? "bg-blue-600 text-white" : "bg-muted"}`}>
              {m.from !== "visitor" && <p className="mb-0.5 text-[11px] font-semibold opacity-75">{m.from === "advisor" ? "Asesor" : "Asistente"}</p>}
              <p className="whitespace-pre-wrap break-words">{m.text}</p>
            </div>
          </li>
        ))}
        {pending.map((p) => (
          <li key={p.clientId} className="flex justify-end">
            <div className="max-w-[85%] rounded-2xl bg-blue-600/70 px-3 py-2 text-sm text-white">
              <p className="whitespace-pre-wrap break-words">{p.text}</p>
              {p.failed ? (
                <button type="button" onClick={() => { setPending((list) => list.map((x) => x.clientId === p.clientId ? { ...x, failed: false } : x)); void deliver(p); }}
                  className="mt-1 text-[11px] font-semibold underline">No se envió · Reintentar</button>
              ) : <p className="mt-1 text-right text-[11px] opacity-80">Enviando…</p>}
            </div>
          </li>
        ))}
        <li ref={bottom} aria-hidden className="h-px" />
      </ol>
      <form onSubmit={submit} className="flex items-end gap-2 border-t border-border p-3">
        <label htmlFor="widget-message" className="sr-only">Tu mensaje</label>
        <textarea id="widget-message" value={draft} rows={1} maxLength={2000} onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); submit(e); } }}
          className="min-h-11 flex-1 resize-none rounded-xl border border-border bg-background px-3 py-2 text-sm" placeholder="Escribí tu consulta…" />
        <button type="submit" disabled={draft.trim() === ""} aria-label="Enviar" className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-xl bg-blue-600 text-white disabled:opacity-60">
          <Send className="h-4 w-4" aria-hidden />
        </button>
      </form>
    </section>
  );
}
