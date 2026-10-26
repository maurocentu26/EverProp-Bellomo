import { apiFetch } from "@/lib/everprop-api";
import { isMockDataMode } from "@/lib/data-mode";

export type ConversationState =
  | "AI_ACTIVE"
  | "WAITING_TOOL"
  | "WAITING_HUMAN"
  | "TRANSITION_PENDING"
  | "HUMAN_ACTIVE"
  | "CLOSED";

export type ConversationSummary = {
  id: string;
  state: ConversationState;
  epoch: number;
  channel: "WHATSAPP" | "WEB_CHAT" | string;
  contact_name: string | null;
  unread: number;
  assigned_user: { id: string; name: string } | null;
  last_activity_at: string;
  last_message?: { text: string | null; sender: "CONTACT" | "USER" | "BOT" | "SYSTEM" | string; type?: string | null } | null;
  /** EVP-15: waiting for a person since (first unanswered visitor message); only while WAITING_HUMAN. */
  waiting_since?: string | null;
  /** EVP-15: that wait started outside the team's business hours. */
  out_of_hours?: boolean;
};

/** EVP-15: what the assistant gathered before handing off. */
export type HandoffSummary = { reason: string; summary: string; at: string };

export const HANDOFF_REASONS: Record<string, string> = {
  USER_REQUEST: "El cliente pidió hablar con una persona",
  NO_EVIDENCE: "El asistente no tenía datos verificados",
  TOOL_FAILURE: "Falló una consulta del asistente",
  COMMERCIAL_EXCEPTION: "Pide condiciones especiales",
  AI_DISABLED: "Asistente apagado",
};

export type ConversationMessage = {
  sequence: number;
  direction: "INBOUND" | "OUTBOUND" | "INTERNAL";
  sender: "CONTACT" | "USER" | "BOT" | "SYSTEM";
  text: string | null;
  status: string;
  at: string;
  /** Internal notes only: who wrote it. */
  author?: string | null;
  /** Photo or PDF; `url` is an authorized endpoint (never a storage path). */
  media?: MessageMedia | null;
};

export type MessageMedia = { kind: "IMAGE" | "DOCUMENT" | string; name: string; mime: string; size: number; url: string };

/** Accepted by the API (sniffed again from the bytes there). */
export const ATTACHMENT_TYPES = "image/jpeg,image/png,image/webp,application/pdf";
export const ATTACHMENT_MAX_BYTES = 10 * 1024 * 1024;

export function fileSize(bytes: number): string {
  return bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / 1024 / 1024).toFixed(1).replace(".", ",")} MB`;
}

export type ConversationFilter = "all" | "waiting" | "mine" | "unread";

/** Labels shown to advisors. "Pausa pedida" is never presented as confirmed control (ADR D11). */
export const STATE_LABELS: Record<ConversationState, string> = {
  AI_ACTIVE: "IA activa",
  WAITING_TOOL: "IA consultando",
  WAITING_HUMAN: "Espera asesor",
  TRANSITION_PENDING: "Tomando control…",
  HUMAN_ACTIVE: "Asesor a cargo",
  CLOSED: "Cerrada",
};

export const CHANNEL_LABELS: Record<string, string> = {
  WHATSAPP: "WhatsApp",
  WEB_CHAT: "Chat web",
  INSTAGRAM_DM: "Instagram",
  FACEBOOK_MESSENGER: "Messenger",
};

/** Search terms shorter than this are ignored (the API rejects them). */
export const MIN_SEARCH = 2;

export function conversationQuery(filter: ConversationFilter, search = ""): string {
  const params = new URLSearchParams();
  if (filter === "waiting") params.set("state", "WAITING_HUMAN");
  if (filter === "mine") params.set("mine", "1");
  if (filter === "unread") params.set("unread", "1");
  const term = search.trim().slice(0, 100);
  if (term.length >= MIN_SEARCH) params.set("q", term);
  const query = params.toString();
  return `/api/v1/admin/conversations${query ? `?${query}` : ""}`;
}

/** Delivery status of an outbound message in plain language; UNKNOWN is never shown as sent. */
export function deliveryLabel(message: Pick<ConversationMessage, "direction" | "status">): string | null {
  if (message.direction !== "OUTBOUND") return null;
  const labels: Record<string, string> = {
    QUEUED: "En cola",
    SENT: "Enviado",
    DELIVERED: "Entregado",
    READ: "Leído",
    FAILED: "No enviado",
    CANCELLED: "Descartado",
    UNKNOWN: "Envío sin confirmar",
  };
  return labels[message.status] ?? message.status;
}

export async function listConversations(filter: ConversationFilter, search = "") {
  if (isMockDataMode) {
    const term = search.trim().slice(0, 100).toLocaleLowerCase("es-AR");
    return { data: mockConversations.filter(item =>
      (filter !== "waiting" || item.state === "WAITING_HUMAN") &&
      (filter !== "mine" || item.assigned_user?.id === "mock-advisor") &&
      (filter !== "unread" || item.unread > 0) &&
      (term.length < MIN_SEARCH || `${item.contact_name} ${item.last_message?.text}`.toLocaleLowerCase("es-AR").includes(term))
    ).map(item => ({ ...item })) };
  }
  return apiFetch<{ data: ConversationSummary[] }>(conversationQuery(filter, search));
}

/** "14:05", like the time inside a WhatsApp bubble. */
export function clockTime(iso: string): string {
  return new Intl.DateTimeFormat("es-AR", { hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date(iso));
}

const dayKey = (d: Date) => `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;

/** Separator between days in the thread: "Hoy", "Ayer" or the date (with year only when it differs). */
export function dayLabel(iso: string, now: Date = new Date()): string {
  const date = new Date(iso);
  const yesterday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
  if (dayKey(date) === dayKey(now)) return "Hoy";
  if (dayKey(date) === dayKey(yesterday)) return "Ayer";
  return new Intl.DateTimeFormat("es-AR", {
    weekday: "long", day: "numeric", month: "long", ...(date.getFullYear() !== now.getFullYear() ? { year: "numeric" } : {}),
  }).format(date);
}

/** True when two instants fall on the same local day. */
export function sameDay(a: string, b: string): boolean {
  return dayKey(new Date(a)) === dayKey(new Date(b));
}

/** Avatar letters: first letter of the first two words ("Tomás Peralta" → "TP"). */
export function initials(name: string): string {
  const letters = name.trim().split(/\s+/).slice(0, 2).map((word) => word[0] ?? "").join("");
  return letters.toUpperCase() || "?";
}

/** One line under the contact name: who spoke last and what, never more than one line. */
export function previewText(item: Pick<ConversationSummary, "last_message">): string {
  const last = item.last_message;
  if (!last) return "";
  const who: Record<string, string> = { USER: "Asesor: ", BOT: "IA: " };
  const media: Record<string, string> = { IMAGE: "📷 Foto", DOCUMENT: "📄 PDF" };
  const text = last.text?.replace(/\s+/g, " ").trim();
  const label = media[last.type ?? ""];
  return `${who[last.sender] ?? ""}${label ? (text ? `${label}: ${text}` : label) : text || "[contenido no textual]"}`;
}

/** The API pages 200 messages per call, oldest first. */
export const MESSAGE_PAGE = 200;
const SETTLED = new Set(["RECEIVED", "SENT", "DELIVERED", "READ", "FAILED", "CANCELLED"]);

/**
 * Where the next poll starts: right before the oldest outbound message whose delivery can still
 * change (queued, unconfirmed), else after the last one. New messages and status changes both arrive.
 */
export function threadCursor(messages: ConversationMessage[]): number {
  const pending = messages.filter((m) => m.direction === "OUTBOUND" && !SETTLED.has(m.status));
  if (pending.length) return Math.min(...pending.map((m) => m.sequence)) - 1;
  return messages.length ? messages[messages.length - 1].sequence : 0;
}

/** Newer copies replace older ones by sequence; the result stays ordered. */
export function mergeMessages(current: ConversationMessage[], incoming: ConversationMessage[]): ConversationMessage[] {
  if (!incoming.length) return current;
  const bySequence = new Map(current.map((m) => [m.sequence, m]));
  for (const message of incoming) bySequence.set(message.sequence, message);
  return [...bySequence.values()].sort((a, b) => a.sequence - b.sequence);
}

export async function getConversationMessages(id: string, after = 0) {
  if (isMockDataMode) {
    const item = mockConversation(id);
    return { conversation: { id, state: item.state, epoch: item.epoch, ai_enabled: true, copilot_enabled: true,
      handoff: id === "mock-conversation-1" ? { reason: "USER_REQUEST", summary: "Lucía pidió visitar la unidad 12 de Las Moras. Prefiere el lunes a las 10:30.", at: mockNow } : null,
      reply_window: null }, data: mockThreads.get(id)!.filter(message => message.sequence > after).map(message => ({ ...message })) };
  }
  return apiFetch<{ conversation: { id: string; state: ConversationState; epoch: number; ai_enabled: boolean; copilot_enabled?: boolean; handoff?: HandoffSummary | null; reply_window: { closes_at: string | null } | null }; data: ConversationMessage[] }>(
    `/api/v1/admin/conversations/${encodeURIComponent(id)}/messages${after > 0 ? `?after=${after}` : ""}`,
  );
}

export async function takeOver(id: string) {
  if (isMockDataMode) { const item = mockConversation(id); item.state = "HUMAN_ACTIVE"; item.epoch++; item.unread = 0; item.assigned_user = { id: "mock-advisor", name: "Santiago Acosta" }; return { data: { state: item.state, epoch: item.epoch, confirmed: true } }; }
  return apiFetch<{ data: { state: ConversationState; epoch: number; confirmed: boolean } }>(
    `/api/v1/admin/conversations/${encodeURIComponent(id)}/takeover`,
    { method: "POST" },
  );
}

/** Team-only note: never sent to the customer. */
export async function addNote(id: string, text: string, idempotencyKey: string) {
  if (isMockDataMode) return mockMessage(id, text, idempotencyKey, true);
  return apiFetch<{ data: { sequence: number; replayed: boolean } }>(
    `/api/v1/admin/conversations/${encodeURIComponent(id)}/notes`,
    { method: "POST", body: JSON.stringify({ text, idempotency_key: idempotencyKey }) },
  );
}

export async function resumeAi(id: string, reason: string) {
  if (isMockDataMode) { const item = mockConversation(id); item.state = "AI_ACTIVE"; item.epoch++; return; }
  return apiFetch(`/api/v1/admin/conversations/${encodeURIComponent(id)}/resume`, {
    method: "POST",
    body: JSON.stringify({ reason }),
  });
}

export async function closeConversation(id: string) {
  if (isMockDataMode) { const item = mockConversation(id); item.state = "CLOSED"; item.epoch++; return; }
  return apiFetch(`/api/v1/admin/conversations/${encodeURIComponent(id)}/close`, { method: "POST" });
}

/** Bound to the closure the advisor saw: a retry never reopens a later episode. */
export async function reopenConversation(id: string, expectedEpoch: number) {
  if (isMockDataMode) { const item = mockConversation(id); if (item.epoch !== expectedEpoch || item.state !== "CLOSED") throw new Error("La conversación cambió. Actualizá e intentá de nuevo."); item.state = "WAITING_HUMAN"; item.epoch++; return; }
  return apiFetch(`/api/v1/admin/conversations/${encodeURIComponent(id)}/reopen`, {
    method: "POST", body: JSON.stringify({ expected_epoch: expectedEpoch }),
  });
}

export async function resolveUnknownSends(id: string) {
  if (isMockDataMode) { mockConversation(id); return { data: { resolved: 0, warning: "No hay envíos pendientes en esta muestra." } }; }
  return apiFetch<{ data: { resolved: number; warning: string } }>(
    `/api/v1/admin/conversations/${encodeURIComponent(id)}/resolve-unknown`,
    { method: "POST" },
  );
}

/** The idempotency key belongs to the draft: a retry of the same text reuses it. */
/** `suggestionId`: the copilot draft this reply came from (the server decides whether it was edited). */
export async function sendReply(id: string, text: string, idempotencyKey: string, suggestionId?: string) {
  if (isMockDataMode) return mockMessage(id, text, idempotencyKey);
  return apiFetch<{ data: { sequence: number; replayed: boolean } }>(
    `/api/v1/admin/conversations/${encodeURIComponent(id)}/messages`,
    { method: "POST", body: JSON.stringify({ text, idempotency_key: idempotencyKey,
      ...(suggestionId ? { suggestion_id: suggestionId } : {}) }) },
  );
}

export type WhatsAppTemplate = { name: string; language: string; category: string; body: string; params: number };

/** Approved templates of the conversation's WhatsApp number: the only way to write after the 24 h window. */
export async function listTemplates(id: string) {
  if (isMockDataMode) { mockConversation(id); return { data: [{ name: "seguimiento_visita", language: "es_AR", category: "UTILITY", body: "Hola {{1}}, ¿coordinamos tu visita a Las Moras?", params: 1 }] }; }
  return apiFetch<{ data: WhatsAppTemplate[] }>(`/api/v1/admin/conversations/${encodeURIComponent(id)}/templates`);
}

export async function sendTemplate(id: string, template: WhatsAppTemplate, params: string[], idempotencyKey: string) {
  if (isMockDataMode) return mockMessage(id, renderTemplate(template.body, params), idempotencyKey);
  return apiFetch<{ data: { sequence: number; replayed: boolean } }>(
    `/api/v1/admin/conversations/${encodeURIComponent(id)}/template`,
    { method: "POST", body: JSON.stringify({ name: template.name, language: template.language, params, idempotency_key: idempotencyKey }) },
  );
}

/** Body with {{n}} replaced by what the advisor typed (empty ones stay visible as {{n}}). */
export function renderTemplate(body: string, params: string[]): string {
  return body.replace(/\{\{(\d+)\}\}/g, (all, n: string) => params[Number(n) - 1]?.trim() || all);
}

/** Photo or PDF to the client, with an optional caption (web chat). */
export async function sendAttachment(id: string, file: File, caption: string, idempotencyKey: string) {
  if (isMockDataMode) throw new Error("Los adjuntos requieren modo API; esta muestra no sube archivos.");
  const body = new FormData();
  body.append("file", file);
  body.append("idempotency_key", idempotencyKey);
  if (caption) body.append("caption", caption);
  return apiFetch<{ data: { sequence: number; replayed: boolean } }>(
    `/api/v1/admin/conversations/${encodeURIComponent(id)}/attachments`, { method: "POST", body },
  );
}

/** The conversation's open lead (created if missing, one per contact), to qualify it and book the visit. */
export async function openConversationLead(id: string) {
  if (isMockDataMode) throw new Error("La ficha real requiere modo API; esta muestra no crea clientes.");
  return apiFetch<{ data: { lead_id: string; created: boolean } }>(
    `/api/v1/admin/conversations/${encodeURIComponent(id)}/lead`, { method: "POST" },
  );
}

/** Copilot: a draft for the advisor in control. Nothing is sent until the advisor sends it. */
export async function suggestReply(id: string) {
  if (isMockDataMode) { mockConversation(id); return { data: { text: "Hola, Lucía. Recibimos tu solicitud para visitar la unidad 12 de Las Moras el lunes a las 10:30. Voy a revisar la disponibilidad y te confirmo por acá.", suggestion_id: "mock-suggestion-1" } }; }
  return apiFetch<{ data: { text: string; suggestion_id: string } }>(
    `/api/v1/admin/conversations/${encodeURIComponent(id)}/suggestion`, { method: "POST" },
  );
}


// QA samples are synthetic and live only in memory during an explicit mock session.
const mockNow = new Date().toISOString();
const mockConversations: ConversationSummary[] = isMockDataMode ? [
  ["Lucía Ferreyra", "WAITING_HUMAN", "WHATSAPP", "¿Podemos visitar la unidad 12 de Las Moras?"],
  ["Tomás Quiroga", "HUMAN_ACTIVE", "WEB_CHAT", "Te paso los detalles de la visita."],
  ["Martina Sosa", "AI_ACTIVE", "WHATSAPP", "Estoy buscando una casa con patio."],
  ["Nicolás Pereyra", "WAITING_TOOL", "WEB_CHAT", "¿Qué unidades quedan disponibles?"],
  ["Camila Funes", "CLOSED", "WHATSAPP", "Gracias por tu ayuda, ¡hasta pronto!"],
].map(([name, state, channel, text], index) => ({
  id: `mock-conversation-${index + 1}`, contact_name: name, state: state as ConversationState,
  channel, epoch: 1, unread: index === 0 ? 2 : 0,
  assigned_user: index === 1 ? { id: "mock-advisor", name: "Santiago Acosta" } : null,
  last_activity_at: mockNow, last_message: { sender: index === 1 ? "USER" : "CONTACT", text },
  waiting_since: index === 0 ? mockNow : null,
})) : [];
const mockThreads = new Map<string, ConversationMessage[]>(mockConversations.map(item => [item.id, [
  { sequence: 1, direction: "INBOUND", sender: "CONTACT", text: "Hola, me interesa Las Moras.", status: "RECEIVED", at: mockNow },
  { sequence: 2, direction: "OUTBOUND", sender: "BOT", text: "¡Hola! Puedo ayudarte con las unidades de Las Moras. ¿Querés coordinar una visita?", status: "READ", at: mockNow },
  ...(item.id === "mock-conversation-2" ? [{ sequence: 3, direction: "OUTBOUND" as const, sender: "USER" as const, text: "Soy Santiago, te ayudo a coordinar la visita.", status: "READ", at: mockNow }] : []),
  { sequence: item.id === "mock-conversation-2" ? 4 : 3, direction: "INBOUND", sender: "CONTACT", text: item.last_message?.text ?? "Hola", status: "RECEIVED", at: mockNow },
]]));
function mockConversation(id: string) {
  const item = mockConversations.find(item => item.id === id);
  if (!item) throw new Error("Conversación de prueba inexistente.");
  return item;
}
function mockMessage(id: string, text: string, key: string, note = false) {
  const item = mockConversation(id);
  const messages = mockThreads.get(id)!;
  const previous = mockSends.get(`${id}:${key}`);
  if (previous !== undefined) return { data: { sequence: previous, replayed: true } };
  const sequence = messages.length + 1;
  const at = new Date().toISOString();
  messages.push({ sequence, direction: note ? "INTERNAL" : "OUTBOUND", sender: "USER", text, status: note ? "RECEIVED" : "SENT", at, author: "Santiago Acosta" });
  mockSends.set(`${id}:${key}`, sequence);
  if (!note) { item.last_message = { sender: "USER", text }; item.last_activity_at = at; }
  return { data: { sequence, replayed: false } };
}
const mockSends = new Map<string, number>();
