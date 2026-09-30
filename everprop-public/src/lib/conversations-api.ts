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

export async function getConversationMessages(id: string) {
  return apiFetch<{ conversation: { id: string; state: ConversationState; epoch: number; ai_enabled: boolean }; data: ConversationMessage[] }>(
    `/api/v1/admin/conversations/${encodeURIComponent(id)}/messages`,
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
