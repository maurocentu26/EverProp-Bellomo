import { apiFetch } from "@/lib/everprop-api";

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
  last_message?: { text: string | null; sender: "CONTACT" | "USER" | "BOT" | "SYSTEM" | string } | null;
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
};

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

export const CHANNEL_LABELS: Record<string, string> = { WHATSAPP: "WhatsApp", WEB_CHAT: "Chat web" };

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
  return `${who[last.sender] ?? ""}${last.text?.replace(/\s+/g, " ").trim() || "[contenido no textual]"}`;
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
  return apiFetch<{ conversation: { id: string; state: ConversationState; epoch: number; ai_enabled: boolean; reply_window: { closes_at: string | null } | null }; data: ConversationMessage[] }>(
    `/api/v1/admin/conversations/${encodeURIComponent(id)}/messages${after > 0 ? `?after=${after}` : ""}`,
  );
}

export async function takeOver(id: string) {
  return apiFetch<{ data: { state: ConversationState; epoch: number; confirmed: boolean } }>(
    `/api/v1/admin/conversations/${encodeURIComponent(id)}/takeover`,
    { method: "POST" },
  );
}

/** Team-only note: never sent to the customer. */
export async function addNote(id: string, text: string, idempotencyKey: string) {
  return apiFetch<{ data: { sequence: number; replayed: boolean } }>(
    `/api/v1/admin/conversations/${encodeURIComponent(id)}/notes`,
    { method: "POST", body: JSON.stringify({ text, idempotency_key: idempotencyKey }) },
  );
}

export async function resumeAi(id: string, reason: string) {
  return apiFetch(`/api/v1/admin/conversations/${encodeURIComponent(id)}/resume`, {
    method: "POST",
    body: JSON.stringify({ reason }),
  });
}

export async function closeConversation(id: string) {
  return apiFetch(`/api/v1/admin/conversations/${encodeURIComponent(id)}/close`, { method: "POST" });
}

export async function resolveUnknownSends(id: string) {
  return apiFetch<{ data: { resolved: number; warning: string } }>(
    `/api/v1/admin/conversations/${encodeURIComponent(id)}/resolve-unknown`,
    { method: "POST" },
  );
}

/** The idempotency key belongs to the draft: a retry of the same text reuses it. */
export async function sendReply(id: string, text: string, idempotencyKey: string) {
  return apiFetch<{ data: { sequence: number; replayed: boolean } }>(
    `/api/v1/admin/conversations/${encodeURIComponent(id)}/messages`,
    { method: "POST", body: JSON.stringify({ text, idempotency_key: idempotencyKey }) },
  );
}
