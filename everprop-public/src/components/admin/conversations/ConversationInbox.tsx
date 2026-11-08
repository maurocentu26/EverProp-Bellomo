"use client";

import { Fragment, useCallback, useEffect, useRef, useState } from "react";
import { ArrowDown, ArrowLeft, Bot, ChevronDown, ChevronUp, FileText, Paperclip, Sparkles, UserPlus, Check, CheckCheck, CheckCircle2, CircleAlert, Clock, Hand, MessageSquare, MessageSquareText, MoreVertical, PanelRight, Plus, RefreshCw, Search, Send, StickyNote, TriangleAlert, X, XCircle } from "lucide-react";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Dialog as SheetPrimitive } from "@base-ui/react/dialog";
import { Sheet, SheetClose, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { PanelTextSizeControl, usePanelTextSize } from "@/components/theme/PanelTextSize";
import { ThemeToggle } from "@/components/theme/ThemeToggle";
import { useCurrentSession } from "@/hooks/use-current-session";
import { AssistantTrace } from "./AssistantTrace";
import {
  CHANNEL_LABELS,
  MESSAGE_PAGE,
  STATE_LABELS,
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
  messageDescription,
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

import { LeadWhatsappStart } from "@/components/admin/conversations/LeadWhatsappStart";
import { CONVERSATION_TABS, conversationLeadFromHash, conversationTab, conversationReason, conversationSearchFromHash, visibleConversations, type ConversationTab } from "@/lib/conversation-presentation";
import { VisitRequestsBoard } from "@/components/admin/assistant/VisitRequestsBoard";

const FILTERS: [ConversationFilter, string][] = [
  ["all", "Todas"],
  ["waiting", "Esperan asesor"],
  ["unread", "No leídas"],
  ["mine", "Mías"],
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
/** Wide enough for list, chat and client side by side (with the regular text size). */
const DOCKED_CLIENT = "(min-width: 1280px)";

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
    const fit = () => {
      const height = viewport?.height ?? window.innerHeight;
      root.style.setProperty("--wa-chat-height", `${height}px`);
      root.style.setProperty("--wa-chat-top", `${viewport?.offsetTop ?? 0}px`);
      root.classList.toggle("wa-keyboard", window.innerHeight - height > 120);
    };
    fit();
    root.classList.add("wa-chat-open");
    viewport?.addEventListener("resize", fit);
    viewport?.addEventListener("scroll", fit);
    window.history.pushState({ waChat: true }, "");
    const onPop = () => back.current();
    window.addEventListener("popstate", onPop);
    return () => {
      viewport?.removeEventListener("resize", fit);
      viewport?.removeEventListener("scroll", fit);
      window.removeEventListener("popstate", onPop);
      root.classList.remove("wa-chat-open", "wa-keyboard");
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
  const isAdmin = user?.apiRole === "TENANT_ADMIN";
  const [filter, setFilter] = useState<ConversationFilter>("all");
  const [tab, setTab] = useState<ConversationTab>("human");
  const [showClient, setShowClient] = useState(false);
  // What the user types, and the term actually sent once they pause typing.
  const [query, setQuery] = useState("");
  const [search, setSearch] = useState("");
  const [searchReady, setSearchReady] = useState(false);
  // EVP-91: lead from «Mensajes», to open its WhatsApp thread or start one.
  const [linkedLead, setLinkedLead] = useState<string | null>(null);
  useEffect(() => {
    const readSearch = () => {
      const term = conversationSearchFromHash(window.location.hash);
      setQuery(term);
      setSearch(term);
      setLinkedLead(conversationLeadFromHash(window.location.hash));
      setSearchReady(true);
    };
    readSearch();
    window.addEventListener("hashchange", readSearch);
    return () => window.removeEventListener("hashchange", readSearch);
  }, []);
  useEffect(() => {
    const timer = window.setTimeout(() => setSearch(query.trim().length >= MIN_SEARCH ? query.trim() : ""), 300);
    return () => window.clearTimeout(timer);
  }, [query]);
  const [items, setItems] = useState<ConversationSummary[]>([]);
  const [listKey, setListKey] = useState<string | null>(null);
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
  const [replyWindow, setReplyWindow] = useState<{ closes_at: string | null } | null>(null);
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
  const [showTrace, setShowTrace] = useState(false);
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
  const threadHeading = useRef<HTMLHeadingElement>(null);
  const thread = useRef<HTMLOListElement>(null);
  const atBottom = useRef(true);
  const [unseen, setUnseen] = useState(0);
  const [showQuick, setShowQuick] = useState(false);
  const { replies, load: loadReplies, save: saveReplies } = useQuickReplies(user?.id);
  // EVP-67: phone tools row, and the client panel docked beside the chat only where it fits.
  const [showTools, setShowTools] = useState(false);
  const [wide, setWide] = useState(false);
  useEffect(() => {
    const media = window.matchMedia(DOCKED_CLIENT);
    const sync = () => setWide(media.matches);
    sync();
    media.addEventListener("change", sync);
    return () => media.removeEventListener("change", sync);
  }, []);
  const textSize = usePanelTextSize();

  const refreshList = useCallback(async () => {
    if (!user || !searchReady) return;
    const request = ++listRequest.current;
    setListError("");
    try {
      const response = await listConversations(filter, search);
      if (request !== listRequest.current) return; // a newer filter/refresh already answered
      setItems(response.data);
      setListKey(`${filter}:${search}`);
      setListError("");
      setRefreshedAt(new Date().toISOString());
    } catch {
      if (request !== listRequest.current) return;
      setItems([]);
      setListKey(`${filter}:${search}`);
      setListError("No pudimos actualizar la bandeja. Reintentamos en unos segundos.");
    }
  }, [filter, search, user, searchReady]);

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
      setReplyWindow(response.conversation.reply_window ?? null);
      setHandoff(response.conversation.handoff ?? null);
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

  useEffect(() => {
    if (!showActionsMenu && !showResume) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        if (showResume) setShowResume(false);
        else setShowActionsMenu(false);
        window.setTimeout(() => document.getElementById("conversation-actions-trigger")?.focus(), 0);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [showActionsMenu, showResume]);

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

  function focusComposer() {
    window.setTimeout(() => document.getElementById("reply")?.focus(), 0);
  }

  function insertQuickReply(text: string) {
    setDraft((current) => (current.startsWith("/") || !current.trim() ? text : `${current.trimEnd()} ${text}`));
    setShowQuick(false);
    window.setTimeout(() => document.getElementById("reply")?.focus(), 0);
  }

  const current = items.find((item) => item.id === selected) ?? (openedSummary?.id === selected ? openedSummary : undefined);
  const humanInControl = state === "HUMAN_ACTIVE";
  // A reply queued just before the window closed still shows up in the thread through polling.
  const windowClosed = replyWindow !== null && replyWindow.closes_at === null;

  const resultsReady = searchReady && listKey === `${filter}:${search}` && (query.trim().length >= MIN_SEARCH ? query.trim() : "") === search;
  const visibleItems = resultsReady ? visibleConversations(items, tab, search) : [];

  const docked = wide && textSize !== "grande";
  // "/" at the start of the reply searches the saved quick replies, like a command palette.
  const slashQuery = !noteMode && draft.startsWith("/") ? draft.slice(1).trim().toLowerCase() : null;
  const quickMatches = slashQuery === null ? replies : replies.filter((reply) => reply.toLowerCase().includes(slashQuery));
  const quickOpen = !noteMode && (showQuick || slashQuery !== null);
  const pendingForYou = items.filter((item) => conversationTab(item.state) === "human" && item.unread > 0).length;
  const contactFirst = current ? displayName(current).split(" ")[0] : "el cliente";
  const canAttach = current?.channel === "WEB_CHAT" || current?.channel === "WHATSAPP";
  const toggleClient = () => setShowClient((open) => !open);

  const actionsTrigger = !readOnly && (
    <button id="conversation-actions-trigger" type="button" aria-haspopup="menu" aria-controls="conversation-actions-menu" aria-expanded={showActionsMenu} aria-label="Acciones de la conversación" title="Opciones y acciones"
      onKeyDown={(event) => {
        if (event.key === "ArrowDown" || event.key === "ArrowUp") {
          event.preventDefault();
          setShowActionsMenu(true);
          window.setTimeout(() => {
            const items = Array.from(document.querySelectorAll<HTMLElement>("#conversation-actions-menu [role=menuitem]:not(:disabled)"));
            (event.key === "ArrowUp" ? items[items.length - 1] : items[0])?.focus();
          }, 0);
        } else if (event.key === "Escape" && showActionsMenu) {
          event.preventDefault();
          setShowActionsMenu(false);
        }
      }}
      onClick={() => setShowActionsMenu((open) => !open)}
      className={`conversation-icon-button ${showActionsMenu ? "is-on" : ""}`}>
      {showActionsMenu ? <X className="h-5 w-5" aria-hidden /> : <MoreVertical className="h-5 w-5" aria-hidden />}<span className="sr-only">Más</span>
    </button>
  );

  const clientPanel = selected ? <>
    <VisitRequestsBoard key={selected} conversationId={selected} channelLabel={current ? (CHANNEL_LABELS[current.channel] ?? current.channel) : "Sin informar"} />
    {!readOnly && <button type="button" disabled={busy !== null} className="conversation-secondary w-full" onClick={() => void run("lead", async () => {
      const { data } = await openConversationLead(selected);
      router.push(`/admin/leads/${data.lead_id}`);
    })}>Abrir ficha del cliente</button>}
  </> : <div className="conversation-client-empty"><h2>Datos del cliente</h2><p>Elegí una conversación para ver su información y las visitas solicitadas.</p></div>;

  return (
    <Sheet open={showClient && !docked} onOpenChange={setShowClient}>
    <section className={`wa-inbox conversation-workspace-inbox ${selected ? "has-selection" : ""}`}>
      {/* Desktop: the module owns the screen; this rail is the way out and the reading preferences. */}
      <nav className="conversation-rail" aria-label="Panel de EverProp">
        <Link href="/admin" className="conversation-rail-item"><ArrowLeft className="h-5 w-5" aria-hidden /><span>Panel</span></Link>
        <span className="conversation-rail-item is-current" aria-current="page">
          <MessageSquare className="h-5 w-5" aria-hidden /><span>Chats</span>
          {pendingForYou > 0 && <span className="conversation-rail-badge"><span className="sr-only">Para vos sin leer: </span>{pendingForYou}</span>}
        </span>
        <span className="conversation-rail-spacer" />
        <PanelTextSizeControl />
        <ThemeToggle />
      </nav>

      <div className={`conversation-columns ${docked && showClient && selected ? "has-client" : ""}`}>
        <aside className={`${selected ? "hidden md:flex" : "flex"} conversation-list min-w-0 flex-col`} aria-label="Listado de conversaciones">
          <header className="conversation-workspace-heading">
            <Link href="/admin" className="conversation-icon-button md:hidden" aria-label="Volver al panel"><ArrowLeft className="h-5 w-5" aria-hidden /></Link>
            <h1>Conversaciones</h1>
            <span className="md:hidden"><PanelTextSizeControl /></span>
            <button type="button" disabled={refreshing} onClick={() => void refreshNow()} aria-describedby="inbox-refresh-status" aria-label="Actualizar ahora" title="Actualizar ahora" className="conversation-icon-button">
              <RefreshCw className={`h-5 w-5 ${refreshing ? "animate-spin motion-reduce:animate-none" : ""}`} aria-hidden />
            </button>
          </header>
          <div role="search" className="conversation-search">
            <label htmlFor="inbox-search" className="sr-only">Buscar conversaciones por nombre, teléfono, email o texto</label>
            <Search className="h-5 w-5" aria-hidden />
            <input id="inbox-search" type="search" value={query} onChange={(event) => setQuery(event.target.value)} maxLength={100}
              placeholder="Buscar conversación" enterKeyHint="search" />
          </div>
          {linkedLead && <div className="px-3 pb-2"><LeadWhatsappStart leadId={linkedLead} readOnly={readOnly} onOpen={(id) => {
            setLinkedLead(null);
            setFilter("all");
            open(id);
          }} /></div>}
          {search ? <p role="status" className="conversation-search-note">Resultados en todas las bandejas. Elegí la conversación del cliente para ver sus mensajes.</p> : <>
            <div role="group" aria-label="Bandejas de conversaciones" title="Cantidades del filtro actual" className="conversation-tabs">
              {CONVERSATION_TABS.map(([id, label]) => (
                <button key={id} type="button" aria-pressed={tab === id} onClick={() => setTab(id)}>
                  {label} <span className={id === "human" && pendingForYou > 0 ? "is-hot" : ""}>{items.filter(item => conversationTab(item.state) === id).length}</span>
                </button>
              ))}
            </div>
            <div role="group" aria-label="Filtrar conversaciones" className="conversation-chips">
              {FILTERS.map(([id, label]) => <button key={id} type="button" aria-pressed={filter === id} onClick={() => setFilter(id)}>{label}</button>)}
            </div>
          </>}
          {listError && <p role="alert" className="m-3 rounded-lg bg-red-50 p-3 text-red-800 dark:bg-red-500/10 dark:text-red-200">{listError} <button type="button" disabled={refreshing} onClick={() => void refreshNow()} className="conversation-secondary mt-2">{refreshing ? "Reintentando…" : "Reintentar"}</button></p>}
          <ul role="list" className="conversation-rows">
            {!resultsReady && !listError && <li role="status" className="p-6 text-center text-muted-foreground">Buscando conversaciones…</li>}
            {resultsReady && visibleItems.length === 0 && !listError && (
              <li className="p-6 text-center text-muted-foreground">
                {search ? `Nada coincide con “${search}” en este filtro.` : "No hay conversaciones en este filtro."}
              </li>
            )}
            {visibleItems.map((item) => {
              const preview = previewText(item);
              const waiting = item.state === "WAITING_HUMAN" || item.state === "TRANSITION_PENDING";
              // Only what asks for action earns a third line: a wait, an off-hours arrival, or someone else attending.
              const flag = waiting
                ? (item.out_of_hours && item.waiting_since ? `Fuera de horario · ${sameDay(item.waiting_since, new Date().toISOString()) ? clockTime(item.waiting_since) : `${dayLabel(item.waiting_since)} ${clockTime(item.waiting_since)}`}` : conversationReason(item))
                : item.state === "HUMAN_ACTIVE" && item.assigned_user && item.assigned_user.id !== user?.id ? `Atiende ${item.assigned_user.name}` : "";
              return (
                <li key={item.id}>
                  <button id={`conversation-${item.id}`} type="button" onClick={() => open(item.id)} aria-current={selected === item.id ? "true" : undefined}
                    className={`conversation-row ${selected === item.id ? "wa-selected" : ""}`}>
                    <span aria-hidden className="conversation-avatar wa-accent">
                      {initials(displayName(item))}
                      <span className={`conversation-channel-dot is-${String(item.channel).toLowerCase()}`} />
                    </span>
                    <span className="conversation-row-body">
                      <span className="conversation-row-line">
                        <span className={`conversation-contact-name ${item.unread > 0 ? "is-unread" : ""}`}>{displayName(item)}</span>
                        <span className="sr-only">, {CHANNEL_LABELS[item.channel] ?? item.channel}</span>
                        <time dateTime={item.last_activity_at} className={`conversation-timestamp ${item.unread > 0 ? "is-unread" : ""}`}>
                          {sameDay(item.last_activity_at, new Date().toISOString()) ? clockTime(item.last_activity_at) : dayLabel(item.last_activity_at, new Date(), "short")}
                        </time>
                      </span>
                      <span className="conversation-row-line">
                        <span className={`conversation-preview ${item.unread > 0 ? "is-unread" : ""}`}>{preview || "Sin mensajes"}</span>
                        {item.unread > 0 && <span className="conversation-unread wa-accent"><span className="sr-only">sin leer: </span>{item.unread}</span>}
                      </span>
                      {flag && <span className={`conversation-contact-meta conversation-flag ${waiting ? (item.out_of_hours ? "is-info" : "is-warn") : ""}`}>{flag}</span>}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
          {/* Screen readers only: the list refreshes itself without a visible footer. */}
          <p id="inbox-refresh-status" role="status" className="sr-only">
            {refreshedAt ? `Se actualiza solo · ${clockTime(refreshedAt)}` : "Se actualiza solo cada pocos segundos"}
          </p>
        </aside>

        <div className={`conversation-chat ${selected ? "wa-fullscreen flex" : "hidden md:flex"} relative min-w-0 flex-col overflow-hidden`}>
          {!selected ? (
            <div className="m-auto flex max-w-sm flex-col items-center gap-3 p-8 text-center text-muted-foreground">
              <MessageSquare className="h-8 w-8" aria-hidden />
              <p>Elegí una conversación para ver los mensajes y tomar el control.</p>
            </div>
          ) : (
            <>
              <div className="conversation-header wa-bar">
                <button type="button" onClick={backToList} aria-label="Volver a la bandeja" className="conversation-icon-button md:hidden">
                  <ArrowLeft className="h-5 w-5" aria-hidden />
                </button>
                <div className="conversation-who">
                  <span aria-hidden className="conversation-avatar is-small wa-accent">{initials(current ? displayName(current) : "?")}</span>
                  <span className="conversation-who-text">
                    <h2 ref={threadHeading} tabIndex={-1} className="conversation-who-name outline-none">
                      <button type="button" onClick={toggleClient} aria-expanded={showClient} aria-controls="conversation-client" title="Ver datos del cliente">{current ? displayName(current) : "Conversación"}</button>
                    </h2>
                    <span className="conversation-who-sub">
                      <span className="md:hidden">{state ? (humanInControl ? "Ahora atendés vos" : STATE_LABELS[state]) : ""}{state && current ? " · " : ""}</span>
                      {current ? (CHANNEL_LABELS[current.channel] ?? current.channel) : ""}
                      <span className="hidden md:inline">{replyWindow?.closes_at ? ` · podés responder hasta ${dayLabel(replyWindow.closes_at).toLowerCase()} ${clockTime(replyWindow.closes_at)}` : ""}</span>
                    </span>
                  </span>
                </div>
                {state && <span className={`conversation-state-badge hidden md:inline-flex ${STATE_STYLES[state]}`}>{humanInControl ? "Ahora atendés vos" : STATE_LABELS[state]}</span>}
                {!readOnly && humanInControl && aiEnabled && <button type="button" disabled={busy !== null} onClick={() => setShowResume(true)} title="Devolver a la IA" className="conversation-head-action hidden md:inline-flex"><Bot className="h-5 w-5" aria-hidden /><span className="conversation-head-label">Devolver a la IA</span></button>}
                {!readOnly && humanInControl && <button type="button" disabled={busy !== null} onClick={() => void run("close", () => closeConversation(selected), "Conversación cerrada.")} title="Finalizar conversación" className="conversation-head-action hidden md:inline-flex"><CheckCircle2 className="h-5 w-5" aria-hidden /><span className="conversation-head-label">Finalizar</span></button>}
                <button type="button" id="conversation-client-toggle" aria-pressed={showClient} aria-label="Ver cliente" title="Datos del cliente" onClick={toggleClient}
                  className={`conversation-head-action conversation-client-toggle hidden md:inline-flex ${showClient ? "is-on" : ""}`}><PanelRight className="h-5 w-5" aria-hidden /><span className="conversation-head-label">Cliente</span></button>
                {actionsTrigger}
              </div>

              {handoff && !handoffDismissed && (state === "WAITING_HUMAN" || state === "HUMAN_ACTIVE") && (
                // Model-written: plain text only (React escapes it), for the team, never sent to the visitor.
                <section aria-label="Resumen del asistente" className={`conversation-handoff ${handoffExpanded ? "conversation-handoff-expanded" : ""}`}>
                  <div className="conversation-handoff-row">
                    <Bot className="conversation-handoff-icon h-5 w-5" aria-hidden />
                    <div className="conversation-handoff-main">
                      <p className="conversation-handoff-title"><strong>Te la pasó la IA</strong> · {HANDOFF_REASONS[handoff.reason] ?? "Derivación"} · {dayLabel(handoff.at)} {clockTime(handoff.at)}</p>
                      {handoff.summary && (
                        <button type="button" onClick={() => setHandoffExpanded((open) => !open)} aria-expanded={handoffExpanded} className="conversation-link">
                          {handoffExpanded ? <><ChevronUp className="h-4 w-4" aria-hidden /> Ocultar resumen</> : <><ChevronDown className="h-4 w-4" aria-hidden /> Ver resumen</>}
                        </button>
                      )}
                    </div>
                    <button type="button" onClick={() => setHandoffDismissed(true)} aria-label="Cerrar resumen del asistente" title="Cerrar resumen" className="conversation-icon-button">
                      <X className="h-5 w-5" aria-hidden />
                    </button>
                  </div>
                  {handoff.summary && handoffExpanded && <p className="conversation-handoff-summary whitespace-pre-wrap break-words">{handoff.summary}</p>}
                </section>
              )}

              {state === "TRANSITION_PENDING" && (
                <div role="status" className="m-3 rounded-xl border border-sky-200 bg-sky-50 p-3 text-sky-900 dark:border-sky-500/30 dark:bg-sky-500/10 dark:text-sky-100">
                  <p className="font-semibold">Hay un mensaje de la IA en envío.</p>
                  <p className="mt-1">Vas a poder responder cuando se confirme. Si el envío quedó sin confirmar, podés liberarlo: no se reenvía, pero podría llegarle tarde al cliente.</p>
                  {!readOnly && (
                    <button type="button" disabled={busy !== null} onClick={() => void run("unknown", async () => {
                      const result = await resolveUnknownSends(selected);
                      if (result.data.resolved === 0) toast.info("No había envíos sin confirmar; esperá unos segundos.");
                    })} className="conversation-secondary mt-2">
                      <XCircle className="h-4 w-4" aria-hidden /> Liberar envío sin confirmar
                    </button>
                  )}
                </div>
              )}
              {threadError && <p role="alert" className="m-3 rounded-lg bg-red-50 p-3 text-red-800 dark:bg-red-500/10 dark:text-red-200">{threadError}</p>}

              <ol ref={thread} onScroll={onThreadScroll} aria-label="Mensajes" aria-live="polite" className="wa-thread">
                {messages.map((message, index) => {
                  const previous = messages[index - 1];
                  const newDay = !previous || !sameDay(previous.at, message.at);
                  // Like WhatsApp: consecutive messages from the same side stack tightly; only the first gets the tail.
                  const first = newDay || previous.direction !== message.direction || previous.sender !== message.sender;
                  const separator = newDay && (
                    <li className="conversation-day">
                      <span className="wa-chip first-letter:uppercase">{dayLabel(message.at)}</span>
                    </li>
                  );
                  if (message.direction === "INTERNAL") {
                    return (
                      <Fragment key={message.sequence}>
                        {separator}
                        <li className="conversation-note-row">
                          <div className="conversation-note">
                            <p className="conversation-sender">
                              <StickyNote className="h-4 w-4" aria-hidden />
                              <span>Nota interna{message.author ? ` de ${message.author}` : ""} · solo la ve el equipo</span>
                            </p>
                            <p className="whitespace-pre-wrap break-words">{message.text}</p>
                            <p className="wa-meta"><time dateTime={message.at}>{clockTime(message.at)}</time></p>
                          </div>
                        </li>
                      </Fragment>
                    );
                  }
                  const mine = message.direction === "OUTBOUND";
                  const who = message.sender === "BOT" ? "IA" : message.sender === "USER" ? "Asesor" : message.sender === "SYSTEM" ? "Sistema" : "Cliente";
                  // The AI always says it is the AI; the advisor only on the first bubble; the client side needs no label.
                  const showWho = message.sender === "BOT" || (mine && first);
                  return (
                    <Fragment key={message.sequence}>
                      {separator}
                      <li className={`conversation-bubble-row ${mine ? "is-mine" : ""} ${first ? "is-first" : ""}`}>
                        <div className={`wa-bubble ${message.sender === "BOT" ? "conversation-ai" : mine ? "wa-out" : "wa-in"} ${first ? "has-tail" : ""} ${message.status === "CANCELLED" ? "opacity-60" : ""}`}>
                          <p className={`conversation-sender ${showWho ? "" : "sr-only"}`}>{message.sender === "BOT" && <Bot className="h-4 w-4" aria-hidden />}{who}</p>
                          {message.media && <MediaPreview media={message.media} />}
                          {(message.text || !message.media) && (
                            <p className={`whitespace-pre-wrap break-words ${message.status === "CANCELLED" ? "line-through" : ""}`}>{messageDescription(message)}</p>
                          )}
                          <p className="wa-meta">
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
                <button type="button" onClick={jumpToLatest} className="conversation-jump wa-accent">
                  <ArrowDown className="h-4 w-4" aria-hidden /> {unseen === 1 ? "1 mensaje nuevo" : `${unseen} mensajes nuevos`}
                </button>
              )}

              {!readOnly && (
                <div className="conversation-zone">
                  {quickOpen && (humanInControl || noteMode) && (
                    <div className="conversation-quick" role="group" aria-label="Respuestas rápidas">
                      <p className="conversation-quick-head">Respuestas rápidas <span>Escribí / para buscarlas</span></p>
                      <ul>
                        {quickMatches.map((reply) => (
                          <li key={reply}>
                            <button type="button" onClick={() => insertQuickReply(reply)} className="conversation-quick-item">{reply}</button>
                            <button type="button" aria-label={`Borrar respuesta rápida: ${reply}`} onClick={() => saveReplies(replies.filter((r) => r !== reply))} className="conversation-icon-button">
                              <X className="h-4 w-4" aria-hidden />
                            </button>
                          </li>
                        ))}
                      </ul>
                      {quickMatches.length === 0 && <p className="px-3 py-2 text-muted-foreground">Ninguna respuesta coincide.</p>}
                      {slashQuery === null && (
                        <button type="button" disabled={draft.trim().length < 3 || replies.includes(draft.trim())}
                          onClick={() => { saveReplies([...replies, draft.trim()]); toast.success("Respuesta rápida guardada."); }}
                          className="conversation-link">
                          <Plus className="h-4 w-4" aria-hidden /> Guardar lo que escribí como respuesta rápida
                        </button>
                      )}
                    </div>
                  )}
                  {/* The open window is shown in the header; here only the blocking case. */}
                  <p role="status" className={windowClosed && humanInControl && !noteMode ? "conversation-window-note" : "sr-only"}>
                    {windowClosed && humanInControl ? "Pasaron más de 24 horas desde el último mensaje del cliente. Solo podés escribirle con una plantilla aprobada." : ""}
                  </p>
                  {windowClosed && humanInControl && !noteMode && (
                    <div className="conversation-window">
                      {templates === null ? (
                        <div className="conversation-zone-row">
                          <button type="button" disabled={busy !== null} onClick={() => void openTemplates()} className="conversation-primary">
                            <MessageSquareText className="h-5 w-5" aria-hidden /> {busy === "templates" ? "Buscando plantillas…" : "Escribir con plantilla"}
                          </button>
                          <button type="button" onClick={() => { setNoteMode(true); focusComposer(); }} className="conversation-secondary"><StickyNote className="h-5 w-5" aria-hidden /> Nota interna</button>
                        </div>
                      ) : templates.length === 0 ? (
                        <p>No hay plantillas aprobadas para este número. Se crean en WhatsApp Manager y Meta las revisa.</p>
                      ) : !template ? (
                        <ul className="conversation-templates" aria-label="Plantillas aprobadas">
                          {templates.map((t) => (
                            <li key={`${t.name}-${t.language}`}>
                              <button type="button" onClick={() => { setTemplate(t); setTemplateParams(Array.from({ length: t.params }, () => "")); }} className="conversation-template">
                                <span className="font-semibold">{t.name.replaceAll("_", " ")}</span>
                                <span className="conversation-template-body">{t.body}</span>
                              </button>
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <form onSubmit={(event) => { event.preventDefault(); void sendPickedTemplate(); }} className="space-y-2">
                          <p className="conversation-template" aria-live="polite">{renderTemplate(template.body, templateParams)}</p>
                          {templateParams.map((value, index) => (
                            <label key={index} className="flex flex-col gap-1 font-semibold">Dato {`{{${index + 1}}}`}
                              <input value={value} maxLength={200} required onChange={(event) => setTemplateParams((all) => all.map((v, i) => (i === index ? event.target.value : v)))}
                                className="wa-input min-h-11 rounded-lg px-3 font-normal" />
                            </label>
                          ))}
                          <div className="conversation-zone-row">
                            <button type="button" onClick={() => setTemplate(null)} className="conversation-secondary">Otra plantilla</button>
                            <button type="submit" disabled={busy !== null || templateParams.some((p) => p.trim() === "")} className="conversation-primary">Enviar plantilla</button>
                          </div>
                        </form>
                      )}
                    </div>
                  )}
                  {!noteMode && suggestion && (
                    <section className="conversation-suggestion" aria-label="Sugerencia del copiloto">
                      <h3><Sparkles className="h-5 w-5" aria-hidden /> Sugerencia de la IA · revisala antes de enviar</h3>
                      <p className="whitespace-pre-wrap break-words">{suggestion.text}</p>
                      <div className="conversation-zone-row">
                        <button type="button" disabled={busy !== null} className="conversation-primary" onClick={() => { setDraft(suggestion.text); setSuggestion({ ...suggestion, applied: true }); focusComposer(); }}>Usar esta respuesta</button>
                        <button type="button" disabled={busy !== null} className="conversation-secondary" onClick={() => { setSuggestion(null); focusComposer(); }}>Escribir otra</button>
                      </div>
                    </section>
                  )}
                  {!humanInControl && !noteMode ? (
                    // Not in control: where the composer goes, the one action that makes it appear.
                    <div className="conversation-takeover">
                      {state && state !== "CLOSED" && (
                        <p className="conversation-takeover-text"><Clock className="h-5 w-5" aria-hidden />
                          <span>{state === "WAITING_HUMAN" ? `${contactFirst} espera un asesor. Al tomar el control, la IA deja de responder.` : "La IA está atendiendo. Si tomás el control, deja de responder hasta que se la devuelvas."}</span>
                        </p>
                      )}
                      <div className="conversation-zone-row">
                        <button type="button" aria-label="Escribir una nota interna" onClick={() => { setNoteMode(true); focusComposer(); }} className="conversation-secondary conversation-note-button">
                          <StickyNote className="h-5 w-5" aria-hidden /> <span>Nota interna</span>
                        </button>
                        {state && state !== "CLOSED" ? (
                          <button type="button" disabled={busy !== null || state === "TRANSITION_PENDING"} onClick={() => void run("takeover", async () => {
                            await takeOver(selected);
                            window.setTimeout(focusComposer, 300);
                          }, "Tomaste el control. La IA dejó de responder.")} className="conversation-primary is-grow">
                            <Hand className="h-5 w-5" aria-hidden /> <span>Tomar control<span className="hidden md:inline"> y responder</span></span>
                          </button>
                        ) : (
                          <p className="flex-1 text-center text-muted-foreground">{state === "CLOSED" ? "Conversación cerrada." : "Cargando…"}</p>
                        )}
                      </div>
                    </div>
                  ) : (
                    <>
                    <div className="conversation-mode" role="group" aria-label="Tipo de mensaje">
                      <button type="button" aria-pressed={!noteMode} disabled={!humanInControl} onClick={() => { setNoteMode(false); focusComposer(); }}>Responder a {contactFirst}</button>
                      <button type="button" aria-pressed={noteMode} className="is-note" onClick={() => { setNoteMode(true); setShowQuick(false); focusComposer(); }}><StickyNote className="h-4 w-4" aria-hidden /> Nota interna</button>
                      {!noteMode && <span className="conversation-hint"><kbd>Enter</kbd> envía · <kbd>Shift</kbd>+<kbd>Enter</kbd> salto · <kbd>/</kbd> rápidas</span>}
                    </div>
                    {noteMode && <p className="conversation-notebar md:hidden"><span>Nota interna · solo la ve el equipo</span>
                      <button type="button" className="conversation-link" onClick={() => { setNoteMode(false); focusComposer(); }}>{humanInControl ? "Responder" : "Cancelar"}</button></p>}
                    <form onSubmit={(event) => { event.preventDefault(); void (noteMode ? saveNote() : sendDraft()); }} className={`conversation-composer wa-bar ${noteMode ? "is-note" : ""} ${showTools ? "tools-open" : ""}`}>
                      {!noteMode && (
                        <button type="button" aria-expanded={showTools} aria-label="Más herramientas para responder" onClick={() => setShowTools((open) => !open)} className="conversation-icon-button conversation-tools-toggle md:hidden">
                          {showTools ? <X className="h-5 w-5" aria-hidden /> : <Plus className="h-5 w-5" aria-hidden />}
                        </button>
                      )}
                      {!noteMode && (
                        <span className="conversation-tools">
                          {canAttach && (
                            <label className={`conversation-tool ${busy !== null ? "pointer-events-none opacity-50" : ""}`} title="Adjuntar foto o PDF">
                              <Paperclip className={`h-5 w-5 ${busy === "attach" ? "animate-pulse motion-reduce:animate-none" : ""}`} aria-hidden />
                              <span className="conversation-tool-label">{busy === "attach" ? "Enviando…" : "Adjuntar"}</span>
                              <input type="file" accept={ATTACHMENT_TYPES} className="sr-only" disabled={busy !== null}
                                onChange={(event) => { const file = event.target.files?.[0]; event.target.value = ""; setShowTools(false); if (file) void sendFile(file); }} />
                            </label>
                          )}
                          <button type="button" aria-expanded={quickOpen} title="Respuestas rápidas" onClick={() => { if (!showQuick) loadReplies(); setShowQuick(!showQuick); setShowTools(false); }}
                            className={`conversation-tool ${quickOpen ? "is-on" : ""}`}>
                            <MessageSquareText className="h-5 w-5" aria-hidden /> <span className="conversation-tool-label">Rápidas</span>
                          </button>
                          {copilotEnabled && (
                            <button type="button" disabled={busy !== null} onClick={() => { setShowTools(false); void suggestDraft(); }} title="Sugerir respuesta con IA"
                              aria-label={busy === "suggest" ? "Pidiendo una sugerencia a la IA" : "Sugerir respuesta con IA"} className="conversation-tool is-ai">
                              <Sparkles className={`h-5 w-5 ${busy === "suggest" ? "animate-pulse motion-reduce:animate-none" : ""}`} aria-hidden /> <span className="conversation-tool-label">Sugerir</span>
                            </button>
                          )}
                          <button type="button" onClick={() => { setNoteMode(true); setShowTools(false); setShowQuick(false); focusComposer(); }} className="conversation-tool md:hidden">
                            <StickyNote className="h-5 w-5" aria-hidden /> <span className="conversation-tool-label">Nota</span>
                          </button>
                        </span>
                      )}
                      <label htmlFor="reply" className="sr-only">{noteMode ? "Nota interna para el equipo" : "Respuesta al cliente"}</label>
                      <textarea id="reply" value={noteMode ? note : draft} maxLength={4096} rows={1} enterKeyHint="enter"
                        onChange={(event) => { if (noteMode) setNote(event.target.value); else setDraft(event.target.value); }}
                        // The keyboard shrinks the chat: keep the latest message in view, as WhatsApp does.
                        onFocus={() => { setShowTools(false); if (atBottom.current) window.setTimeout(() => thread.current?.scrollTo({ top: thread.current.scrollHeight }), 250); }}
                        // On a phone keyboard Enter is a line break; there the Send button sends.
                        onKeyDown={(event) => {
                          if (event.key === "Escape" && showQuick) { event.preventDefault(); setShowQuick(false); return; }
                          if (event.key === "Enter" && !event.shiftKey && !isTouch()) {
                            event.preventDefault();
                            if (slashQuery !== null) { if (quickMatches[0]) insertQuickReply(quickMatches[0]); return; }
                            void (noteMode ? saveNote() : sendDraft());
                          }
                        }}
                        className={`${noteMode ? "wa-note-mode" : "wa-input"} conversation-input field-sizing-content`}
                        placeholder={noteMode ? "Nota interna: solo la ve el equipo" : `Escribí a ${contactFirst}…`} />
                      <button type="submit" disabled={busy !== null || (noteMode ? note.trim() === "" : draft.trim() === "" || windowClosed)}
                        aria-label={noteMode ? "Guardar nota" : "Enviar respuesta"}
                        className="conversation-send wa-accent">
                        {noteMode ? <StickyNote className="h-5 w-5" aria-hidden /> : <Send className="h-5 w-5" aria-hidden />} <span className="conversation-send-label">{noteMode ? "Guardar" : "Enviar"}</span>
                      </button>
                    </form>
                    </>
                  )}
                </div>
              )}

              {isAdmin && selected && <AssistantTrace conversation={selected} open={showTrace} onOpenChange={setShowTrace} />}
              {!readOnly && showActionsMenu && (
                <div id="conversation-actions-menu" role="menu" aria-label="Acciones disponibles"
                  onKeyDown={(event) => {
                    if (event.key === "Escape") {
                      event.preventDefault();
                      setShowActionsMenu(false);
                      window.setTimeout(() => document.getElementById("conversation-actions-trigger")?.focus(), 0);
                      return;
                    }
                    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
                      event.preventDefault();
                      const items = Array.from(event.currentTarget.querySelectorAll<HTMLElement>("[role=menuitem]:not(:disabled)"));
                      if (!items.length) return;
                      const currentIdx = items.indexOf(document.activeElement as HTMLElement);
                      const nextIdx = event.key === "ArrowDown" ? (currentIdx + 1) % items.length : (currentIdx - 1 + items.length) % items.length;
                      items[nextIdx]?.focus();
                    }
                  }}
                  className="conversation-menu">
                  <p className="conversation-menu-head">Acciones del chat</p>
                  <button type="button" role="menuitem" className="conversation-menu-item md:hidden" onClick={() => { setShowActionsMenu(false); setShowClient(true); }}>
                    <PanelRight className="h-5 w-5" aria-hidden />
                    <span><span className="block">Ver cliente</span><span className="conversation-action-description block">Interés, visitas y ficha</span></span>
                  </button>
                  <button type="button" role="menuitem" disabled={busy !== null}
                    onClick={() => {
                      setShowActionsMenu(false);
                      void run("lead", async () => {
                        const { data } = await openConversationLead(selected);
                        toast.success(data.created ? "Lead creado. Cargá la propiedad y agendá la visita." : "Abriendo el lead del cliente.");
                        router.push(`/admin/leads/${data.lead_id}`);
                      });
                    }}
                    className="conversation-menu-item">
                    <UserPlus className="h-5 w-5" aria-hidden />
                    <span><span className="block">Lead y visita</span><span className="conversation-action-description block">Gestionar o crear lead comercial</span></span>
                  </button>
                  {isAdmin && (
                    <button type="button" role="menuitem"
                      onClick={() => { setShowActionsMenu(false); setShowTrace(true); }}
                      className="conversation-menu-item">
                      <FileText className="h-5 w-5" aria-hidden />
                      <span><span className="block">Traza del asistente</span><span className="conversation-action-description block">Qué consultó y respondió la IA</span></span>
                    </button>
                  )}
                  {humanInControl && aiEnabled && (
                    <button type="button" role="menuitem" disabled={busy !== null}
                      onClick={() => { setShowActionsMenu(false); setShowResume(true); }}
                      className="conversation-menu-item is-ai">
                      <Bot className="h-5 w-5" aria-hidden />
                      <span><span className="block">Pasar a IA</span><span className="conversation-action-description block">Reanudar atención automática</span></span>
                    </button>
                  )}
                  {!humanInControl && state && state !== "CLOSED" && (
                    <button type="button" role="menuitem" disabled={busy !== null || state === "TRANSITION_PENDING"}
                      onClick={() => {
                        setShowActionsMenu(false);
                        void run("takeover", async () => {
                          await takeOver(selected);
                          window.setTimeout(focusComposer, 300);
                        }, "Tomaste el control. La IA dejó de responder.");
                      }}
                      className="conversation-menu-item">
                      <Hand className="h-5 w-5" aria-hidden />
                      <span><span className="block">Tomar control</span><span className="conversation-action-description block">Pausar la IA y responder</span></span>
                    </button>
                  )}
                  {state === "CLOSED" && (
                    <button type="button" role="menuitem" disabled={busy !== null}
                      onClick={() => {
                        setShowActionsMenu(false);
                        void run("reopen", () => reopenConversation(selected, epoch), "Conversación reabierta.");
                      }}
                      className="conversation-menu-item">
                      <RefreshCw className="h-5 w-5" aria-hidden />
                      <span><span className="block">Reabrir conversación</span><span className="conversation-action-description block">Habilitar respuestas en este chat</span></span>
                    </button>
                  )}
                  {humanInControl && (
                    <button type="button" role="menuitem" disabled={busy !== null}
                      onClick={() => {
                        setShowActionsMenu(false);
                        void run("close", () => closeConversation(selected), "Conversación cerrada.");
                      }}
                      className="conversation-menu-item is-danger">
                      <CheckCircle2 className="h-5 w-5" aria-hidden />
                      <span><span className="block">Cerrar conversación</span><span className="conversation-action-description block">Marcar como finalizada</span></span>
                    </button>
                  )}
                </div>
              )}

              {!readOnly && showResume && (
                <div role="dialog" aria-modal="true" aria-labelledby="resume-title"
                  onKeyDown={(event) => {
                    if (event.key === "Escape") {
                      event.preventDefault();
                      setShowResume(false);
                      window.setTimeout(() => document.getElementById("conversation-actions-trigger")?.focus(), 0);
                    }
                  }}
                  className="conversation-resume">
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <span id="resume-title" className="flex items-center gap-1.5 font-bold text-foreground">
                      <Bot className="h-5 w-5 text-violet-600 dark:text-violet-400" aria-hidden /> Devolver la conversación a la IA
                    </span>
                    <button type="button" onClick={() => setShowResume(false)} aria-label="Cancelar" title="Cancelar" className="conversation-icon-button">
                      <X className="h-5 w-5" aria-hidden />
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
                  }} className="conversation-zone-row">
                    <label htmlFor="resume-reason" className="sr-only">Motivo</label>
                    <input id="resume-reason" value={resumeReason} onChange={(event) => setResumeReason(event.target.value)} maxLength={500}
                      placeholder="Motivo: ej. consulta respondida" className="conversation-field" autoFocus />
                    <button type="submit" disabled={busy !== null || resumeReason.trim().length < 3} className="conversation-primary">
                      <Bot className="h-5 w-5" aria-hidden /> Confirmar
                    </button>
                  </form>
                </div>
              )}
            </>
          )}
        </div>
        {docked && showClient && selected && (
          <aside id="conversation-client" className="conversation-client-docked" aria-labelledby="conversation-client-title">
            <header className="conversation-client-drawer-heading">
              <div><h2 id="conversation-client-title">Datos del cliente</h2></div>
              <button type="button" className="conversation-icon-button" aria-label="Cerrar datos del cliente" onClick={() => setShowClient(false)}><X className="h-5 w-5" aria-hidden /></button>
            </header>
            <div className="conversation-client-drawer-body">{clientPanel}</div>
          </aside>
        )}
        {/* Keep visit edits mounted while the drawer is closed, as in the previous client panel. */}
        <SheetPrimitive.Portal keepMounted>
          <SheetPrimitive.Backdrop className="conversation-client-backdrop" />
          <SheetPrimitive.Popup id={docked ? undefined : "conversation-client"} className="admin-workspace wa-inbox conversation-client-drawer">
          <header className="conversation-client-drawer-heading">
            <div><SheetTitle>Datos del cliente</SheetTitle><SheetDescription>Información y visitas de la conversación seleccionada.</SheetDescription></div>
            <SheetClose render={<button type="button" className="conversation-icon-button" aria-label="Cerrar datos del cliente" />}><X className="h-5 w-5" aria-hidden /></SheetClose>
          </header>
          <div className="conversation-client-drawer-body">
          {/* Docked beside the chat: never mount the visits board twice. */}
          {!docked && clientPanel}
          </div>
          </SheetPrimitive.Popup>
        </SheetPrimitive.Portal>
      </div>
    </section>
    </Sheet>
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
