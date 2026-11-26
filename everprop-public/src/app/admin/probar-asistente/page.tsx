"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  ChevronRight,
  Download,
  Flag,
  HelpCircle,
  MessageSquarePlus,
  MessagesSquare,
  Pencil,
  Send,
  ThumbsDown,
  ThumbsUp,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useCurrentSession } from "@/hooks/use-current-session";
import { isMockDataMode } from "@/lib/data-mode";
import {
  createAssistantTestSession,
  finishAssistantTestSession,
  formatAssistantTestSessionMarkdown,
  listAssistantTestSessions,
  loadAssistantTestSession,
  reviewAssistantTestMessage,
  sendAssistantTestMessage,
  type AssistantMessageRating,
  type AssistantTestMessage,
  type AssistantTestSessionDetail,
  type AssistantTestSessionSummary,
} from "@/lib/assistant-api";
import { EverpropApiError } from "@/lib/everprop-api";

const ADMIN_ROLES = new Set(["TENANT_ADMIN", "SUPER_ADMIN"]);
const GUIDE_STORAGE_KEY = "everprop:probar-asistente-guide-v1";

const GUIDE_STEPS = [
  {
    preview: "sessions",
    title: "Una sesión por tema",
    description:
      "Creá una sesión para cada cosa que quieras probar: loteos, locales, visitas. Si no le ponés nombre, toma el de tu primera consulta.",
  },
  {
    preview: "rate",
    title: "Calificá cada respuesta",
    description: "Con «Calificar», al lado de cada respuesta, marcás Bien o Mal y anotás qué corregirías.",
  },
  {
    preview: "edit",
    title: "Editala cuando quieras",
    description: "Al guardar, la calificación queda como una etiqueta junto al mensaje. Tocala para verla o cambiarla.",
  },
  {
    preview: "finish",
    title: "Cerrá con tus conclusiones",
    description:
      "Cuando termines, «Finalizar sesión» te deja escribir una nota general. El equipo de Eversys revisa cada sesión.",
  },
] as const;

// Static mock of the screen area each step talks about; skeleton bars stand in for real content.
function Line({ className }: { className: string }) {
  return <Skeleton className={`h-2 animate-none bg-foreground/10 ${className}`} />;
}

function GuidePreview({ step }: { step: (typeof GUIDE_STEPS)[number]["preview"] }) {
  const bubble = (chip: React.ReactNode) => (
    <div className="flex items-start gap-2">
      <div className="w-44 space-y-1.5 rounded-xl border border-border bg-card px-3 py-2.5">
        <Line className="w-full" />
        <Line className="w-2/3" />
      </div>
      {chip}
    </div>
  );
  const chip = (label: string, tone = "border-border bg-card text-muted-foreground") => (
    <span className={`mt-1 inline-flex items-center gap-1 rounded-full border px-2 py-1 text-[11px] font-medium ${tone}`}>
      {label}
    </span>
  );

  if (step === "sessions") {
    return (
      <div className="w-56 space-y-2 rounded-xl border border-border bg-card p-2.5">
        <div className="h-6 rounded-md border border-border bg-background" />
        <div className="flex h-7 items-center justify-center gap-1 rounded-md bg-primary text-[11px] font-medium text-primary-foreground ring-2 ring-primary/30 ring-offset-2 ring-offset-card">
          <MessageSquarePlus className="h-3 w-3" /> Nueva sesión
        </div>
        {[0, 1].map((i) => (
          <div key={i} className="space-y-1.5 rounded-md px-1.5 py-1.5">
            <Line className={i === 0 ? "w-3/4" : "w-1/2"} />
            <Line className="w-1/3" />
          </div>
        ))}
      </div>
    );
  }
  if (step === "rate") {
    return (
      <div className="space-y-2">
        {bubble(chip("Calificar", "border-primary/40 bg-card text-foreground"))}
        <div className="w-44 space-y-2 rounded-xl border border-border bg-card p-2.5">
          <div className="flex gap-1.5">
            {chip("Bien", "border-emerald-600 bg-emerald-600 text-white")}
            {chip("Mal")}
          </div>
          <div className="h-8 rounded-md border border-border bg-background" />
        </div>
      </div>
    );
  }
  if (step === "edit") {
    return (
      <div className="space-y-3">
        {bubble(chip("Bien ✎", "border-emerald-600/40 bg-emerald-50 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-200"))}
        {bubble(chip("Mal ✎", "border-red-600/40 bg-red-50 text-red-800 dark:bg-red-950/60 dark:text-red-200"))}
      </div>
    );
  }
  return (
    <div className="w-64 overflow-hidden rounded-xl border border-border bg-card">
      <div className="flex items-center justify-between gap-2 border-b border-border px-2.5 py-2">
        <div className="space-y-1.5">
          <Line className="w-20" />
          <Line className="w-12" />
        </div>
        <span className="inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-md bg-primary px-2 py-1 text-[11px] font-medium text-primary-foreground ring-2 ring-primary/30 ring-offset-2 ring-offset-card">
          <Flag className="h-3 w-3" /> Finalizar sesión
        </span>
      </div>
      <div className="space-y-1.5 p-2.5">
        <Line className="w-1/3" />
        <div className="h-10 rounded-md border border-border bg-background" />
      </div>
    </div>
  );
}

const MOCK_SESSIONS: AssistantTestSessionDetail[] = isMockDataMode
  ? [
      {
        id: "demo-session-1",
        conversation_id: "demo-conv-1",
        title: "Prueba Loteo San Pablo (demo)",
        status: "OPEN",
        closing_note: null,
        created_by_name: "Mónica (Admin)",
        created_at: new Date(Date.now() - 10 * 60_000).toISOString(),
        finished_at: null,
        ai_enabled: true,
        messages: [
          {
            sequence: 1,
            from: "visitor",
            text: "Hola, busco información sobre Loteo San Pablo y los precios de los lotes.",
            at: new Date(Date.now() - 9 * 60_000).toISOString(),
            review: null,
          },
          {
            sequence: 2,
            from: "assistant",
            text: "Hola, Loteo San Pablo está ubicado en Barrio Coronel Arias. Por este canal no confirmamos precios ni disponibilidad; si querés, puedo coordinar que un asesor te contacte o agendar una visita.",
            at: new Date(Date.now() - 8 * 60_000).toISOString(),
            review: {
              rating: "GOOD",
              note: "Respetó correctamente no informar precios ni stock.",
              reviewed_by_name: "Mónica (Admin)",
              updated_at: new Date(Date.now() - 7 * 60_000).toISOString(),
            },
          },
        ],
      },
    ]
  : [];

function summarizeMock(item: AssistantTestSessionDetail): AssistantTestSessionSummary {
  return {
    id: item.id,
    conversation_id: item.conversation_id,
    title: item.title,
    status: item.status,
    closing_note: item.closing_note,
    created_by_name: item.created_by_name,
    created_at: item.created_at,
    finished_at: item.finished_at,
    message_count: item.messages.length,
    good_count: item.messages.filter((m) => m.review?.rating === "GOOD").length,
    bad_count: item.messages.filter((m) => m.review?.rating === "BAD").length,
    noted_count: item.messages.filter((m) => Boolean(m.review?.note)).length,
  };
}

function formatArDate(iso: string): string {
  const normalized = iso.includes("T") ? iso : `${iso.replace(" ", "T")}Z`;
  const d = new Date(normalized);
  if (Number.isNaN(d.getTime())) return iso;
  return new Intl.DateTimeFormat("es-AR", {
    timeZone: "America/Argentina/Buenos_Aires",
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(d);
}

function downloadFile(filename: string, content: string, mime: string) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function AssistantMessageRow({
  sessionId,
  message,
  onSaved,
}: {
  sessionId: string;
  message: AssistantTestMessage;
  onSaved: () => void;
}) {
  const hasReview = Boolean(message.review?.rating || message.review?.note);
  const [open, setOpen] = useState(false);
  const [rating, setRating] = useState<AssistantMessageRating | null>(message.review?.rating ?? null);
  const [note, setNote] = useState(message.review?.note ?? "");
  const [saving, setSaving] = useState(false);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (saving) return;
    setSaving(true);
    try {
      const cleanNote = note.trim() || null;
      if (!isMockDataMode) {
        await reviewAssistantTestMessage(sessionId, message.sequence, {
          rating,
          note: cleanNote,
        });
      } else {
        const target = MOCK_SESSIONS.find((s) => s.id === sessionId);
        const msg = target?.messages.find((m) => m.sequence === message.sequence);
        if (msg) {
          msg.review = {
            rating,
            note: cleanNote,
            reviewed_by_name: "Mónica (Admin)",
            updated_at: new Date().toISOString(),
          };
        }
      }
      setOpen(false);
      onSaved();
      toast.success("Calificación guardada");
    } catch (reason) {
      toast.error(reason instanceof Error ? reason.message : "No se pudo guardar la calificación.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <li className="flex flex-col items-start gap-2">
      <div className="flex w-full items-start gap-2">
        <div className="wa-bubble max-w-[78%] rounded-2xl border border-border bg-card px-4 py-3 text-foreground shadow-xs">
          <p className="conversation-sender mb-1 text-xs font-semibold opacity-80">
            {message.from === "assistant" ? "Asistente virtual" : "Asesor"} · {formatArDate(message.at)}
          </p>
          <p className="whitespace-pre-wrap break-words">{message.text}</p>
        </div>

        {/* Botón compacto al costado del mensaje para ver/editar o iniciar la calificación */}
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          title={hasReview ? "Ver o editar calificación" : "Calificar respuesta"}
          className={`mt-1 inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-1.5 text-xs font-semibold transition-colors ${
            message.review?.rating === "GOOD"
              ? "border-emerald-600/40 bg-emerald-50 text-emerald-800 hover:bg-emerald-100 dark:bg-emerald-950/60 dark:text-emerald-200"
              : message.review?.rating === "BAD"
                ? "border-red-600/40 bg-red-50 text-red-800 hover:bg-red-100 dark:bg-red-950/60 dark:text-red-200"
                : hasReview
                  ? "border-blue-600/40 bg-blue-50 text-blue-800 hover:bg-blue-100 dark:bg-blue-950/60 dark:text-blue-200"
                  : "border-border bg-card text-muted-foreground hover:bg-muted hover:text-foreground"
          }`}
        >
          {message.review?.rating === "GOOD" ? (
            <>
              <ThumbsUp className="h-3.5 w-3.5" aria-hidden="true" />
              <span>Bien</span>
              <Pencil className="h-3 w-3 opacity-70" aria-hidden="true" />
            </>
          ) : message.review?.rating === "BAD" ? (
            <>
              <ThumbsDown className="h-3.5 w-3.5" aria-hidden="true" />
              <span>Mal</span>
              <Pencil className="h-3 w-3 opacity-70" aria-hidden="true" />
            </>
          ) : hasReview ? (
            <>
              <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
              <span>Nota</span>
            </>
          ) : (
            <>
              <ThumbsUp className="h-3.5 w-3.5" aria-hidden="true" />
              <span>Calificar</span>
            </>
          )}
        </button>
      </div>

      {open && (
        <form
          onSubmit={handleSave}
          className="w-full max-w-[78%] space-y-2.5 rounded-xl border border-border bg-card p-3 shadow-xs"
        >
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              disabled={saving}
              aria-pressed={rating === "GOOD"}
              onClick={() => setRating((prev) => (prev === "GOOD" ? null : "GOOD"))}
              className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors ${
                rating === "GOOD"
                  ? "border-emerald-600 bg-emerald-600 text-white"
                  : "border-border bg-background text-foreground hover:bg-muted"
              }`}
            >
              <ThumbsUp className="h-4 w-4" aria-hidden="true" />
              Bien
            </button>
            <button
              type="button"
              disabled={saving}
              aria-pressed={rating === "BAD"}
              onClick={() => setRating((prev) => (prev === "BAD" ? null : "BAD"))}
              className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors ${
                rating === "BAD"
                  ? "border-red-600 bg-red-600 text-white"
                  : "border-border bg-background text-foreground hover:bg-muted"
              }`}
            >
              <ThumbsDown className="h-4 w-4" aria-hidden="true" />
              Mal
            </button>
            {message.review?.reviewed_by_name && (
              <span className="ml-auto text-xs text-muted-foreground">
                Última edición: {message.review.reviewed_by_name}
              </span>
            )}
          </div>
          <textarea
            rows={2}
            maxLength={2000}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Escribí una anotación sobre esta respuesta (opcional)…"
            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground"
          />
          <div className="flex justify-end gap-2">
            <Button type="button" size="sm" variant="outline" disabled={saving} onClick={() => setOpen(false)}>
              Cerrar
            </Button>
            <Button type="submit" size="sm" disabled={saving}>
              {saving ? "Guardando…" : "Guardar calificación"}
            </Button>
          </div>
        </form>
      )}
    </li>
  );
}

export default function ProbarAsistentePage() {
  const { user, isReady } = useCurrentSession();
  const allowed = Boolean(
    user && (
      (user.source === "api" && ADMIN_ROLES.has(user.apiRole || ""))
      || (isMockDataMode && user.role === "ADMIN")
    ),
  );

  const [sessions, setSessions] = useState<AssistantTestSessionSummary[]>(() =>
    isMockDataMode ? MOCK_SESSIONS.map(summarizeMock) : [],
  );
  const [meta, setMeta] = useState<{ ai_enabled: boolean; has_web_channel: boolean }>({ ai_enabled: true, has_web_channel: true });
  const [selectedId, setSelectedId] = useState<string | null>(() => (isMockDataMode ? MOCK_SESSIONS[0]?.id ?? null : null));
  const [mobileShowThread, setMobileShowThread] = useState(false);
  const [detail, setDetail] = useState<AssistantTestSessionDetail | null>(() =>
    isMockDataMode && MOCK_SESSIONS[0] ? { ...MOCK_SESSIONS[0], messages: [...MOCK_SESSIONS[0].messages] } : null,
  );
  const [loadingList, setLoadingList] = useState(() => !isMockDataMode);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [error, setError] = useState("");

  const [newTitle, setNewTitle] = useState("");
  const [creating, setCreating] = useState(false);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [finishing, setFinishing] = useState(false);
  const [showFinishForm, setShowFinishForm] = useState(false);
  const [closingNote, setClosingNote] = useState("");

  const [guideOpen, setGuideOpen] = useState(false);
  const [guideStep, setGuideStep] = useState(0);
  const bottomRef = useRef<HTMLLIElement>(null);

  useEffect(() => {
    if (!isReady || !allowed) return;
    try {
      if (window.localStorage.getItem(GUIDE_STORAGE_KEY) !== "seen") {
        setGuideOpen(true);
      }
    } catch {
      /* storage blocked */
    }
  }, [isReady, allowed]);

  function closeGuide() {
    setGuideOpen(false);
    setGuideStep(0);
    try {
      window.localStorage.setItem(GUIDE_STORAGE_KEY, "seen");
    } catch {
      /* storage blocked */
    }
  }

  const refreshList = useCallback(async (signal?: AbortSignal) => {
    if (isMockDataMode) {
      setSessions(MOCK_SESSIONS.map(summarizeMock));
      return;
    }
    try {
      const res = await listAssistantTestSessions(signal);
      if (signal?.aborted) return;
      setSessions(res.data);
      setMeta(res.meta);
      setError("");
      setSelectedId((prev) => prev ?? (res.data[0]?.id ?? null));
    } catch (reason) {
      if (signal?.aborted) return;
      if (reason instanceof EverpropApiError && reason.status === 403) {
        setError("Tu perfil no tiene permiso para acceder al chat de prueba.");
      } else {
        setError(reason instanceof Error ? reason.message : "No se pudieron cargar las sesiones.");
      }
    } finally {
      if (!signal?.aborted) setLoadingList(false);
    }
  }, []);

  const refreshDetail = useCallback(async (id: string, signal?: AbortSignal, silent = false) => {
    if (isMockDataMode) {
      const found = MOCK_SESSIONS.find((s) => s.id === id);
      if (found) {
        setDetail({ ...found, messages: found.messages.map((m) => ({ ...m })) });
        setClosingNote(found.closing_note ?? "");
      }
      return;
    }
    if (!silent) setLoadingDetail(true);
    try {
      const res = await loadAssistantTestSession(id, signal);
      if (signal?.aborted) return;
      setDetail(res.data);
      setClosingNote(res.data.closing_note ?? "");
    } catch (reason) {
      if (!signal?.aborted && !silent) {
        toast.error(reason instanceof Error ? reason.message : "No se pudo cargar la sesión.");
      }
    } finally {
      if (!signal?.aborted && !silent) setLoadingDetail(false);
    }
  }, []);

  useEffect(() => {
    if (!isReady || !allowed || isMockDataMode) return;
    const controller = new AbortController();
    void refreshList(controller.signal);
    return () => controller.abort();
  }, [isReady, allowed, refreshList]);

  useEffect(() => {
    if (!selectedId || !allowed) return;
    const controller = new AbortController();
    void refreshDetail(selectedId, controller.signal);
    return () => controller.abort();
  }, [selectedId, allowed, refreshDetail]);

  useEffect(() => {
    if (!selectedId || !detail || detail.status !== "OPEN" || isMockDataMode) return;
    const timer = window.setInterval(() => {
      void refreshDetail(selectedId, undefined, true);
    }, 3000);
    return () => window.clearInterval(timer);
  }, [selectedId, detail?.status, refreshDetail]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: "end" });
  }, [detail?.messages.length]);

  async function handleCreateSession(e: React.FormEvent) {
    e.preventDefault();
    if (creating) return;
    setCreating(true);
    try {
      if (isMockDataMode) {
        const created: AssistantTestSessionDetail = {
          id: `demo-session-${Date.now()}`,
          conversation_id: `demo-conv-${Date.now()}`,
          title: newTitle.trim() || null,
          status: "OPEN",
          closing_note: null,
          created_by_name: user?.name || "Admin",
          created_at: new Date().toISOString(),
          finished_at: null,
          ai_enabled: true,
          messages: [],
        };
        MOCK_SESSIONS.unshift(created);
        setNewTitle("");
        setShowFinishForm(false);
        setSessions(MOCK_SESSIONS.map(summarizeMock));
        setSelectedId(created.id);
        setDetail({ ...created });
        setClosingNote("");
        setMobileShowThread(true);
        toast.success("Nueva sesión creada");
        return;
      }
      const res = await createAssistantTestSession(newTitle);
      setNewTitle("");
      setShowFinishForm(false);
      setSessions((prev) => [res.data, ...prev]);
      setSelectedId(res.data.id);
      setMobileShowThread(true);
      toast.success("Nueva sesión creada");
    } catch (reason) {
      toast.error(reason instanceof Error ? reason.message : "No se pudo crear la sesión.");
    } finally {
      setCreating(false);
    }
  }

  async function handleSendMessage(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedId || sending || !draft.trim()) return;
    const text = draft.trim();
    setSending(true);
    setDraft("");
    try {
      if (isMockDataMode) {
        const target = MOCK_SESSIONS.find((s) => s.id === selectedId);
        if (target && target.status === "OPEN") {
          if (!target.title) {
            target.title = text.length > 60 ? `${text.slice(0, 60)}…` : text;
          }
          const nextSeq = target.messages.length + 1;
          target.messages.push(
            { sequence: nextSeq, from: "visitor", text, at: new Date().toISOString(), review: null },
            {
              sequence: nextSeq + 1,
              from: "assistant",
              text: "Respuesta simulada en vista previa local. En staging responde el asistente real (reglas EVP-200).",
              at: new Date().toISOString(),
              review: null,
            },
          );
          await refreshDetail(selectedId, undefined, true);
          await refreshList();
        }
        return;
      }
      await sendAssistantTestMessage(selectedId, crypto.randomUUID(), text);
      await refreshDetail(selectedId, undefined, true);
      void refreshList();
    } catch (reason) {
      setDraft(text);
      toast.error(reason instanceof Error ? reason.message : "No se pudo enviar el mensaje.");
    } finally {
      setSending(false);
    }
  }

  async function handleFinishSession(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedId || finishing) return;
    setFinishing(true);
    try {
      if (isMockDataMode) {
        const target = MOCK_SESSIONS.find((s) => s.id === selectedId);
        if (target) {
          target.status = "FINISHED";
          target.closing_note = closingNote.trim() || null;
          target.finished_at = target.finished_at ?? new Date().toISOString();
        }
        setShowFinishForm(false);
        await Promise.all([refreshDetail(selectedId, undefined, true), refreshList()]);
        toast.success("Sesión finalizada y anotación guardada");
        return;
      }
      await finishAssistantTestSession(selectedId, closingNote.trim() || null);
      setShowFinishForm(false);
      await Promise.all([refreshDetail(selectedId, undefined, true), refreshList()]);
      toast.success("Sesión finalizada y anotación guardada");
    } catch (reason) {
      toast.error(reason instanceof Error ? reason.message : "No se pudo finalizar la sesión.");
    } finally {
      setFinishing(false);
    }
  }

  if (!isReady || !user) {
    return <p role="status" className="p-6 text-sm text-muted-foreground">Cargando sesión…</p>;
  }

  if (!allowed) {
    return (
      <section className="mx-auto my-10 max-w-2xl rounded-2xl border border-border bg-card p-6">
        <Link href="/admin" className="mb-3 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-4 w-4" aria-hidden="true" /> Volver al panel
        </Link>
        <h1 className="text-xl font-bold">Probar asistente</h1>
        <p role="alert" className="mt-2 text-sm text-muted-foreground">
          Esta página está disponible únicamente para administradores.
        </p>
      </section>
    );
  }

  const currentGuide = GUIDE_STEPS[guideStep];

  return (
    <>
      <section className="wa-inbox conversation-workspace-inbox h-dvh overflow-hidden">
        {/* Columna izquierda: sesiones de prueba */}
        <aside
          className={`wa-bar flex h-full w-full flex-col border-r border-border md:w-[340px] md:shrink-0 ${
            mobileShowThread ? "hidden md:flex" : "flex"
          }`}
        >
          <header className="conversation-workspace-heading border-b border-border">
            <Link
              href="/admin"
              aria-label="Volver al panel"
              className="conversation-icon-button hover:bg-muted"
              title="Volver al panel"
            >
              <ArrowLeft className="h-5 w-5" aria-hidden="true" />
            </Link>
            <h1 className="text-lg font-bold">Probar asistente</h1>
            <button
              type="button"
              aria-label="Cómo usar esta pantalla"
              title="Ver guía paso a paso"
              onClick={() => {
                setGuideStep(0);
                setGuideOpen(true);
              }}
              className="conversation-icon-button hover:bg-muted"
            >
              <HelpCircle className="h-5 w-5" aria-hidden="true" />
            </button>
            <Link
              href="/admin/conversaciones"
              aria-label="Ir a Conversaciones"
              className="conversation-icon-button hover:bg-muted"
              title="Ver en Conversaciones"
            >
              <MessagesSquare className="h-5 w-5" aria-hidden="true" />
            </Link>
          </header>

          <form onSubmit={handleCreateSession} className="space-y-2 border-b border-border p-3">
            <label htmlFor="new-session-title" className="sr-only">
              Título de la nueva sesión
            </label>
            <input
              id="new-session-title"
              type="text"
              maxLength={160}
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              placeholder="Nombre opcional (ej: Loteos, Deptos…)"
              className="wa-input w-full rounded-xl border border-border px-3 py-2 text-sm"
            />
            <Button type="submit" disabled={creating || !meta.has_web_channel} className="w-full">
              <MessageSquarePlus className="mr-1.5 h-4 w-4" aria-hidden="true" />
              {creating ? "Creando…" : "Nueva sesión"}
            </Button>
          </form>

          {error && (
            <p role="alert" className="m-3 rounded-xl border border-red-300 bg-red-50 p-3 text-sm text-red-900 dark:border-red-900 dark:bg-red-950 dark:text-red-100">
              {error}
            </p>
          )}

          <div className="min-h-0 flex-1 overflow-y-auto p-2">
            <p className="px-2 py-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Sesiones ({sessions.length})
            </p>
            {loadingList && <p role="status" className="px-2 py-3 text-sm text-muted-foreground">Cargando sesiones…</p>}
            {!loadingList && sessions.length === 0 && (
              <p className="px-2 py-3 text-sm text-muted-foreground">Todavía no hay sesiones. Creá la primera arriba.</p>
            )}
            <ul className="space-y-1.5">
              {sessions.map((s) => {
                const active = s.id === selectedId;
                return (
                  <li key={s.id}>
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedId(s.id);
                        setShowFinishForm(false);
                        setMobileShowThread(true);
                      }}
                      className={`w-full rounded-xl border p-3 text-left transition-colors ${
                        active
                          ? "wa-selected border-blue-600/60"
                          : "border-transparent hover:bg-muted/60"
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="truncate font-semibold">{s.title || "Sesión sin título"}</span>
                        <span
                          className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${
                            s.status === "FINISHED"
                              ? "bg-muted text-muted-foreground"
                              : "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200"
                          }`}
                        >
                          {s.status === "FINISHED" ? "Finalizada" : "En curso"}
                        </span>
                      </div>
                      <p className="wa-meta mt-0.5 text-xs">
                        {s.created_by_name || "Admin"} · {formatArDate(s.created_at)}
                      </p>
                      <div className="wa-meta mt-1 flex flex-wrap gap-2 text-xs">
                        <span>{s.message_count} msj</span>
                        {s.good_count > 0 && <span className="text-emerald-700 dark:text-emerald-400">Bien: {s.good_count}</span>}
                        {s.bad_count > 0 && <span className="text-red-700 dark:text-red-400">Mal: {s.bad_count}</span>}
                        {s.noted_count > 0 && <span>Notas: {s.noted_count}</span>}
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        </aside>

        {/* Columna derecha: chat a pantalla completa */}
        <div
          className={`flex h-full min-w-0 flex-1 flex-col bg-background ${
            mobileShowThread ? "flex" : "hidden md:flex"
          }`}
        >
          {!meta.ai_enabled && (
            <div role="status" className="flex items-center gap-2 border-b border-amber-300 bg-amber-50 px-4 py-2 text-sm text-amber-950 dark:border-amber-800 dark:bg-amber-950/60 dark:text-amber-100">
              <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden="true" />
              <p>
                El asistente automático está apagado. Podés activarlo desde{" "}
                <Link href="/admin/settings" className="font-semibold underline">Configuración</Link>.
              </p>
            </div>
          )}

          {!selectedId ? (
            <div className="flex flex-1 flex-col items-center justify-center gap-2 p-8 text-center text-muted-foreground">
              <MessagesSquare className="h-10 w-10 opacity-40" aria-hidden="true" />
              <p className="font-medium text-foreground">Seleccioná o creá una sesión de prueba</p>
              <p className="max-w-md text-sm">
                Podés organizar las pruebas por tema, calificar cada respuesta del asistente como Bien o Mal con anotaciones y exportar toda la traza al finalizar.
              </p>
            </div>
          ) : loadingDetail && !detail ? (
            <div className="flex flex-1 items-center justify-center p-8 text-sm text-muted-foreground" role="status">
              Cargando mensajes…
            </div>
          ) : detail ? (
            <>
              <header className="wa-bar flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-2.5">
                <div className="flex min-w-0 items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setMobileShowThread(false)}
                    aria-label="Ver sesiones"
                    className="conversation-icon-button hover:bg-muted md:hidden"
                  >
                    <ArrowLeft className="h-5 w-5" aria-hidden="true" />
                  </button>
                  <div className="min-w-0">
                    <h2 className="truncate font-bold">{detail.title || "Sesión sin título"}</h2>
                    <p className="wa-meta truncate text-xs">
                      {detail.status === "FINISHED" ? "Finalizada" : "En curso"} · {detail.created_by_name || "Admin"} · {formatArDate(detail.created_at)}
                    </p>
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() =>
                      downloadFile(
                        `prueba-asistente-${detail.id.slice(0, 8)}.md`,
                        formatAssistantTestSessionMarkdown(detail),
                        "text/markdown;charset=utf-8",
                      )
                    }
                  >
                    <Download className="mr-1.5 h-4 w-4" aria-hidden="true" />
                    .md
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() =>
                      downloadFile(
                        `prueba-asistente-${detail.id.slice(0, 8)}.json`,
                        JSON.stringify(detail, null, 2),
                        "application/json;charset=utf-8",
                      )
                    }
                  >
                    <Download className="mr-1.5 h-4 w-4" aria-hidden="true" />
                    .json
                  </Button>
                  <Button
                    type="button"
                    variant={detail.status === "OPEN" ? "default" : "outline"}
                    size="sm"
                    onClick={() => setShowFinishForm((v) => !v)}
                  >
                    <Flag className="mr-1.5 h-4 w-4" aria-hidden="true" />
                    {detail.status === "OPEN" ? "Finalizar sesión" : "Nota final"}
                  </Button>
                </div>
              </header>

              {showFinishForm && (
                <form onSubmit={handleFinishSession} className="space-y-3 border-b border-border bg-amber-50/70 px-6 py-4 dark:bg-amber-950/30">
                  <div className="mx-auto max-w-3xl space-y-2.5">
                    <label htmlFor="closing-note" className="block font-semibold">
                      Anotaciones generales de la sesión
                    </label>
                    <textarea
                      id="closing-note"
                      rows={3}
                      maxLength={5000}
                      value={closingNote}
                      onChange={(e) => setClosingNote(e.target.value)}
                      placeholder="Conclusiones generales, errores repetidos o sugerencias para el equipo…"
                      className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm"
                    />
                    <div className="flex flex-wrap justify-end gap-2">
                      <Button type="button" variant="outline" size="sm" onClick={() => setShowFinishForm(false)}>
                        Cancelar
                      </Button>
                      <Button type="submit" size="sm" disabled={finishing}>
                        <CheckCircle2 className="mr-1.5 h-4 w-4" aria-hidden="true" />
                        {finishing ? "Guardando…" : detail.status === "OPEN" ? "Finalizar y guardar" : "Guardar anotación"}
                      </Button>
                    </div>
                  </div>
                </form>
              )}

              {detail.status === "FINISHED" && detail.closing_note && !showFinishForm && (
                <div className="border-b border-border bg-muted/40 px-6 py-3">
                  <div className="mx-auto max-w-3xl">
                    <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Anotación final de la sesión</p>
                    <p className="mt-1 whitespace-pre-wrap text-sm">{detail.closing_note}</p>
                  </div>
                </div>
              )}

              {/* Hilo de mensajes ocupando todo el alto disponible */}
              <div className="wa-thread min-h-0 flex-1 overflow-y-auto px-4 py-5 sm:px-8">
                <ol aria-label="Mensajes de la sesión" aria-live="polite" className="mx-auto flex max-w-3xl flex-col gap-4">
                  {detail.messages.length === 0 && (
                    <li className="rounded-2xl border border-border bg-card p-4 text-sm text-muted-foreground">
                      Escribí el primer mensaje abajo para empezar la prueba. Las respuestas del asistente aparecerán aquí y podrás calificar cada una desde el botón al costado del mensaje.
                    </li>
                  )}
                  {detail.messages.map((m) =>
                    m.from === "visitor" ? (
                      <li key={m.sequence} className="flex flex-col items-end">
                        <div className="wa-bubble max-w-[85%] rounded-2xl bg-blue-600 px-4 py-3 text-white shadow-xs">
                          <p className="conversation-sender mb-1 text-xs font-semibold opacity-80">
                            Usuario (prueba) · {formatArDate(m.at)}
                          </p>
                          <p className="whitespace-pre-wrap break-words">{m.text}</p>
                        </div>
                      </li>
                    ) : (
                      <AssistantMessageRow
                        key={`${detail.id}-${m.sequence}-${m.review?.updated_at ?? "none"}`}
                        sessionId={detail.id}
                        message={m}
                        onSaved={() => {
                          void refreshDetail(detail.id, undefined, true);
                          void refreshList();
                        }}
                      />
                    ),
                  )}
                  <li ref={bottomRef} aria-hidden className="h-2" />
                </ol>
              </div>

              {detail.status === "OPEN" ? (
                <form onSubmit={handleSendMessage} className="wa-bar border-t border-border px-4 py-3 sm:px-8">
                  <div className="mx-auto flex max-w-3xl items-end gap-2">
                    <label htmlFor="test-chat-input" className="sr-only">Mensaje de prueba</label>
                    <textarea
                      id="test-chat-input"
                      rows={1}
                      maxLength={2000}
                      value={draft}
                      disabled={sending}
                      onChange={(e) => setDraft(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && !e.shiftKey) {
                          e.preventDefault();
                          void handleSendMessage(e);
                        }
                      }}
                      placeholder="Escribí una consulta de prueba…"
                      className="wa-input min-h-11 flex-1 resize-none rounded-xl border border-border px-3.5 py-2.5"
                    />
                    <Button type="submit" disabled={sending || !draft.trim()} aria-label="Enviar mensaje de prueba" className="min-h-11 px-4">
                      <Send className="h-4 w-4" aria-hidden="true" />
                    </Button>
                  </div>
                </form>
              ) : (
                <p className="wa-bar border-t border-border px-4 py-3 text-center text-sm text-muted-foreground">
                  Sesión finalizada. Podés seguir calificando mensajes, editar la nota final o exportar la traza.
                </p>
              )}
            </>
          ) : null}
        </div>
      </section>

      {/* Modal de recorrido guiado paso a paso */}
      <Dialog open={guideOpen} onOpenChange={(next) => { if (!next) closeGuide(); }}>
        <DialogContent className="admin-workspace gap-0 overflow-hidden p-0 sm:max-w-md">
          <div aria-hidden="true" className="flex h-44 items-center justify-center border-b border-border bg-muted">
            <GuidePreview step={currentGuide.preview} />
          </div>
          <DialogHeader className="px-5 pt-4 pb-5">
            <DialogTitle className="text-base font-semibold">{currentGuide.title}</DialogTitle>
            <DialogDescription className="leading-relaxed">{currentGuide.description}</DialogDescription>
          </DialogHeader>
          <DialogFooter className="m-0 flex-row items-center justify-between rounded-none px-5 py-3 sm:justify-between">
            <span className="text-xs text-muted-foreground tabular-nums">
              {guideStep + 1} de {GUIDE_STEPS.length}
            </span>
            <div className="flex gap-2">
              {guideStep > 0 ? (
                <Button type="button" variant="ghost" size="sm" onClick={() => setGuideStep((s) => s - 1)}>
                  Atrás
                </Button>
              ) : (
                <Button type="button" variant="ghost" size="sm" onClick={closeGuide}>
                  Omitir
                </Button>
              )}
              {guideStep < GUIDE_STEPS.length - 1 ? (
                <Button type="button" size="sm" onClick={() => setGuideStep((s) => s + 1)}>
                  Siguiente
                  <ChevronRight className="ml-1 h-4 w-4" aria-hidden="true" />
                </Button>
              ) : (
                <Button type="button" size="sm" onClick={closeGuide}>
                  Empezar
                </Button>
              )}
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
