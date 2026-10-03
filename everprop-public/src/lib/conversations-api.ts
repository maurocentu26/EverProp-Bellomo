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

export function conversationQuery(filter: ConversationFilter): string {
  const params = new URLSearchParams();
  if (filter === "waiting") params.set("state", "WAITING_HUMAN");
  if (filter === "mine") params.set("mine", "1");
  if (filter === "unread") params.set("unread", "1");
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

export async function listConversations(filter: ConversationFilter) {
  return apiFetch<{ data: ConversationSummary[] }>(conversationQuery(filter));
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
  return apiFetch<{ conversation: { id: string; state: ConversationState; epoch: number; ai_enabled: boolean }; data: ConversationMessage[] }>(
    `/api/v1/admin/conversations/${encodeURIComponent(id)}/messages${after > 0 ? `?after=${after}` : ""}`,
  );
}

export async function takeOver(id: string) {
  return apiFetch<{ data: { state: ConversationState; epoch: number; confirmed: boolean } }>(
    `/api/v1/admin/conversations/${encodeURIComponent(id)}/takeover`,
    { method: "POST" },
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
