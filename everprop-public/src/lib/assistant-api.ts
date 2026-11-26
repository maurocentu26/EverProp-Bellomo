import { apiFetch } from "@/lib/everprop-api";
import { isMockDataMode } from "@/lib/data-mode";

export type KnowledgeStatus = "DRAFT" | "APPROVED" | "REVOKED";

export type KnowledgeDocument = {
  id: string;
  title: string;
  audience: "PUBLIC" | "INTERNAL";
  status: KnowledgeStatus;
  version: number;
  valid_until: string | null;
  approved_at: string | null;
  updated_at: string;
};

export type VisitRequestStatus = "REQUESTED" | "CONFIRMED" | "DECLINED" | "CANCELLED";

export type VisitRequest = {
  id: string;
  status: VisitRequestStatus;
  created_at: string;
  slots: { start_utc: string; end_utc: string; timezone: string }[];
  note: string | null;
  property: { id: string; code: string | null; title: string };
  contact: { name: string | null; phone: string | null; email: string | null; unverified: string[] };
  conversation_id: string;
  visit_id: string | null;
  /** Presentation metadata from mock fixtures or existing authorized reads; absent fields stay unknown. */
  channel?: string;
  scheduled_at?: string;
  confirmed_by?: string;
};

export const KNOWLEDGE_STATUS_LABELS: Record<KnowledgeStatus, string> = {
  DRAFT: "Borrador (el asistente no la usa)",
  APPROVED: "Aprobada",
  REVOKED: "Revocada",
};

/** Visit slots are displayed in Argentine time using a 24-hour clock. */
export function formatSlot(slot: VisitRequest["slots"][number]): string {
  const timeZone = "America/Argentina/Buenos_Aires";
  const start = new Date(slot.start_utc);
  const weekday = new Intl.DateTimeFormat("es-AR", { timeZone, weekday: "long" }).format(start);
  const day = new Intl.DateTimeFormat("es-AR", { timeZone, day: "2-digit", month: "2-digit" }).format(start);
  const clock = new Intl.DateTimeFormat("es-AR", { timeZone, hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
  return `${weekday[0].toUpperCase()}${weekday.slice(1)} ${day}, de ${clock.format(start)} a ${clock.format(new Date(slot.end_utc))}`;
}

/** datetime-local value ("2026-10-02T10:00") for the slot start, in the browser's zone. */
export function slotToLocalInput(startUtc: string): string {
  const d = new Date(startUtc);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export const listKnowledge = () => apiFetch<{ data: KnowledgeDocument[] }>("/api/v1/admin/knowledge");

export const createKnowledge = (input: { title: string; body: string; audience: "PUBLIC" | "INTERNAL"; valid_until?: string }) =>
  apiFetch<{ data: { id: string; status: KnowledgeStatus } }>("/api/v1/admin/knowledge", { method: "POST", body: JSON.stringify(input) });

export const approveKnowledge = (id: string) =>
  apiFetch(`/api/v1/admin/knowledge/${encodeURIComponent(id)}/approve`, { method: "POST" });

export const revokeKnowledge = (id: string) =>
  apiFetch(`/api/v1/admin/knowledge/${encodeURIComponent(id)}/revoke`, { method: "POST" });

export type AssistantWidgetConfig = {
  widget_id: string | null;
  display_name: string | null;
  ai_enabled: boolean;
};

export const loadAssistantWidget = (signal?: AbortSignal) =>
  apiFetch<{ data: AssistantWidgetConfig }>("/api/v1/admin/assistant/widget", { signal });

export type AssistantMessageRating = "GOOD" | "BAD";

export type AssistantMessageReview = {
  rating: AssistantMessageRating | null;
  note: string | null;
  reviewed_by_name: string | null;
  updated_at: string;
};

export type AssistantTestMessage = {
  sequence: number;
  from: "visitor" | "assistant" | "advisor";
  /** EVP-212: this assistant message is the notice sent when it handed the conversation to an advisor. */
  handoff?: boolean;
  text: string | null;
  at: string;
  review: AssistantMessageReview | null;
};

/** EVP-212: the tester's opinion on a handoff lives at the start of the review note, never in a field of its own. */
export const HANDOFF_VERDICTS = ["muy temprana", "innecesaria", "correcta"] as const;
export type HandoffVerdict = (typeof HANDOFF_VERDICTS)[number];
const HANDOFF_PREFIX = /^Derivación: (muy temprana|innecesaria|correcta)\.\s*/;

export function handoffVerdictOf(note: string | null | undefined): HandoffVerdict | null {
  return (note?.match(HANDOFF_PREFIX)?.[1] as HandoffVerdict | undefined) ?? null;
}

/** The note without the verdict prefix, so the textarea shows only what the tester wrote. */
export function noteWithoutVerdict(note: string | null | undefined): string {
  return (note ?? "").replace(HANDOFF_PREFIX, "");
}

export function withHandoffVerdict(note: string, verdict: HandoffVerdict | null): string {
  const rest = noteWithoutVerdict(note).trim();
  return verdict === null ? rest : `Derivación: ${verdict}.${rest ? ` ${rest}` : ""}`;
}

export type AssistantTestSessionSummary = {
  id: string;
  conversation_id: string;
  title: string | null;
  status: "OPEN" | "FINISHED";
  closing_note: string | null;
  created_by_name: string | null;
  created_at: string;
  finished_at: string | null;
  message_count: number;
  good_count: number;
  bad_count: number;
  noted_count: number;
};

export type AssistantTestSessionDetail = {
  id: string;
  conversation_id: string;
  title: string | null;
  status: "OPEN" | "FINISHED";
  closing_note: string | null;
  created_by_name: string | null;
  created_at: string;
  finished_at: string | null;
  ai_enabled: boolean;
  messages: AssistantTestMessage[];
};

export const listAssistantTestSessions = (signal?: AbortSignal) =>
  apiFetch<{ data: AssistantTestSessionSummary[]; meta: { ai_enabled: boolean; has_web_channel: boolean } }>(
    "/api/v1/admin/assistant/test-sessions",
    { signal },
  );

export const createAssistantTestSession = (title?: string) =>
  apiFetch<{ data: AssistantTestSessionSummary }>("/api/v1/admin/assistant/test-sessions", {
    method: "POST",
    body: JSON.stringify({ title: title?.trim() || null }),
  });

export const loadAssistantTestSession = (id: string, signal?: AbortSignal) =>
  apiFetch<{ data: AssistantTestSessionDetail }>(`/api/v1/admin/assistant/test-sessions/${encodeURIComponent(id)}`, { signal });

export const sendAssistantTestMessage = (id: string, clientMessageId: string, text: string) =>
  apiFetch<{ data: { sequence: number; replayed: boolean } }>(
    `/api/v1/admin/assistant/test-sessions/${encodeURIComponent(id)}/messages`,
    { method: "POST", body: JSON.stringify({ client_message_id: clientMessageId, text }) },
  );

export const reviewAssistantTestMessage = (
  id: string,
  sequence: number,
  input: { rating: AssistantMessageRating | null; note: string | null },
) =>
  apiFetch<{ data: AssistantMessageReview & { sequence: number } }>(
    `/api/v1/admin/assistant/test-sessions/${encodeURIComponent(id)}/messages/${sequence}/review`,
    { method: "PUT", body: JSON.stringify(input) },
  );

export const finishAssistantTestSession = (id: string, closingNote: string | null) =>
  apiFetch<{ data: { id: string; status: "FINISHED"; closing_note: string | null; finished_at: string } }>(
    `/api/v1/admin/assistant/test-sessions/${encodeURIComponent(id)}/finish`,
    { method: "POST", body: JSON.stringify({ closing_note: closingNote }) },
  );

export function formatAssistantTestSessionMarkdown(session: AssistantTestSessionDetail): string {
  const lines: string[] = [
    `# Sesión de prueba: ${session.title || "Sin título"}`,
    "",
    `- **ID sesión:** ${session.id}`,
    `- **ID conversación:** ${session.conversation_id}`,
    `- **Estado:** ${session.status === "FINISHED" ? "Finalizada" : "En curso"}`,
    `- **Creada por:** ${session.created_by_name || "Sin informar"}`,
    `- **Inicio:** ${session.created_at}`,
    ...(session.finished_at ? [`- **Finalización:** ${session.finished_at}`] : []),
    "",
    "## Mensajes y calificaciones",
    "",
  ];

  for (const m of session.messages) {
    const who = m.from === "visitor" ? "Usuario (prueba)" : m.from === "assistant" ? "Asistente virtual" : "Asesor";
    lines.push(`### #${m.sequence} · ${who}${m.handoff ? " · derivó a un asesor" : ""} (${m.at})`);
    lines.push("");
    lines.push(m.text || "_(sin texto)_");
    lines.push("");
    if (m.review && (m.review.rating || m.review.note)) {
      const ratingLabel = m.review.rating === "GOOD" ? "Bien" : m.review.rating === "BAD" ? "Mal" : "Sin calificar";
      lines.push(`> **Calificación:** ${ratingLabel}${m.review.reviewed_by_name ? ` (${m.review.reviewed_by_name})` : ""}`);
      if (m.review.note) lines.push(`> **Anotación:** ${m.review.note}`);
      lines.push("");
    }
  }

  lines.push("## Anotaciones finales de la sesión");
  lines.push("");
  lines.push(session.closing_note || "_Sin anotaciones finales._");
  lines.push("");
  return lines.join("\n");
}

const mockVisits: VisitRequest[] = isMockDataMode ? [
  ["Lucía Ferreyra", "12", "Las Moras", "2026-10-26T13:30:00Z", "REQUESTED", "WhatsApp", "¿Puedo pasar por la mañana?"],
  ["Tomás Quiroga", "12A", "Las Moras", "2026-10-27T13:00:00Z", "REQUESTED", "Web", "Quiero conocer la unidad 12A y las opciones de financiación."],
  ["Martina Sosa", "4B", "Torre Sur", "2026-10-28T19:30:00Z", "REQUESTED", "WhatsApp", "Quiero ver la vista del balcón."],
  ["Nicolás Pereyra", "4B", "Torre Sur", "2026-10-26T14:00:00Z", "CONFIRMED", "Web", "Voy con mi pareja."],
  ["Camila Funes", "12A", "Las Moras", "2026-10-27T20:00:00Z", "CONFIRMED", "WhatsApp", "Nos vemos por la tarde."],
  ["Lucía Ferreyra", "12", "Las Moras", "2026-10-28T15:00:00Z", "CONFIRMED", "WhatsApp", "Quiero recorrer el lote."],
].map(([name, code, title, start, status, channel, note], index) => ({
  id: `mock-visit-${index + 1}`, status: status as VisitRequestStatus,
  created_at: "2026-10-24T12:00:00Z",
  slots: [{ start_utc: start, end_utc: new Date(Date.parse(start) + 30 * 60000).toISOString(), timezone: "America/Argentina/Buenos_Aires" }],
  note, property: { id: `mock-property-${code}`, code, title },
  contact: { name, phone: null, email: null, unverified: [] },
  conversation_id: `mock-conversation-${index === 5 ? 1 : index + 1}`,
  visit_id: status === "CONFIRMED" ? `mock-scheduled-visit-${index + 1}` : null,
  channel, scheduled_at: status === "CONFIRMED" ? start : undefined,
  confirmed_by: status === "CONFIRMED" ? (index === 5 ? "Sofía" : "Santiago Acosta") : undefined,
})) : [];

export const listVisitRequests = async (status: VisitRequestStatus = "REQUESTED") => {
  if (isMockDataMode) return { data: mockVisits.filter(item => item.status === status).map(item => ({ ...item })) };
  return apiFetch<{ data: VisitRequest[] }>(`/api/v1/admin/visit-requests?status=${status}`);
};

export const confirmVisitRequest = async (id: string, scheduledAtIso: string, notes?: string) => {
  if (isMockDataMode) {
    const item = mockVisits.find(item => item.id === id && item.status === "REQUESTED");
    if (!item || !Number.isFinite(Date.parse(scheduledAtIso)) || Date.parse(scheduledAtIso) <= Date.now()) throw new Error("Revisá la solicitud y la fecha.");
    item.status = "CONFIRMED";
    item.visit_id = `mock-scheduled-visit-${id.replace("mock-visit-", "")}`;
    item.scheduled_at = scheduledAtIso;
    item.confirmed_by = "Asesor de prueba";
    return { data: { visit_id: item.visit_id } };
  }
  return apiFetch<{ data: { visit_id: string } }>(`/api/v1/admin/visit-requests/${encodeURIComponent(id)}/confirm`, {
    method: "POST", body: JSON.stringify({ scheduled_at: scheduledAtIso, notes }),
  });
};

export const declineVisitRequest = async (id: string) => {
  if (isMockDataMode) {
    const item = mockVisits.find(item => item.id === id && item.status === "REQUESTED");
    if (!item) throw new Error("Solicitud de prueba inexistente o resuelta.");
    item.status = "DECLINED";
    return;
  }
  return apiFetch(`/api/v1/admin/visit-requests/${encodeURIComponent(id)}/decline`, { method: "POST" });
};

/** EVP-23: this tenant's AI spend for a month (never other tenants' or the platform total). */
export type AssistantUsageKind = { runs: number; input_tokens: number; output_tokens: number; blocked_by_cap: number };
export type AssistantUsage = {
  period: string;
  timezone: string;
  spent_usd: number;
  cap_usd: number;
  used_pct: number | null;
  open_reservations_usd: number;
  by_day: { date: string; usd: number }[];
  assistant: AssistantUsageKind;
  copilot: Omit<AssistantUsageKind, "blocked_by_cap"> & { spent_usd: number; cap_usd: number };
};

export const getAssistantUsage = (period?: string) =>
  apiFetch<{ data: AssistantUsage }>(`/api/v1/admin/assistant/usage${period ? `?period=${encodeURIComponent(period)}` : ""}`);
