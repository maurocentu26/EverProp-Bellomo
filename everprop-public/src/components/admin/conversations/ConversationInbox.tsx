"use client";

import { Fragment, useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { ArrowDown, ArrowLeft, Bot, ChevronDown, ChevronUp, FileText, Paperclip, Sparkles, UserPlus, Check, CheckCheck, CheckCircle2, CircleAlert, Clock, Hand, MessageSquare, MessageSquareText, MoreVertical, Plus, RefreshCw, Search, Send, StickyNote, TriangleAlert, X, XCircle } from "lucide-react";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import { useCurrentSession } from "@/hooks/use-current-session";
import {
  CHANNEL_LABELS,
  MESSAGE_PAGE,
  addNote,
  clockTime,
  closeConversation,
  reopenConversation,
  dayLabel,
  deliveryLabel,
  initials,
  sameDay,
  getConversationMessages,
  listConversations,
  MIN_SEARCH,
  mergeMessages,
  previewText,
  resolveUnknownSends,
  resumeAi,
  sendReply,
  suggestReply,
  openConversationLead,
  sendAttachment,
  listTemplates,
  sendTemplate,
  renderTemplate,
  type WhatsAppTemplate,
  ATTACHMENT_TYPES,
  ATTACHMENT_MAX_BYTES,
  fileSize,
  type MessageMedia,
  takeOver,
  threadCursor,
  type ConversationFilter,
  type ConversationMessage,
  type ConversationState,
  type ConversationSummary,
  HANDOFF_REASONS,
  type HandoffSummary,
} from "@/lib/conversations-api";

import { CONVERSATION_TABS, conversationTab, conversationReason, type ConversationTab } from "@/lib/conversation-presentation";
import { VisitRequestsBoard } from "@/components/admin/assistant/VisitRequestsBoard";

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

/** WhatsApp-style ticks. Problems always carry words, never color alone; UNKNOWN is never shown as sent. */
function DeliveryMark({ status }: { status: string }) {
  const label = deliveryLabel({ direction: "OUTBOUND", status }) ?? status;
  const icon = "h-3.5 w-3.5 shrink-0";
  switch (status) {
    case "QUEUED": return <Clock className={icon} role="img" aria-label={label} />;
    case "SENT": return <Check className={icon} role="img" aria-label={label} />;
    case "DELIVERED": return <CheckCheck className={icon} role="img" aria-label={label} />;
    case "READ": return <CheckCheck className={`${icon} wa-read`} role="img" aria-label={label} />;
    case "FAILED": return <span className="inline-flex items-center gap-0.5 font-semibold text-red-600 dark:text-red-400"><CircleAlert className={icon} aria-hidden />{label}</span>;
    case "UNKNOWN": return <span className="inline-flex items-center gap-0.5 font-semibold text-amber-700 dark:text-amber-300"><TriangleAlert className={icon} aria-hidden />{label}</span>;
    default: return <span>{label}</span>;
  }
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
const SPLIT_VIEW = "(min-width: 768px)";

/**
 * Phone/tablet with a conversation open: full screen like WhatsApp. The chat follows the visual viewport, which
 * is what shrinks when the iOS keyboard opens (100dvh does not), and the system Back closes the chat instead of
 * leaving the page. Desktop keeps the split view untouched.
 */
function useFullscreenChat(open: boolean, onSystemBack: () => void) {
  const back = useRef(onSystemBack);
  useEffect(() => { back.current = onSystemBack; });
  useEffect(() => {
    if (!open || window.matchMedia(SPLIT_VIEW).matches) return;
    const root = document.documentElement;
    const viewport = window.visualViewport;
    let frame = 0;
    let lastHeight = -1;
    let lastTop = -1;
    const fit = () => {
      frame = 0;
      // Pinch zoom belongs to the browser, not to the keyboard layout.
      if (viewport && viewport.scale !== 1) return;
      const height = viewport?.height ?? window.innerHeight;
      const keyboard = window.innerHeight - height > 120;
      const top = keyboard ? viewport?.offsetTop ?? 0 : 0;
      if (height !== lastHeight) root.style.setProperty("--wa-chat-height", `${height}px`);
      if (top !== lastTop) root.style.setProperty("--wa-chat-top", `${top}px`);
      lastHeight = height;
      lastTop = top;
      root.classList.toggle("wa-keyboard", keyboard);
    };
    const scheduleFit = () => { if (!frame) frame = window.requestAnimationFrame(fit); };
    const onViewportScroll = () => {
      if (window.innerHeight - (viewport?.height ?? window.innerHeight) > 120) scheduleFit();
    };
    fit();
    root.classList.add("wa-chat-open");
    viewport?.addEventListener("resize", scheduleFit);
    viewport?.addEventListener("scroll", onViewportScroll);
    window.addEventListener("resize", scheduleFit);
    const physicalFocus = (event: KeyboardEvent) => { if (event.key === "Tab") root.classList.add("wa-physical-focus"); };
    const pointerFocus = () => root.classList.remove("wa-physical-focus");
    window.addEventListener("keydown", physicalFocus);
    window.addEventListener("pointerdown", pointerFocus);
    window.history.pushState({ waChat: true }, "");
    const onPop = () => back.current();
    window.addEventListener("popstate", onPop);
    return () => {
      viewport?.removeEventListener("resize", scheduleFit);
      viewport?.removeEventListener("scroll", onViewportScroll);
      window.removeEventListener("resize", scheduleFit);
      window.removeEventListener("keydown", physicalFocus);
      window.removeEventListener("pointerdown", pointerFocus);
      window.cancelAnimationFrame(frame);
      window.removeEventListener("popstate", onPop);
      root.classList.remove("wa-chat-open", "wa-keyboard", "wa-physical-focus");
      root.style.removeProperty("--wa-chat-height");
      root.style.removeProperty("--wa-chat-top");
      // Closed from the app's own arrow: drop the history entry pushed on open.
      if ((window.history.state as { waChat?: boolean } | null)?.waChat) window.history.back();
    };
  }, [open]);
}

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
  const router = useRouter();
  const readOnly = user?.apiRole === "READ_ONLY";
  const [filter, setFilter] = useState<ConversationFilter>("all");
  const [tab, setTab] = useState<ConversationTab>("human");
  const [showClient, setShowClient] = useState(false);
  // What the user types, and the term actually sent once they pause typing.
  const [query, setQuery] = useState("");
  const [search, setSearch] = useState("");
  useEffect(() => {
    const timer = window.setTimeout(() => setSearch(query.trim().length >= MIN_SEARCH ? query.trim() : ""), 300);
    return () => window.clearTimeout(timer);
  }, [query]);
  const [items, setItems] = useState<ConversationSummary[]>([]);
  const [listError, setListError] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  const [refreshedAt, setRefreshedAt] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  // Kept when the conversation leaves the current filter (e.g. after taking control).
  const [openedSummary, setOpenedSummary] = useState<ConversationSummary | null>(null);
  const [state, setState] = useState<ConversationState | null>(null);
  const [epoch, setEpoch] = useState(0);
  const [aiEnabled, setAiEnabled] = useState(false);
  const [copilotEnabled, setCopilotEnabled] = useState(false);
  // The copilot draft currently in the composer (to report whether it was sent as is or edited).
  const [suggestion, setSuggestion] = useState<{ id: string; text: string; applied: boolean } | null>(null);
  // WhatsApp only: when the 24 h service window closes (null closes_at = already closed).
  const [replyWindow, setReplyWindow] = useState<{ closes_at: string | null; remaining_ms: number } | null>(null);
  const [handoff, setHandoff] = useState<HandoffSummary | null>(null);
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
  const [showActionsMenu, setShowActionsMenu] = useState(false);
  const [resumeReason, setResumeReason] = useState("");
  const [showResume, setShowResume] = useState(false);
  const [handoffDismissed, setHandoffDismissed] = useState(false);
  const [handoffExpanded, setHandoffExpanded] = useState(false);
  const [note, setNote] = useState("");
  // One composer, two modes: reply to the client or a note only the team sees.
  const [noteMode, setNoteMode] = useState(false);
  // Outside WhatsApp's 24 h window: approved templates, the one picked and its variables.
  const [templates, setTemplates] = useState<WhatsAppTemplate[] | null>(null);
  const [template, setTemplate] = useState<WhatsAppTemplate | null>(null);
  const [templateParams, setTemplateParams] = useState<string[]>([]);
  // Same rule as replies: the key belongs to the exact text it was created for.
  const noteKey = useRef({ key: newKey(), text: "" });
  const clientBack = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (showClient) {
      if (window.matchMedia("(min-width: 1200px)").matches) document.getElementById("conversation-client")?.focus();
      else clientBack.current?.focus();
    }
  }, [showClient]);
  const threadHeading = useRef<HTMLButtonElement>(null);
  const thread = useRef<HTMLOListElement>(null);
  const atBottom = useRef(true);
  const [unseen, setUnseen] = useState(0);
  const [showQuick, setShowQuick] = useState(false);
  const { replies, load: loadReplies, save: saveReplies } = useQuickReplies(user?.id);

  const actionsButton = useRef<HTMLButtonElement>(null);
  const actionFocus = useRef<"composer" | "client" | "resume" | null>(null);

  useLayoutEffect(() => {
    const input = document.getElementById("reply");
    if (!(input instanceof HTMLTextAreaElement)) return;
    input.style.height = "auto";
    input.style.height = `${input.scrollHeight}px`;
  }, [draft, note, noteMode, selected, state]);

  const refreshList = useCallback(async () => {
    if (!user) return;
    const request = ++listRequest.current;
    try {
      const response = await listConversations(filter, search);
      if (request !== listRequest.current) return; // a newer filter/refresh already answered
      setItems(response.data);
      setListError("");
      setRefreshedAt(new Date().toISOString());
    } catch {
      setListError("No pudimos actualizar la bandeja. Reintentamos en unos segundos.");
    }
  }, [filter, search, user]);

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
      setEpoch(response.conversation.epoch);
      setAiEnabled(response.conversation.ai_enabled);
      setCopilotEnabled(response.conversation.copilot_enabled === true);
      const serviceWindow = response.conversation.reply_window;
      setReplyWindow(serviceWindow ? { ...serviceWindow, remaining_ms: serviceWindow.closes_at ? Date.parse(serviceWindow.closes_at) - Date.now() : 0 } : null);
      setHandoff(response.conversation.handoff ?? null);
      setThreadError("");
    } catch {
      setThreadError("No pudimos cargar los mensajes. Reintentamos en unos segundos.");
    }
  }, [selected]);

  useVisiblePolling(useCallback(() => void refreshList(), [refreshList]), 8000);
  useVisiblePolling(useCallback(() => void refreshThread(), [refreshThread]), 3000);

  // Follow new messages only when already at the bottom; otherwise offer a jump instead of moving the reader.
  useLayoutEffect(() => {
    if (atBottom.current) thread.current?.scrollTo({ top: thread.current.scrollHeight, behavior: "instant" });
  }, [messages]);

  // Viewport, composer and loaded media can resize the history without a new message.
  useEffect(() => {
    const el = thread.current;
    if (!el) return;
    const follow = () => { if (atBottom.current) el.scrollTo({ top: el.scrollHeight, behavior: "instant" }); };
    const observer = new ResizeObserver(follow);
    observer.observe(el);
    el.addEventListener("load", follow, true);
    return () => { observer.disconnect(); el.removeEventListener("load", follow, true); };
  }, [selected]);

  function onThreadScroll() {
    const el = thread.current;
    if (!el) return;
    atBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
    if (atBottom.current) setUnseen(0);
  }

  function jumpToLatest() {
    atBottom.current = true;
    setUnseen(0);
    thread.current?.scrollTo({ top: thread.current.scrollHeight, behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth" });
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
    setShowClient(false);
    setShowActionsMenu(false);
    setShowResume(false);
    setResumeReason("");
    setHandoffDismissed(false);
    setHandoffExpanded(false);
    setDraft(drafts.current.get(id) ?? "");
    draftKey.current = { key: newKey(), text: "" };
    setSuggestion(null);
    setNote("");
    setNoteMode(false);
    setTemplates(null);
    setTemplate(null);
    noteKey.current = { key: newKey(), text: "" };
    window.setTimeout(() => threadHeading.current?.focus(), 0);
  }

  function backToList() {
    setShowClient(false);
    const id = selectedRef.current;
    if (id) drafts.current.set(id, draft);
    selectedRef.current = null;
    setSelected(null);
    window.setTimeout(() => document.getElementById(`conversation-${id}`)?.focus(), 0);
  }

  useFullscreenChat(selected !== null, () => backToList());

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

  /** Manual refresh with visible feedback: list and open thread together. */
  async function refreshNow() {
    setRefreshing(true);
    try {
      await Promise.all([refreshList(), refreshThread()]);
    } finally {
      setRefreshing(false);
    }
  }

  async function sendDraft() {
    const text = draft.trim();
    const conversation = selected;
    if (!conversation || !text || windowClosed) return;
    if (draftKey.current.text !== text) draftKey.current = { key: newKey(), text };
    atBottom.current = true;
    const fromDraft = suggestion?.applied ? suggestion.id : undefined;
    await run("reply", async () => {
      await sendReply(conversation, text, draftKey.current.key, fromDraft);
      drafts.current.delete(conversation);
      if (selectedRef.current === conversation) {
        setDraft("");
        draftKey.current = { key: newKey(), text: "" };
        setSuggestion(null);
      }
    });
  }

  /** Copilot proposes a response; only the advisor can copy it into the composer and send it. */
  async function suggestDraft() {
    const conversation = selected;
    if (!conversation) return;
    await run("suggest", async () => {
      const { data } = await suggestReply(conversation);
      if (selectedRef.current !== conversation) return;
      setSuggestion({ id: data.suggestion_id, text: data.text, applied: false });

    });
  }

  async function saveNote() {
    const text = note.trim();
    const conversation = selected;
    if (!conversation || !text) return;
    if (noteKey.current.text !== text) noteKey.current = { key: newKey(), text };
    await run("note", async () => {
      await addNote(conversation, text, noteKey.current.key);
      if (selectedRef.current === conversation) {
        setNote("");
        noteKey.current = { key: newKey(), text: "" };
      }
    }, "Nota guardada. Solo la ve el equipo.");
  }

  /** Photo or PDF: sent right away with what is typed as its caption (like WhatsApp's caption). */
  async function sendFile(file: File) {
    const conversation = selected;
    if (!conversation) return;
    if (file.size > ATTACHMENT_MAX_BYTES) {
      toast.error("El archivo pesa más de 10 MB.");
      return;
    }
    const caption = draft.trim();
    const key = newKey();
    atBottom.current = true;
    await run("attach", async () => {
      await sendAttachment(conversation, file, caption, key);
      if (selectedRef.current === conversation) {
        setDraft("");
        setSuggestion(null);
      }
    }, file.type === "application/pdf" ? "PDF enviado." : "Foto enviada.");
  }

  async function openTemplates() {
    const conversation = selected;
    if (!conversation) return;
    await run("templates", async () => {
      const { data } = await listTemplates(conversation);
      if (selectedRef.current === conversation) setTemplates(data);
    });
  }

  async function sendPickedTemplate() {
    const conversation = selected;
    if (!conversation || !template) return;
    await run("template", async () => {
      await sendTemplate(conversation, template, templateParams.map((p) => p.trim()), newKey());
      if (selectedRef.current === conversation) {
        setTemplate(null);
        setTemplates(null);
      }
    }, "Plantilla enviada. Si el cliente responde, se reabre la conversación.");
  }

  function openAttachment() {
    document.getElementById("conversation-attachment")?.click();
  }

  function focusComposer() {
    window.setTimeout(() => document.getElementById("reply")?.focus(), 0);
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
  const replyRemaining = replyWindow?.remaining_ms ?? 0;
  const replyUrgent = replyRemaining > 0 && replyRemaining < 2 * 60 * 60 * 1000;

  const visibleItems = items.filter(item => conversationTab(item.state) === tab);

  return (
    <section className="wa-inbox mx-auto flex w-full max-w-none min-w-0 flex-col gap-4 pb-6 md:min-h-0 md:flex-1 md:pb-0">
      <header className={`${selected ? "hidden md:flex" : "flex"} shrink-0 flex-wrap items-end justify-between gap-3`}>
        <div>
          <h1 className="text-2xl font-bold">Conversaciones</h1>
          <p className="mt-1 hidden text-sm text-muted-foreground sm:block">WhatsApp y chat web en una sola bandeja. La IA se detiene cuando tomás el control.</p>
        </div>
        <button type="button" disabled={refreshing} onClick={() => void refreshNow()} aria-describedby="inbox-refresh-status"
          className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-border bg-card px-4 text-sm font-semibold disabled:opacity-70">
          <RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin motion-reduce:animate-none" : ""}`} aria-hidden /> {refreshing ? "Actualizando…" : "Actualizar"}
        </button>
        <p id="inbox-refresh-status" role="status" className="sr-only">
          {refreshedAt ? `Actualizado ${clockTime(refreshedAt)} · se actualiza solo` : "Se actualiza solo cada pocos segundos"}
        </p>
      </header>

      <div className="conversation-columns">
        <aside className={`${selected ? "hidden md:flex" : "flex"} min-w-0 flex-col rounded-2xl border border-border bg-card md:min-h-0 md:overflow-hidden`} aria-label="Listado de conversaciones">
          <div role="search" className="p-2">
            <label htmlFor="inbox-search" className="sr-only">Buscar conversaciones</label>
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
              <input id="inbox-search" type="search" value={query} onChange={(event) => setQuery(event.target.value)} maxLength={100}
                placeholder="Nombre, teléfono, email o texto…" enterKeyHint="search"
                className="min-h-10 w-full rounded-lg border border-border bg-background pl-9 pr-3 text-base sm:text-sm" />
            </div>
          </div>
          <div role="group" aria-label="Bandejas de conversaciones" title="Cantidades del filtro actual" className="conversation-tabs">
            {CONVERSATION_TABS.map(([id, label]) => (
              <button key={id} type="button" aria-pressed={tab === id} onClick={() => setTab(id)}>
                {label} <span>{items.filter(item => conversationTab(item.state) === id).length}</span>
              </button>
            ))}
          </div>
          <label className="conversation-filter">Mostrar
            <select value={filter} onChange={event => setFilter(event.target.value as ConversationFilter)}>
              {FILTERS.map(([id, label]) => <option key={id} value={id}>{label}</option>)}
            </select>
          </label>
          {listError && <p role="alert" className="m-3 rounded-lg bg-red-50 p-3 text-sm text-red-800 dark:bg-red-500/10 dark:text-red-200">{listError} <button type="button" disabled={refreshing} onClick={() => void refreshNow()} className="conversation-secondary mt-2">{refreshing ? "Reintentando…" : "Reintentar"}</button></p>}
          <ul role="list" className="min-h-0 flex-1 divide-y divide-border overflow-y-auto">
            {visibleItems.length === 0 && !listError && (
              <li className="p-6 text-center text-sm text-muted-foreground">
                {search ? `Nada coincide con “${search}” en este filtro.` : "No hay conversaciones en este filtro."}
              </li>
            )}
            {visibleItems.map((item) => {
              const preview = previewText(item);
              return (
                <li key={item.id}>
                  <button id={`conversation-${item.id}`} type="button" onClick={() => open(item.id)} aria-current={selected === item.id ? "true" : undefined}
                    className={`flex w-full min-w-0 items-start gap-3 px-3 py-3 text-left hover:bg-muted/60 focus-visible:outline-2 focus-visible:outline-blue-600 ${selected === item.id ? "wa-selected" : ""}`}>
                    <span aria-hidden className="wa-accent mt-0.5 inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-sm font-bold">
                      {initials(displayName(item))}
                    </span>
                    <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                      <span className="flex items-center justify-between gap-2">
                        <span className={`truncate ${item.unread > 0 ? "font-bold" : "font-semibold"}`}>{displayName(item)}</span>
                        <time dateTime={item.last_activity_at} className={`shrink-0 text-xs ${item.unread > 0 ? "font-semibold text-[var(--wa-accent)]" : "text-muted-foreground"}`}>
                          {sameDay(item.last_activity_at, new Date().toISOString()) ? clockTime(item.last_activity_at) : dayLabel(item.last_activity_at)}
                        </time>
                      </span>
                      <span className="flex items-center justify-between gap-2">
                        <span className={`truncate text-sm ${item.unread > 0 ? "text-foreground" : "text-muted-foreground"}`}>{preview || "Sin mensajes"}</span>
                        {item.unread > 0 && <span className="wa-accent shrink-0 rounded-full px-2 py-0.5 text-xs font-bold" aria-label={`${item.unread} sin leer`}>{item.unread}</span>}
                      </span>
                      <span className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                        <span className={`rounded-full px-2 py-0.5 font-semibold ${STATE_STYLES[item.state]}`}>{conversationReason(item)}</span>
                        <span>{CHANNEL_LABELS[item.channel] ?? item.channel}</span>
                        {item.assigned_user && <span className="truncate">· {item.assigned_user.name}</span>}
                        {item.out_of_hours && item.waiting_since && (
                          <span className="rounded-full bg-indigo-100 px-2 py-0.5 font-semibold text-indigo-900 dark:bg-indigo-500/20 dark:text-indigo-100">
                            Llegó fuera de horario · {sameDay(item.waiting_since, new Date().toISOString()) ? clockTime(item.waiting_since) : `${dayLabel(item.waiting_since)} ${clockTime(item.waiting_since)}`}
                          </span>
                        )}
                      </span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </aside>

        <div className={`conversation-chat ${selected ? "wa-fullscreen flex md:h-auto" : "hidden md:flex"} relative min-w-0 flex-col overflow-hidden rounded-2xl border border-border bg-card md:min-h-0`}>
          {!selected ? (
            <div className="m-auto flex max-w-sm flex-col items-center gap-3 p-8 text-center text-muted-foreground">
              <MessageSquare className="h-8 w-8" aria-hidden />
              <p className="text-sm">Elegí una conversación para ver los mensajes y tomar el control.</p>
            </div>
          ) : (
            <>
              <div className="conversation-header wa-bar">
                <button type="button" onClick={backToList} aria-label="Volver a la bandeja" className="conversation-back">
                  <ArrowLeft className="h-5 w-5" aria-hidden />
                </button>
                <button type="button" ref={threadHeading} className="conversation-contact" aria-label={`Información del contacto: ${current ? displayName(current) : "Conversación"}`} onClick={() => setShowClient(true)}>
                  <span aria-hidden className="wa-accent conversation-avatar">{initials(current ? displayName(current) : "?")}</span>
                  <span className="conversation-identity">
                    <span role="heading" aria-level={2} className="conversation-name" title={current ? displayName(current) : "Conversación"}>
                      {current ? displayName(current) : "Conversación"}
                    </span>
                    <span className="conversation-status">
                      {current ? CHANNEL_LABELS[current.channel] ?? current.channel : ""} · {humanInControl ? "Atendés vos" : state === "AI_ACTIVE" || state === "WAITING_TOOL" ? "Responde la IA" : state === "WAITING_HUMAN" ? "Espera asesor" : state === "CLOSED" ? "Cerrada" : "Enviando…"}
                    </span>
                  </span>
                </button>
                <button ref={actionsButton} type="button" aria-expanded={showActionsMenu} aria-haspopup="dialog" aria-label="Acciones de la conversación"
                  onClick={() => { actionFocus.current = null; document.getElementById("reply")?.blur(); setShowActionsMenu(true); }} className="conversation-actions-trigger" title="Acciones">
                  <MoreVertical className="h-6 w-6" aria-hidden /><span className="sr-only">Acciones</span>
                </button>
              </div>
              {replyUrgent && replyWindow?.closes_at && <p className="conversation-window-notice" role="status" title={`Responder antes de ${dayLabel(replyWindow.closes_at)} ${clockTime(replyWindow.closes_at)}`}>Responder antes de {clockTime(replyWindow.closes_at)}</p>}

              {handoff && !handoffDismissed && (state === "WAITING_HUMAN" || state === "HUMAN_ACTIVE") && (
                // Model-written: plain text only (React escapes it), for the team, never sent to the visitor.
                <section aria-label="Resumen del asistente" className={`conversation-handoff ${handoffExpanded ? "conversation-handoff-expanded" : ""} mx-3 mt-2 rounded-xl border border-indigo-200 bg-indigo-50 px-3 py-2 text-xs text-indigo-950 dark:border-indigo-500/30 dark:bg-indigo-500/10 dark:text-indigo-50`}>
                  <div className="flex items-center justify-between gap-2">
                    <p className="min-w-0 truncate font-semibold">
                      Te la pasó la IA<span className="conversation-handoff-detail"> · {HANDOFF_REASONS[handoff.reason] ?? "Derivación"}</span>
                      <span className="conversation-handoff-detail font-normal text-muted-foreground"> · {dayLabel(handoff.at)} {clockTime(handoff.at)}</span>
                    </p>
                    <div className="flex shrink-0 items-center gap-1">
                      {handoff.summary && (
                        <button type="button" onClick={() => setHandoffExpanded((open) => !open)} aria-expanded={handoffExpanded}
                          className="inline-flex min-h-7 items-center gap-1 rounded-md px-2 text-xs font-semibold text-indigo-800 hover:bg-indigo-100 dark:text-indigo-200 dark:hover:bg-indigo-500/20">
                          {handoffExpanded ? <><ChevronUp className="h-3.5 w-3.5" aria-hidden /> Contraer</> : <><ChevronDown className="h-3.5 w-3.5" aria-hidden /> Ampliar</>}
                        </button>
                      )}
                      <button type="button" onClick={() => setHandoffDismissed(true)} aria-label="Cerrar resumen del asistente" title="Cerrar resumen"
                        className="inline-flex h-7 w-7 items-center justify-center rounded-md text-indigo-700 hover:bg-indigo-100 dark:text-indigo-200 dark:hover:bg-indigo-500/20">
                        <X className="h-3.5 w-3.5" aria-hidden />
                      </button>
                    </div>
                  </div>
                  {handoff.summary && (
                    <p className={`conversation-handoff-summary mt-1 break-words ${handoffExpanded ? "whitespace-pre-wrap" : "line-clamp-1"}`}>{handoff.summary}</p>
                  )}
                </section>
              )}

              {state === "TRANSITION_PENDING" && (
                <div role="status" className="m-3 rounded-xl border border-sky-200 bg-sky-50 p-3 text-sm text-sky-900 dark:border-sky-500/30 dark:bg-sky-500/10 dark:text-sky-100">
                  <p className="font-semibold">Hay un mensaje de la IA en envío.</p>
                  <p className="mt-1">Vas a poder responder cuando se confirme. Si el envío quedó sin confirmar, podés liberarlo: no se reenvía, pero podría llegarle tarde al cliente.</p>

                </div>
              )}
              {threadError && <p role="alert" className="m-3 rounded-lg bg-red-50 p-3 text-sm text-red-800 dark:bg-red-500/10 dark:text-red-200">{threadError}</p>}

              <div className="conversation-history relative flex min-h-0 flex-1 flex-col">
              <ol ref={thread} onScroll={onThreadScroll} aria-label="Mensajes" aria-live="polite" className="wa-thread min-h-0 flex-1 overflow-y-auto px-3 py-3 sm:px-10">
                {messages.map((message, index) => {
                  const previous = messages[index - 1];
                  const newDay = !previous || !sameDay(previous.at, message.at);
                  // Like WhatsApp: consecutive messages from the same side stack tightly; only the first gets the tail.
                  const first = newDay || previous.direction !== message.direction || previous.sender !== message.sender;
                  const separator = newDay && (
                    <li className="conversation-day my-3 flex justify-center">
                      <span className="wa-chip rounded-lg px-3 py-1 text-xs font-medium shadow-sm first-letter:uppercase">{dayLabel(message.at)}</span>
                    </li>
                  );
                  if (message.direction === "INTERNAL") {
                    return (
                      <Fragment key={message.sequence}>
                        {separator}
                        <li className="my-2 flex justify-center">
                          <div className="max-w-[85%] rounded-lg border border-dashed border-amber-500 bg-amber-50 px-3 py-2 text-sm text-amber-950 dark:bg-amber-950/60 dark:text-amber-100">
                            <p className="mb-0.5 flex items-center gap-1 text-[11px] font-semibold">
                              <StickyNote className="h-3 w-3" aria-hidden />
                              Nota interna{message.author ? ` de ${message.author}` : ""} · solo la ve el equipo
                            </p>
                            <p className="whitespace-pre-wrap break-words">{message.text}</p>
                            <p className="mt-0.5 text-right text-[11px] opacity-80"><time dateTime={message.at}>{clockTime(message.at)}</time></p>
                          </div>
                        </li>
                      </Fragment>
                    );
                  }
                  const mine = message.direction === "OUTBOUND";
                  const who = message.sender === "BOT" ? "IA" : message.sender === "USER" ? "Asesor" : message.sender === "SYSTEM" ? "Sistema" : "Cliente";
                  return (
                    <Fragment key={message.sequence}>
                      {separator}
                      <li className={`flex ${mine ? "justify-end" : "justify-start"} ${first ? "mt-2" : "mt-0.5"}`}>
                        <div className={`wa-bubble ${message.sender === "BOT" ? "conversation-ai" : mine ? "wa-out" : "wa-in"} max-w-[85%] rounded-lg px-2.5 pb-1 pt-1.5 text-sm sm:max-w-[65%] ${first ? (mine ? "rounded-tr-none" : "rounded-tl-none") : ""} ${message.status === "CANCELLED" ? "opacity-60" : ""}`}>
                          <p className={who === "Cliente" ? "sr-only" : "conversation-sender"}>{message.sender === "BOT" && <Bot className="h-4 w-4" aria-hidden />}{who}</p>
                          {message.media && <MediaPreview media={message.media} />}
                          {(message.text || !message.media) && (
                            <p className={`whitespace-pre-wrap break-words ${message.status === "CANCELLED" ? "line-through" : ""}`}>{message.text ?? "[contenido no textual]"}</p>
                          )}
                          <p className="wa-meta -mb-0.5 mt-0.5 flex items-center justify-end gap-1 text-[11px]">
                            <time dateTime={message.at}>{clockTime(message.at)}</time>
                            {mine && <DeliveryMark status={message.status} />}
                          </p>
                        </div>
                      </li>
                    </Fragment>
                  );
                })}
              </ol>
              {unseen > 0 && (
                <button type="button" onClick={jumpToLatest}
                  className="wa-accent absolute bottom-3 left-1/2 inline-flex min-h-10 -translate-x-1/2 items-center gap-1 rounded-full px-4 text-sm font-semibold shadow-lg">
                  <ArrowDown className="h-4 w-4" aria-hidden /> {unseen === 1 ? "1 mensaje nuevo" : `${unseen} mensajes nuevos`}
                </button>
              )}

              </div>

              {!readOnly && (
                <div className="conversation-compose-area border-t border-border">
                  {showQuick && !noteMode && (
                    <div className="max-h-56 overflow-y-auto border-b border-border p-2" role="group" aria-label="Respuestas rápidas">
                      <ul className="space-y-1">
                        {replies.map((reply, index) => (
                          <li key={`${index}-${reply}`} className="flex items-start gap-1">
                            <button type="button" onClick={() => insertQuickReply(reply)} className="min-h-10 flex-1 rounded-lg px-3 py-2 text-left text-sm hover:bg-muted">{reply}</button>
                            <button type="button" aria-label={`Borrar respuesta rápida: ${reply}`} onClick={() => { if (window.confirm("¿Borrar esta respuesta rápida guardada?")) saveReplies(replies.filter((_, i) => i !== index)); }}
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
                  {/* The open window is shown in the header; here only the blocking case. */}
                  <p role="status" className={windowClosed && humanInControl && !noteMode ? "wa-bar px-4 pt-3 text-xs font-semibold text-amber-800 dark:text-amber-300" : "sr-only"}>
                    {windowClosed && humanInControl ? "Pasaron más de 24 horas desde el último mensaje del cliente. Solo podés escribirle con una plantilla aprobada." : ""}
                  </p>
                  {windowClosed && humanInControl && !noteMode && templates !== null && (
                    <div className="wa-bar space-y-2 px-3 pt-2">
                      {templates.length === 0 ? (
                        <p className="text-sm text-muted-foreground">No hay plantillas aprobadas para este número. Se crean en WhatsApp Manager y Meta las revisa.</p>
                      ) : !template ? (
                        <ul className="max-h-56 space-y-1 overflow-y-auto" aria-label="Plantillas aprobadas">
                          {templates.map((t) => (
                            <li key={`${t.name}-${t.language}`}>
                              <button type="button" onClick={() => { setTemplate(t); setTemplateParams(Array.from({ length: t.params }, () => "")); }}
                                className="w-full rounded-lg bg-background px-3 py-2 text-left text-sm hover:bg-muted">
                                <span className="block font-semibold">{t.name.replaceAll("_", " ")}</span>
                                <span className="line-clamp-2 text-xs text-muted-foreground">{t.body}</span>
                              </button>
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <form onSubmit={(event) => { event.preventDefault(); void sendPickedTemplate(); }} className="space-y-2">
                          <p className="whitespace-pre-wrap rounded-lg bg-background px-3 py-2 text-sm" aria-live="polite">{renderTemplate(template.body, templateParams)}</p>
                          {templateParams.map((value, index) => (
                            <label key={index} className="flex flex-col gap-1 text-xs font-semibold">Dato {`{{${index + 1}}}`}
                              <input value={value} maxLength={200} required onChange={(event) => setTemplateParams((all) => all.map((v, i) => (i === index ? event.target.value : v)))}
                                className="wa-input min-h-11 rounded-lg px-3 text-base font-normal sm:text-sm" />
                            </label>
                          ))}
                          <div className="flex gap-2 pb-2">
                            <button type="button" onClick={() => setTemplate(null)} className="min-h-11 flex-1 rounded-full border border-border px-4 text-sm font-semibold">Otra plantilla</button>
                            <button type="submit" disabled={busy !== null || templateParams.some((p) => p.trim() === "")}
                              className="wa-accent min-h-11 flex-1 rounded-full px-4 text-sm font-semibold disabled:opacity-50">Enviar plantilla</button>
                          </div>
                        </form>
                      )}
                    </div>
                  )}
                    {!noteMode && suggestion && (
                      <section className="conversation-suggestion" aria-label="Sugerencia del copiloto">
                        <h3><Sparkles className="h-5 w-5" aria-hidden /> Sugerencia para responder</h3>
                        <p className="whitespace-pre-wrap break-words">{suggestion.text}</p>
                        <p>Revisala antes de enviar. No se envía automáticamente.</p>
                        <div className="flex flex-wrap gap-2">
                          <button type="button" disabled={busy !== null} className="wa-accent" onClick={() => { setDraft(suggestion.text); setSuggestion({ ...suggestion, applied: true }); focusComposer(); }}>Usar esta respuesta</button>
                          <button type="button" disabled={busy !== null} className="conversation-secondary" onClick={() => { setSuggestion(null); focusComposer(); }}>Escribir otra</button>
                        </div>
                      </section>
                    )}
                  <form onSubmit={(event) => { event.preventDefault(); void (noteMode ? saveNote() : sendDraft()); }} className="conversation-composer wa-bar">

                      {!noteMode && !humanInControl && !readOnly && state !== "CLOSED" && state !== "TRANSITION_PENDING" && state ? (
                        // IA in control: one tap takes the chat, instead of sending the user to the actions menu.
                        <button type="button" disabled={busy !== null} className="wa-accent conversation-take min-h-11 flex-1 rounded-full px-4 font-semibold"
                          onClick={() => void run("takeover", async () => { await takeOver(selected); focusComposer(); }, "Tomaste el control. La IA dejó de responder.")}>
                          <Hand className="mr-2 inline h-5 w-5" aria-hidden />Responder yo
                        </button>
                      ) : <>
                      <label htmlFor="reply" className="sr-only">{noteMode ? "Nota interna para el equipo" : "Respuesta al cliente"}</label>
                      <textarea id="reply" value={noteMode ? note : draft} maxLength={4096} rows={1} enterKeyHint="send" inputMode="text" autoComplete="off" disabled={!noteMode && !humanInControl}
                        onChange={(event) => { if (noteMode) setNote(event.target.value); else setDraft(event.target.value); }}
                        // The keyboard shrinks the chat: keep the latest message in view, as WhatsApp does.
                        onFocus={() => { if (atBottom.current) window.setTimeout(() => thread.current?.scrollTo({ top: thread.current.scrollHeight }), 250); }}
                        // On a phone keyboard Enter is a line break; there the Send button sends.
                        onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing && !isTouch()) { event.preventDefault(); void (noteMode ? saveNote() : sendDraft()); } }}
                        className={`${noteMode ? "wa-note-mode" : "wa-input"} field-sizing-content max-h-36 min-h-11 min-w-0 flex-1 resize-none rounded-3xl px-4 py-2.5 text-base outline-none focus-visible:ring-2 focus-visible:ring-[var(--wa-accent)] sm:text-sm`}
                        placeholder={noteMode ? "Nota interna: solo la ve el equipo" : humanInControl ? "Escribí un mensaje" : "No disponible"} />
                      <button type="submit" disabled={busy !== null || (!noteMode && !humanInControl) || (noteMode ? note.trim() === "" : draft.trim() === "" || windowClosed)}
                        aria-label={noteMode ? "Guardar nota" : "Enviar respuesta"}
                        className="conversation-send wa-accent inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-full px-4 disabled:opacity-50">
                        {noteMode ? <StickyNote className="h-5 w-5" aria-hidden /> : <Send className="h-5 w-5" aria-hidden />}<span className="sr-only">{noteMode ? "Guardar" : "Enviar"}</span>
                      </button>
                      </>}
                    </form>
                </div>
              )}
              <input id="conversation-attachment" type="file" accept={ATTACHMENT_TYPES} className="sr-only" tabIndex={-1} aria-label="Archivo adjunto" disabled={readOnly || busy !== null}
                onChange={(event) => { const file = event.target.files?.[0]; event.target.value = ""; if (file) void sendFile(file); }} />
              <Dialog open={showActionsMenu} onOpenChange={setShowActionsMenu}>
                <DialogContent className="wa-inbox conversation-actions" finalFocus={() => {
                  const destination = actionFocus.current;
                  actionFocus.current = null;
                  if (destination === "client") return window.matchMedia("(min-width: 1200px)").matches ? document.getElementById("conversation-client") : clientBack.current;
                  if (destination === "resume") return document.getElementById("resume-reason");
                  if (destination === "composer") return document.getElementById("reply");
                  return actionsButton.current;
                }}>
                  <DialogTitle>Acciones de la conversación</DialogTitle>
                  <DialogDescription>{replyWindow?.closes_at ? `Responder antes de ${dayLabel(replyWindow.closes_at)} ${clockTime(replyWindow.closes_at)}` : "Elegí cómo continuar. El borrador se conserva."}</DialogDescription>
                  <h3 className="conversation-action-group">Mensaje</h3>
                  <button type="button" disabled={busy !== null || !!(readOnly ? "Permiso de solo lectura" : !humanInControl ? "Primero tomá el control" : windowClosed ? "La ventana de respuesta está cerrada" : "")} className="conversation-action-item"
                    onClick={() => { setShowActionsMenu(false); loadReplies(); setNoteMode(false); setShowQuick(true); }}>
                    <MessageSquareText className="h-5 w-5 shrink-0" aria-hidden /><span><span className="block font-semibold">{"Respuestas rápidas"}</span><span className="block text-muted-foreground">{(readOnly ? "Permiso de solo lectura" : !humanInControl ? "Primero tomá el control" : windowClosed ? "La ventana de respuesta está cerrada" : "") || (busy !== null ? "Esperá a que termine la acción actual" : ("Insertar una respuesta guardada"))}</span></span>
                  </button>
                  <button type="button" disabled={busy !== null || !!(readOnly ? "Permiso de solo lectura" : noteMode && !humanInControl ? "Primero tomá el control" : "")} className="conversation-action-item"
                    onClick={() => { actionFocus.current = "composer"; setShowActionsMenu(false); setNoteMode(!noteMode); setShowQuick(false); }}>
                    <StickyNote className="h-5 w-5 shrink-0" aria-hidden /><span><span className="block font-semibold">{noteMode ? "Responder al cliente" : "Nota interna"}</span><span className="block text-muted-foreground">{(readOnly ? "Permiso de solo lectura" : noteMode && !humanInControl ? "Primero tomá el control" : "") || (busy !== null ? "Esperá a que termine la acción actual" : (noteMode ? "Volver al borrador del cliente" : "Solo la ve el equipo"))}</span></span>
                  </button>
                  <button type="button" disabled={busy !== null || !!(readOnly ? "Permiso de solo lectura" : !humanInControl ? "Primero tomá el control" : noteMode ? "Volvé a responder al cliente antes de adjuntar" : windowClosed ? "La ventana de respuesta está cerrada" : current?.channel !== "WEB_CHAT" && current?.channel !== "WHATSAPP" ? "El canal no admite adjuntos" : "")} className="conversation-action-item"
                    onClick={() => { setShowActionsMenu(false); openAttachment(); }}>
                    <Paperclip className="h-5 w-5 shrink-0" aria-hidden /><span><span className="block font-semibold">{"Adjuntar"}</span><span className="block text-muted-foreground">{(readOnly ? "Permiso de solo lectura" : !humanInControl ? "Primero tomá el control" : noteMode ? "Volvé a responder al cliente antes de adjuntar" : windowClosed ? "La ventana de respuesta está cerrada" : current?.channel !== "WEB_CHAT" && current?.channel !== "WHATSAPP" ? "El canal no admite adjuntos" : "") || (busy !== null ? "Esperá a que termine la acción actual" : ("Foto o PDF; se respetan los límites del canal"))}</span></span>
                  </button>
                  <button type="button" disabled={busy !== null || !!(readOnly ? "Permiso de solo lectura" : !copilotEnabled ? "Copiloto no habilitado" : !humanInControl ? "Primero tomá el control" : windowClosed ? "La ventana de respuesta está cerrada" : "")} className="conversation-action-item"
                    onClick={() => { setShowActionsMenu(false); setNoteMode(false); void suggestDraft(); }}>
                    <Sparkles className="h-5 w-5 shrink-0" aria-hidden /><span><span className="block font-semibold">{"Sugerir respuesta con IA"}</span><span className="block text-muted-foreground">{(readOnly ? "Permiso de solo lectura" : !copilotEnabled ? "Copiloto no habilitado" : !humanInControl ? "Primero tomá el control" : windowClosed ? "La ventana de respuesta está cerrada" : "") || (busy !== null ? "Esperá a que termine la acción actual" : ("Revisar una sugerencia antes de enviarla"))}</span></span>
                  </button>
                  <button type="button" disabled={busy !== null || !!(readOnly ? "Permiso de solo lectura" : current?.channel !== "WHATSAPP" ? "Solo disponible en WhatsApp" : !humanInControl ? "Primero tomá el control" : !windowClosed ? "Usá el campo de mensaje mientras la ventana esté abierta" : "")} className="conversation-action-item"
                    onClick={() => { setShowActionsMenu(false); setNoteMode(false); void openTemplates(); }}>
                    <MessageSquareText className="h-5 w-5 shrink-0" aria-hidden /><span><span className="block font-semibold">{"Escribir con plantilla"}</span><span className="block text-muted-foreground">{(readOnly ? "Permiso de solo lectura" : current?.channel !== "WHATSAPP" ? "Solo disponible en WhatsApp" : !humanInControl ? "Primero tomá el control" : !windowClosed ? "Usá el campo de mensaje mientras la ventana esté abierta" : "") || (busy !== null ? "Esperá a que termine la acción actual" : ("Usar una plantilla aprobada de WhatsApp"))}</span></span>
                  </button>
                  <h3 className="conversation-action-group">Cliente</h3>
                  <button type="button" disabled={busy !== null} className="conversation-action-item"
                    onClick={() => { actionFocus.current = "client"; setShowActionsMenu(false); setShowClient(true); }}>
                    <MessageSquare className="h-5 w-5 shrink-0" aria-hidden /><span><span className="block font-semibold">{"Ver cliente"}</span><span className="block text-muted-foreground">{busy !== null ? "Esperá a que termine la acción actual" : "Información y solicitudes de visita"}</span></span>
                  </button>
                  <button type="button" disabled={busy !== null || !!(readOnly ? "Permiso de solo lectura" : "")} className="conversation-action-item"
                    onClick={() => { setShowActionsMenu(false); void run("lead", async () => { const { data } = await openConversationLead(selected); router.push(`/admin/leads/${data.lead_id}`); }); }}>
                    <UserPlus className="h-5 w-5 shrink-0" aria-hidden /><span><span className="block font-semibold">{"Lead y visita"}</span><span className="block text-muted-foreground">{(readOnly ? "Permiso de solo lectura" : "") || (busy !== null ? "Esperá a que termine la acción actual" : ("Gestionar o crear el lead comercial"))}</span></span>
                  </button>
                  <h3 className="conversation-action-group">Atención</h3>
                  <button type="button" disabled={busy !== null || !!(readOnly ? "Permiso de solo lectura" : humanInControl ? "Ya atendés vos" : state === "CLOSED" ? "Primero reabrí la conversación" : state === "TRANSITION_PENDING" || !state ? "Esperá a que termine el envío" : "")} className="conversation-action-item"
                    onClick={() => { setShowActionsMenu(false); void run("takeover", async () => { await takeOver(selected); focusComposer(); }, "Tomaste el control. La IA dejó de responder."); }}>
                    <Hand className="h-5 w-5 shrink-0" aria-hidden /><span><span className="block font-semibold">{"Tomar control"}</span><span className="block text-muted-foreground">{(readOnly ? "Permiso de solo lectura" : humanInControl ? "Ya atendés vos" : state === "CLOSED" ? "Primero reabrí la conversación" : state === "TRANSITION_PENDING" || !state ? "Esperá a que termine el envío" : "") || (busy !== null ? "Esperá a que termine la acción actual" : ("Pausar la IA y responder"))}</span></span>
                  </button>
                  <button type="button" disabled={busy !== null || !!(readOnly ? "Permiso de solo lectura" : !aiEnabled ? "IA no habilitada" : !humanInControl ? "Primero tomá el control" : "")} className="conversation-action-item"
                    onClick={() => { actionFocus.current = "resume"; setShowActionsMenu(false); setShowResume(true); }}>
                    <Bot className="h-5 w-5 shrink-0" aria-hidden /><span><span className="block font-semibold">{"Pasar a IA"}</span><span className="block text-muted-foreground">{(readOnly ? "Permiso de solo lectura" : !aiEnabled ? "IA no habilitada" : !humanInControl ? "Primero tomá el control" : "") || (busy !== null ? "Esperá a que termine la acción actual" : ("Confirmar el motivo para reanudar la atención"))}</span></span>
                  </button>
                  <button type="button" disabled={busy !== null || !!(readOnly ? "Permiso de solo lectura" : state !== "TRANSITION_PENDING" ? "No hay una transición pendiente" : "")} className="conversation-action-item"
                    onClick={() => { setShowActionsMenu(false); if (window.confirm("¿Liberar el envío? No se reenviará, pero podría llegar tarde al cliente.")) void run("unknown", () => resolveUnknownSends(selected)); }}>
                    <XCircle className="h-5 w-5 shrink-0" aria-hidden /><span><span className="block font-semibold">{"Liberar envío sin confirmar"}</span><span className="block text-muted-foreground">{(readOnly ? "Permiso de solo lectura" : state !== "TRANSITION_PENDING" ? "No hay una transición pendiente" : "") || (busy !== null ? "Esperá a que termine la acción actual" : ("No se reenvía; podría llegar tarde al cliente"))}</span></span>
                  </button>
                  <button type="button" disabled={busy !== null || !!(readOnly ? "Permiso de solo lectura" : state !== "CLOSED" ? "La conversación está abierta" : "")} className="conversation-action-item"
                    onClick={() => { setShowActionsMenu(false); void run("reopen", () => reopenConversation(selected, epoch), "Conversación reabierta."); }}>
                    <RefreshCw className="h-5 w-5 shrink-0" aria-hidden /><span><span className="block font-semibold">{"Reabrir conversación"}</span><span className="block text-muted-foreground">{(readOnly ? "Permiso de solo lectura" : state !== "CLOSED" ? "La conversación está abierta" : "") || (busy !== null ? "Esperá a que termine la acción actual" : ("Habilitar nuevamente la atención"))}</span></span>
                  </button>
                  <button type="button" disabled={busy !== null || !!(readOnly ? "Permiso de solo lectura" : !humanInControl ? "Primero tomá el control" : "")} className="conversation-action-item"
                    onClick={() => { setShowActionsMenu(false); if (window.confirm("¿Cerrar esta conversación?")) void run("close", () => closeConversation(selected), "Conversación cerrada."); }}>
                    <CheckCircle2 className="h-5 w-5 shrink-0" aria-hidden /><span><span className="block font-semibold">{"Cerrar conversación"}</span><span className="block text-muted-foreground">{(readOnly ? "Permiso de solo lectura" : !humanInControl ? "Primero tomá el control" : "") || (busy !== null ? "Esperá a que termine la acción actual" : ("Marcar la atención como finalizada"))}</span></span>
                  </button>
                </DialogContent>
              </Dialog>

              {/* Formulario / Diálogo Inline para Reanudar IA */}
              {!readOnly && showResume && (
                <div role="dialog" aria-labelledby="resume-title"
                  className="absolute bottom-18 left-3 right-3 z-30 rounded-2xl border border-border bg-card p-3 shadow-xl">
                  <div className="mb-2 flex items-center justify-between">
                    <span id="resume-title" className="flex items-center gap-1.5 text-xs font-bold text-foreground">
                      <Bot className="h-4 w-4 text-violet-600 dark:text-violet-400" aria-hidden /> Reanudar Asistente IA
                    </span>
                    <button type="button" onClick={() => setShowResume(false)} aria-label="Cancelar" title="Cancelar"
                      className="inline-flex h-7 w-7 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground">
                      <X className="h-4 w-4" aria-hidden />
                    </button>
                  </div>
                  <form onSubmit={(event) => {
                    event.preventDefault();
                    if (resumeReason.trim().length < 3) return;
                    void run("resume", async () => {
                      await resumeAi(selected, resumeReason.trim());
                      setResumeReason("");
                      setShowResume(false);
                    }, "La IA retomó la conversación.");
                  }} className="flex flex-wrap items-center gap-2">
                    <label htmlFor="resume-reason" className="sr-only">Motivo</label>
                    <input id="resume-reason" value={resumeReason} onChange={(event) => setResumeReason(event.target.value)} maxLength={500}
                      placeholder="Motivo: ej. Consulta respondida, continúa seguimiento..."
                      className="min-h-10 min-w-52 flex-1 rounded-lg border border-border bg-background px-3 text-xs" autoFocus />
                    <button type="submit" disabled={busy !== null || resumeReason.trim().length < 3}
                      className="inline-flex min-h-10 items-center gap-1.5 rounded-lg bg-blue-600 px-3 text-xs font-semibold text-white hover:bg-blue-700 disabled:opacity-50">
                      <Bot className="h-4 w-4" aria-hidden /> Confirmar
                    </button>
                  </form>
                </div>
              )}
            </>
          )}
        </div>
        <aside id="conversation-client" tabIndex={-1} className={`conversation-client ${showClient ? "conversation-client-open" : ""}`} aria-label="Panel del cliente">
          <button ref={clientBack} type="button" className="conversation-secondary conversation-client-toggle" onClick={() => { setShowClient(false); window.setTimeout(() => actionsButton.current?.focus(), 0); }}><ArrowLeft className="h-5 w-5" aria-hidden /> Atrás al chat</button>
          {selected ? <>
            <VisitRequestsBoard key={selected} conversationId={selected} channelLabel={current ? (CHANNEL_LABELS[current.channel] ?? current.channel) : "Sin informar"} />
          </> : <div className="conversation-client-empty"><h2>Datos del cliente</h2><p>Elegí una conversación para ver su información y las visitas solicitadas.</p></div>}
        </aside>
      </div>
    </section>
  );
}

/** Photo inline (opens full size) or a PDF card; files come from authorized endpoints with the session cookie. */
function MediaPreview({ media }: { media: MessageMedia }) {
  if (media.kind === "IMAGE") {
    return (
      <a href={media.url} target="_blank" rel="noopener noreferrer" className="mb-1 block overflow-hidden rounded-md" aria-label={`Ver foto ${media.name}`}>
        {/* eslint-disable-next-line @next/next/no-img-element -- authorized API file, not a static asset */}
        <img src={media.url} alt={media.name} loading="lazy" className="max-h-72 w-full max-w-72 object-cover" />
      </a>
    );
  }
  return (
    <a href={media.url} target="_blank" rel="noopener noreferrer" className="mb-1 flex min-h-12 items-center gap-2 rounded-md bg-black/5 px-3 py-2 hover:bg-black/10 dark:bg-white/10">
      <FileText className="h-6 w-6 shrink-0" aria-hidden />
      <span className="min-w-0">
        <span className="block truncate text-sm font-semibold">{media.name}</span>
        <span className="block text-[11px] opacity-75">PDF · {fileSize(media.size)}</span>
      </span>
    </a>
  );
}
