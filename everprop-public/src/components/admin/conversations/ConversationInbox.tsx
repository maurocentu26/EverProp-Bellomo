"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowDown, ArrowLeft, Bot, CheckCircle2, Hand, MessageSquare, MessageSquareText, Plus, RefreshCw, Send, UserRound, X, XCircle } from "lucide-react";
import { toast } from "sonner";
import { useCurrentSession } from "@/hooks/use-current-session";
import {
  CHANNEL_LABELS,
  MESSAGE_PAGE,
  STATE_LABELS,
  closeConversation,
  deliveryLabel,
  getConversationMessages,
  listConversations,
  mergeMessages,
  previewText,
  resolveUnknownSends,
  resumeAi,
  sendReply,
  takeOver,
  threadCursor,
  type ConversationFilter,
  type ConversationMessage,
  type ConversationState,
  type ConversationSummary,
} from "@/lib/conversations-api";

const FILTERS: [ConversationFilter, string][] = [
  ["waiting", "Esperan asesor"],
  ["mine", "Mías"],
  ["unread", "No leídas"],
  ["all", "Todas"],
];

const STATE_STYLES: Record<ConversationState, string> = {
  AI_ACTIVE: "bg-violet-100 text-violet-800 dark:bg-violet-500/20 dark:text-violet-200",
  WAITING_TOOL: "bg-violet-100 text-violet-800 dark:bg-violet-500/20 dark:text-violet-200",
  WAITING_HUMAN: "bg-amber-100 text-amber-900 dark:bg-amber-500/20 dark:text-amber-200",
  TRANSITION_PENDING: "bg-sky-100 text-sky-900 dark:bg-sky-500/20 dark:text-sky-200",
  HUMAN_ACTIVE: "bg-emerald-100 text-emerald-900 dark:bg-emerald-500/20 dark:text-emerald-200",
  CLOSED: "bg-muted text-muted-foreground",
};

const DEFAULT_QUICK_REPLIES = [
  "¡Hola! Gracias por escribir a Bellomo. ¿En qué te puedo ayudar?",
  "Te paso la información en un momento.",
  "¿Te queda bien que te llame? Pasame el mejor horario.",
  "Gracias por tu consulta. Cualquier otra duda, escribime por acá.",
];

function newKey(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`;
}

function displayName(item: ConversationSummary): string {
  return item.contact_name || (item.channel === "WEB_CHAT" ? "Visitante del chat web" : "Contacto sin nombre");
}

function time(iso: string): string {
  return new Intl.DateTimeFormat("es-AR", { hour: "2-digit", minute: "2-digit", day: "2-digit", month: "2-digit" }).format(new Date(iso));
}

/** Polls only while the app is visible (battery and mobile data) and catches up at once on return. */
function useVisiblePolling(run: () => void, ms: number) {
  useEffect(() => {
    run();
    const timer = window.setInterval(() => { if (!document.hidden) run(); }, ms);
    const wake = () => { if (!document.hidden) run(); };
    document.addEventListener("visibilitychange", wake);
    window.addEventListener("online", wake);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", wake);
      window.removeEventListener("online", wake);
    };
  }, [run, ms]);
}

/** Saved replies live on this device, per user: they are templates, never client data. */
function useQuickReplies(userId: string | undefined) {
  const storageKey = `everprop:quick-replies:${userId ?? "anon"}`;
  const [replies, setReplies] = useState<string[]>(DEFAULT_QUICK_REPLIES);
  const load = useCallback(() => {
    try {
      const saved = JSON.parse(window.localStorage.getItem(storageKey) ?? "null");
      setReplies(Array.isArray(saved) ? saved.filter((r): r is string => typeof r === "string") : DEFAULT_QUICK_REPLIES);
    } catch {
      setReplies(DEFAULT_QUICK_REPLIES);
    }
  }, [storageKey]);
  const save = useCallback((next: string[]) => {
    setReplies(next);
    try { window.localStorage.setItem(storageKey, JSON.stringify(next)); } catch { /* private mode: keep in memory */ }
  }, [storageKey]);
  return { replies, load, save };
}

const isTouch = () => window.matchMedia("(pointer: coarse)").matches;

export function ConversationInbox() {
  const { user } = useCurrentSession();
  const readOnly = user?.apiRole === "READ_ONLY";
  const [filter, setFilter] = useState<ConversationFilter>("waiting");
  const [items, setItems] = useState<ConversationSummary[]>([]);
  const [listError, setListError] = useState("");
  const [selected, setSelected] = useState<string | null>(null);
  // Kept when the conversation leaves the current filter (e.g. after taking control).
  const [openedSummary, setOpenedSummary] = useState<ConversationSummary | null>(null);
  const [state, setState] = useState<ConversationState | null>(null);
  const [aiEnabled, setAiEnabled] = useState(false);
  // WhatsApp only: when the 24 h service window closes (null closes_at = already closed).
  const [replyWindow, setReplyWindow] = useState<{ closes_at: string | null } | null>(null);
  const [messages, setMessages] = useState<ConversationMessage[]>([]);
  const messagesRef = useRef<ConversationMessage[]>([]);
  const [threadError, setThreadError] = useState("");
  const [draft, setDraft] = useState("");
  // Drafts survive switching conversations (memory only: nothing about clients is written to the device).
  const drafts = useRef(new Map<string, string>());
  // The idempotency key is bound to the exact text it was created for (edits get a new key).
  const draftKey = useRef({ key: newKey(), text: "" });
  const selectedRef = useRef<string | null>(null);
  const listRequest = useRef(0);
  const [busy, setBusy] = useState<string | null>(null);
  const [resumeReason, setResumeReason] = useState("");
  const threadHeading = useRef<HTMLHeadingElement>(null);
  const thread = useRef<HTMLOListElement>(null);
  const atBottom = useRef(true);
  const [unseen, setUnseen] = useState(0);
  const [showQuick, setShowQuick] = useState(false);
  const { replies, load: loadReplies, save: saveReplies } = useQuickReplies(user?.id);

  const refreshList = useCallback(async () => {
    if (!user) return;
    const request = ++listRequest.current;
    try {
      const response = await listConversations(filter);
      if (request !== listRequest.current) return; // a newer filter/refresh already answered
      setItems(response.data);
      setListError("");
    } catch {
      setListError("No pudimos actualizar la bandeja. Reintentamos en unos segundos.");
    }
  }, [filter, user]);

  const refreshThread = useCallback(async () => {
    const conversation = selected;
    if (!conversation) return;
    try {
      // First load walks every page; afterwards only new messages and sends that can still change.
      let after = threadCursor(messagesRef.current);
      let merged = messagesRef.current;
      let response;
      for (let page = 0; page < 20; page++) {
        response = await getConversationMessages(conversation, after);
        if (selectedRef.current !== conversation) return; // late answer for a conversation no longer open
        merged = mergeMessages(merged, response.data);
        if (response.data.length < MESSAGE_PAGE) break;
        after = response.data[response.data.length - 1].sequence;
      }
      if (!response) return;
      const added = merged.length - messagesRef.current.length;
      if (added > 0 && !atBottom.current && messagesRef.current.length > 0) setUnseen((n) => n + added);
      messagesRef.current = merged;
      setMessages(merged);
      setState(response.conversation.state);
      setAiEnabled(response.conversation.ai_enabled);
      setReplyWindow(response.conversation.reply_window ?? null);
      setThreadError("");
    } catch {
      setThreadError("No pudimos cargar los mensajes. Reintentamos en unos segundos.");
    }
  }, [selected]);

  useVisiblePolling(useCallback(() => void refreshList(), [refreshList]), 8000);
  useVisiblePolling(useCallback(() => void refreshThread(), [refreshThread]), 3000);

  // Follow new messages only when already at the bottom; otherwise offer a jump instead of moving the reader.
  useEffect(() => {
    if (atBottom.current) thread.current?.scrollTo({ top: thread.current.scrollHeight });
  }, [messages]);

  function onThreadScroll() {
    const el = thread.current;
    if (!el) return;
    atBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
    if (atBottom.current) setUnseen(0);
  }

  function jumpToLatest() {
    atBottom.current = true;
    setUnseen(0);
    thread.current?.scrollTo({ top: thread.current.scrollHeight, behavior: "smooth" });
  }

  // Unread conversations in the tab/app title, visible from the task switcher.
  useEffect(() => {
    const pending = items.filter((item) => item.unread > 0).length;
    const previous = document.title;
    document.title = pending > 0 ? `(${pending}) Conversaciones · Bellomo` : "Conversaciones · Bellomo";
    return () => { document.title = previous; };
  }, [items]);

  // Deep link from push notifications and other screens: /admin/conversaciones?c=<uuid>
  useEffect(() => {
    const linked = new URLSearchParams(window.location.search).get("c");
    if (linked && /^[0-9a-f-]{36}$/i.test(linked)) {
      setFilter("all");
      selectedRef.current = linked;
      setSelected(linked);
    }
  }, []);

  function open(id: string) {
    if (selectedRef.current) drafts.current.set(selectedRef.current, draft);
    selectedRef.current = id;
    setSelected(id);
    setOpenedSummary(items.find((item) => item.id === id) ?? null);
    messagesRef.current = [];
    setMessages([]);
    setState(null);
    setReplyWindow(null);
    setUnseen(0);
    atBottom.current = true;
    setShowQuick(false);
    setDraft(drafts.current.get(id) ?? "");
    draftKey.current = { key: newKey(), text: "" };
    window.setTimeout(() => threadHeading.current?.focus(), 0);
  }

  function backToList() {
    const id = selectedRef.current;
    if (id) drafts.current.set(id, draft);
    selectedRef.current = null;
    setSelected(null);
    window.setTimeout(() => document.getElementById(`conversation-${id}`)?.focus(), 0);
  }

  async function run(action: string, fn: () => Promise<unknown>, success?: string) {
    if (busy) return;
    setBusy(action);
    try {
      await fn();
      if (success) toast.success(success);
      await Promise.all([refreshThread(), refreshList()]);
    } catch (reason) {
      toast.error(reason instanceof Error ? reason.message : "No se pudo completar la acción.");
    } finally {
      setBusy(null);
    }
  }

  async function sendDraft() {
    const text = draft.trim();
    const conversation = selected;
    if (!conversation || !text || windowClosed) return;
    if (draftKey.current.text !== text) draftKey.current = { key: newKey(), text };
    atBottom.current = true;
    await run("reply", async () => {
      await sendReply(conversation, text, draftKey.current.key);
      drafts.current.delete(conversation);
      if (selectedRef.current === conversation) {
        setDraft("");
        draftKey.current = { key: newKey(), text: "" };
      }
    });
  }

  function insertQuickReply(text: string) {
    setDraft((current) => (current.trim() ? `${current.trimEnd()} ${text}` : text));
    setShowQuick(false);
    window.setTimeout(() => document.getElementById("reply")?.focus(), 0);
  }

  const current = items.find((item) => item.id === selected) ?? (openedSummary?.id === selected ? openedSummary : undefined);
  const humanInControl = state === "HUMAN_ACTIVE";
  // A reply queued just before the window closed still shows up in the thread through polling.
  const windowClosed = replyWindow !== null && replyWindow.closes_at === null;

  return (
    <section className="mx-auto flex w-full max-w-7xl min-w-0 flex-col gap-4 pb-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Conversaciones</h1>
          <p className="mt-1 text-sm text-muted-foreground">WhatsApp y chat web en una sola bandeja. La IA se detiene cuando tomás el control.</p>
        </div>
        <button type="button" onClick={() => void refreshList()} className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-border bg-card px-4 text-sm font-semibold">
          <RefreshCw className="h-4 w-4" aria-hidden /> Actualizar
        </button>
      </header>

      <div className="grid min-h-[70vh] gap-4 lg:grid-cols-[minmax(280px,360px)_1fr]">
        <aside className={`${selected ? "hidden lg:flex" : "flex"} min-w-0 flex-col rounded-2xl border border-border bg-card`} aria-label="Listado de conversaciones">
          <div role="group" aria-label="Filtrar conversaciones" className="grid grid-cols-2 gap-1 border-b border-border p-2 sm:grid-cols-4 lg:grid-cols-2">
            {FILTERS.map(([id, label]) => (
              <button key={id} type="button" aria-pressed={filter === id} onClick={() => setFilter(id)}
                className={`min-h-10 rounded-lg px-2 text-xs font-semibold ${filter === id ? "bg-blue-600 text-white" : "text-muted-foreground hover:bg-muted"}`}>
                {label}
              </button>
            ))}
          </div>
          {listError && <p role="alert" className="m-3 rounded-lg bg-red-50 p-3 text-sm text-red-800 dark:bg-red-500/10 dark:text-red-200">{listError}</p>}
          <ul role="list" className="min-h-0 flex-1 divide-y divide-border overflow-y-auto">
            {items.length === 0 && !listError && (
              <li className="p-6 text-center text-sm text-muted-foreground">No hay conversaciones en este filtro.</li>
            )}
            {items.map((item) => {
              const preview = previewText(item);
              return (
                <li key={item.id}>
                  <button id={`conversation-${item.id}`} type="button" onClick={() => open(item.id)} aria-current={selected === item.id ? "true" : undefined}
                    className={`flex w-full min-w-0 flex-col gap-1 px-4 py-3 text-left hover:bg-muted/60 focus-visible:outline-2 focus-visible:outline-blue-600 ${selected === item.id ? "bg-blue-50 dark:bg-blue-500/10" : ""}`}>
                    <span className="flex items-center justify-between gap-2">
                      <span className={`truncate ${item.unread > 0 ? "font-bold" : "font-semibold"}`}>{displayName(item)}</span>
                      <time dateTime={item.last_activity_at} className="shrink-0 text-xs text-muted-foreground">{time(item.last_activity_at)}</time>
                    </span>
                    {preview && (
                      <span className="flex items-center justify-between gap-2">
                        <span className={`truncate text-sm ${item.unread > 0 ? "text-foreground" : "text-muted-foreground"}`}>{preview}</span>
                        {item.unread > 0 && <span className="shrink-0 rounded-full bg-blue-600 px-2 py-0.5 text-xs font-bold text-white" aria-label={`${item.unread} sin leer`}>{item.unread}</span>}
                      </span>
                    )}
                    <span className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                      <span className={`rounded-full px-2 py-0.5 font-semibold ${STATE_STYLES[item.state]}`}>{STATE_LABELS[item.state]}</span>
                      <span>{CHANNEL_LABELS[item.channel] ?? item.channel}</span>
                      {!preview && item.unread > 0 && <span className="rounded-full bg-blue-600 px-2 py-0.5 font-bold text-white" aria-label={`${item.unread} sin leer`}>{item.unread}</span>}
                    </span>
                    {item.assigned_user && <span className="truncate text-xs text-muted-foreground">Asignada a {item.assigned_user.name}</span>}
                  </button>
                </li>
              );
            })}
          </ul>
        </aside>

        <div className={`${selected ? "flex" : "hidden lg:flex"} relative min-w-0 flex-col rounded-2xl border border-border bg-card`}>
          {!selected ? (
            <div className="m-auto flex max-w-sm flex-col items-center gap-3 p-8 text-center text-muted-foreground">
              <MessageSquare className="h-8 w-8" aria-hidden />
              <p className="text-sm">Elegí una conversación para ver los mensajes y tomar el control.</p>
            </div>
          ) : (
            <>
              <div className="flex flex-wrap items-center gap-2 border-b border-border p-3">
                <button type="button" onClick={backToList} className="inline-flex min-h-11 items-center gap-1 rounded-lg px-2 text-sm font-semibold lg:hidden">
                  <ArrowLeft className="h-4 w-4" aria-hidden /> Bandeja
                </button>
                <h2 ref={threadHeading} tabIndex={-1} className="mr-auto min-w-0 truncate text-lg font-bold outline-none">
                  {current ? displayName(current) : "Conversación"}
                </h2>
                {state && <span className={`rounded-full px-3 py-1 text-xs font-semibold ${STATE_STYLES[state]}`}>{STATE_LABELS[state]}</span>}
                {!readOnly && state && !["HUMAN_ACTIVE", "CLOSED"].includes(state) && (
                  <button type="button" disabled={busy !== null} onClick={() => void run("takeover", async () => {
                    await takeOver(selected);
                    // The button disappears once in control: keep keyboard focus in the thread.
                    window.setTimeout(() => (document.getElementById("reply") ?? threadHeading.current)?.focus(), 300);
                  }, "Tomaste el control. La IA dejó de responder.")}
                    className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-blue-600 px-4 text-sm font-semibold text-white disabled:opacity-60">
                    <Hand className="h-4 w-4" aria-hidden /> Tomar control
                  </button>
                )}
                {!readOnly && humanInControl && (
                  <button type="button" disabled={busy !== null} onClick={() => void run("close", () => closeConversation(selected), "Conversación cerrada.")}
                    className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-border px-4 text-sm font-semibold disabled:opacity-60">
                    <CheckCircle2 className="h-4 w-4" aria-hidden /> Cerrar
                  </button>
                )}
              </div>

              {state === "TRANSITION_PENDING" && (
                <div role="status" className="m-3 rounded-xl border border-sky-200 bg-sky-50 p-3 text-sm text-sky-900 dark:border-sky-500/30 dark:bg-sky-500/10 dark:text-sky-100">
                  <p className="font-semibold">Hay un mensaje de la IA en envío.</p>
                  <p className="mt-1">Vas a poder responder cuando se confirme. Si el envío quedó sin confirmar, podés liberarlo: no se reenvía, pero podría llegarle tarde al cliente.</p>
                  {!readOnly && (
                    <button type="button" disabled={busy !== null} onClick={() => void run("unknown", async () => {
                      const result = await resolveUnknownSends(selected);
                      if (result.data.resolved === 0) toast.info("No había envíos sin confirmar; esperá unos segundos.");
                    })} className="mt-2 inline-flex min-h-10 items-center gap-2 rounded-lg border border-sky-300 px-3 font-semibold">
                      <XCircle className="h-4 w-4" aria-hidden /> Liberar envío sin confirmar
                    </button>
                  )}
                </div>
              )}
              {threadError && <p role="alert" className="m-3 rounded-lg bg-red-50 p-3 text-sm text-red-800 dark:bg-red-500/10 dark:text-red-200">{threadError}</p>}

              <ol ref={thread} onScroll={onThreadScroll} aria-label="Mensajes" aria-live="polite" className="min-h-0 flex-1 space-y-3 overflow-y-auto p-4">
                {messages.map((message) => {
                  const mine = message.direction === "OUTBOUND";
                  const who = message.sender === "BOT" ? "IA" : message.sender === "USER" ? "Asesor" : message.sender === "SYSTEM" ? "Sistema" : "Cliente";
                  const status = deliveryLabel(message);
                  return (
                    <li key={message.sequence} className={`flex ${mine ? "justify-end" : "justify-start"}`}>
                      <div className={`max-w-[85%] rounded-2xl px-4 py-2 text-sm ${mine ? (message.sender === "BOT" ? "bg-violet-600 text-white" : "bg-blue-600 text-white") : "bg-muted"} ${message.status === "CANCELLED" ? "opacity-50 line-through" : ""}`}>
                        <p className="mb-1 flex items-center gap-1 text-[11px] font-semibold opacity-80">
                          {message.sender === "BOT" ? <Bot className="h-3 w-3" aria-hidden /> : <UserRound className="h-3 w-3" aria-hidden />}
                          {who} · <time dateTime={message.at}>{time(message.at)}</time>
                        </p>
                        <p className="whitespace-pre-wrap break-words">{message.text ?? "[contenido no textual]"}</p>
                        {status && <p className="mt-1 text-right text-[11px] opacity-80">{status}</p>}
                      </div>
                    </li>
                  );
                })}
              </ol>
              {unseen > 0 && (
                <button type="button" onClick={jumpToLatest}
                  className="absolute bottom-28 left-1/2 inline-flex min-h-10 -translate-x-1/2 items-center gap-1 rounded-full bg-blue-600 px-4 text-sm font-semibold text-white shadow-lg">
                  <ArrowDown className="h-4 w-4" aria-hidden /> {unseen === 1 ? "1 mensaje nuevo" : `${unseen} mensajes nuevos`}
                </button>
              )}

              {!readOnly && humanInControl && (
                <div className="border-t border-border">
                  {showQuick && (
                    <div className="max-h-56 overflow-y-auto border-b border-border p-2" role="group" aria-label="Respuestas rápidas">
                      <ul className="space-y-1">
                        {replies.map((reply, index) => (
                          <li key={`${index}-${reply}`} className="flex items-start gap-1">
                            <button type="button" onClick={() => insertQuickReply(reply)} className="min-h-10 flex-1 rounded-lg px-3 py-2 text-left text-sm hover:bg-muted">{reply}</button>
                            <button type="button" aria-label={`Borrar respuesta rápida: ${reply}`} onClick={() => saveReplies(replies.filter((_, i) => i !== index))}
                              className="inline-flex min-h-10 min-w-10 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted">
                              <X className="h-4 w-4" aria-hidden />
                            </button>
                          </li>
                        ))}
                      </ul>
                      <button type="button" disabled={draft.trim().length < 3 || replies.includes(draft.trim())}
                        onClick={() => { saveReplies([...replies, draft.trim()]); toast.success("Respuesta rápida guardada."); }}
                        className="mt-2 inline-flex min-h-10 items-center gap-1 rounded-lg px-3 text-sm font-semibold text-blue-700 disabled:opacity-50 dark:text-blue-300">
                        <Plus className="h-4 w-4" aria-hidden /> Guardar lo que escribí como respuesta rápida
                      </button>
                    </div>
                  )}
                  {replyWindow && (
                    <p role="status" className={`px-3 pt-3 text-xs ${windowClosed ? "font-semibold text-amber-700 dark:text-amber-300" : "text-muted-foreground"}`}>
                      {replyWindow.closes_at
                        ? `Podés responder por WhatsApp hasta el ${time(replyWindow.closes_at)}.`
                        : "Pasaron más de 24 horas desde el último mensaje del cliente. WhatsApp no permite escribirle hasta que vuelva a escribir (o con una plantilla aprobada)."}
                    </p>
                  )}
                  <form onSubmit={(event) => { event.preventDefault(); void sendDraft(); }} className="flex items-end gap-2 p-3">
                    <button type="button" aria-expanded={showQuick} aria-label="Respuestas rápidas" onClick={() => { if (!showQuick) loadReplies(); setShowQuick(!showQuick); }}
                      className={`inline-flex min-h-11 min-w-11 items-center justify-center rounded-xl border border-border ${showQuick ? "bg-muted" : ""}`}>
                      <MessageSquareText className="h-5 w-5" aria-hidden />
                    </button>
                    <label htmlFor="reply" className="sr-only">Respuesta al cliente</label>
                    <textarea id="reply" value={draft} maxLength={4096} rows={2} enterKeyHint="enter"
                      onChange={(event) => { setDraft(event.target.value); }}
                      // On a phone keyboard Enter is a line break; there the Send button sends.
                      onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey && !isTouch()) { event.preventDefault(); void sendDraft(); } }}
                      className="min-h-11 flex-1 resize-none rounded-xl border border-border bg-background px-3 py-2 text-base sm:text-sm" placeholder="Escribí tu respuesta…" />
                    <button type="submit" disabled={busy !== null || draft.trim() === "" || windowClosed} aria-label="Enviar respuesta"
                      className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-blue-600 px-4 text-sm font-semibold text-white disabled:opacity-60">
                      <Send className="h-4 w-4" aria-hidden /> <span className="hidden sm:inline">Enviar</span>
                    </button>
                  </form>
                </div>
              )}
              {!readOnly && humanInControl && aiEnabled && (
                <details className="border-t border-border px-3 py-2 text-sm">
                  <summary className="cursor-pointer font-semibold text-muted-foreground">Devolver la conversación a la IA</summary>
                  <div className="mt-2 flex flex-wrap items-end gap-2">
                    <label className="flex min-w-60 flex-1 flex-col gap-1 text-xs font-semibold">Motivo (queda registrado)
                      <input value={resumeReason} onChange={(event) => setResumeReason(event.target.value)} maxLength={500}
                        className="min-h-10 rounded-lg border border-border bg-background px-3 text-sm font-normal" />
                    </label>
                    <button type="button" disabled={busy !== null || resumeReason.trim().length < 3}
                      onClick={() => void run("resume", async () => { await resumeAi(selected, resumeReason.trim()); setResumeReason(""); }, "La IA retomó la conversación.")}
                      className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-border px-3 font-semibold disabled:opacity-60">
                      <Bot className="h-4 w-4" aria-hidden /> Reanudar IA
                    </button>
                  </div>
                </details>
              )}
            </>
          )}
        </div>
      </div>
    </section>
  );
}
