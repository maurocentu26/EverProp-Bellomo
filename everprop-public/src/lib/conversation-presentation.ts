import type { ConversationState, ConversationSummary } from "@/lib/conversations-api";

export const CONVERSATION_TABS = [
  ["human", "Para vos"],
  ["ai", "Con la IA"],
  ["closed", "Cerradas"],
] as const;

export type ConversationTab = typeof CONVERSATION_TABS[number][0];

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function leadConversationHref(lead: { id?: string; phone?: string | null; email?: string | null }): string | null {
  const phone = lead.phone?.replace(/\D/g, "") ?? "";
  // Search by suffix tolerates country/mobile prefixes; the advisor still chooses the thread.
  const term = (phone.length >= 4 ? phone.slice(-8) : lead.email?.trim() ?? "").slice(0, 100);
  if (term.length < 2) return null;
  // EVP-91: the lead lets the inbox find its exact WhatsApp thread on the server, or offer to start one.
  const params = new URLSearchParams({ q: term, ...(lead.id && UUID.test(lead.id) ? { lead: lead.id } : {}) });
  // Fragments stay out of server access logs and HTTP referrers.
  return `/admin/conversaciones#${params}`;
}

export function conversationSearchFromHash(hash: string): string {
  const term = new URLSearchParams(hash.replace(/^#/, "")).get("q")?.trim().slice(0, 100) ?? "";
  return term.length >= 2 ? term : "";
}

export function conversationLeadFromHash(hash: string): string | null {
  const lead = new URLSearchParams(hash.replace(/^#/, "")).get("lead") ?? "";
  return UUID.test(lead) ? lead : null;
}

export function visibleConversations(items: ConversationSummary[], tab: ConversationTab, search: string): ConversationSummary[] {
  return search ? items : items.filter(item => conversationTab(item.state) === tab);
}

export function conversationTab(state: ConversationState): ConversationTab {
  if (state === "CLOSED") return "closed";
  return state === "AI_ACTIVE" || state === "WAITING_TOOL" ? "ai" : "human";
}

/** The list has no handoff reason: describe only the state actually returned. */
export function conversationReason(item: Pick<ConversationSummary, "state" | "out_of_hours">): string {
  if (item.state === "WAITING_HUMAN") return item.out_of_hours ? "Espera respuesta · fuera de horario" : "Espera respuesta";
  if (item.state === "TRANSITION_PENDING") return "Esperando control humano";
  if (item.state === "HUMAN_ACTIVE") return "Atención del asesor";
  if (item.state === "CLOSED") return "Conversación cerrada";
  return item.state === "WAITING_TOOL" ? "IA consultando datos" : "Atención automática";
}
