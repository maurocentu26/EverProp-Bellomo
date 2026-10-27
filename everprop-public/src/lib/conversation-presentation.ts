import type { ConversationState, ConversationSummary } from "@/lib/conversations-api";

export const CONVERSATION_TABS = [
  ["human", "Para vos"],
  ["ai", "Con la IA"],
  ["closed", "Cerradas"],
] as const;

export type ConversationTab = typeof CONVERSATION_TABS[number][0];

export function leadConversationHref(lead: { phone?: string | null; email?: string | null }): string | null {
  const phone = lead.phone?.replace(/\D/g, "") ?? "";
  // Search by suffix tolerates country/mobile prefixes; the advisor still chooses the thread.
  const term = (phone.length >= 4 ? phone.slice(-8) : lead.email?.trim() ?? "").slice(0, 100);
  // Fragments stay out of server access logs and HTTP referrers.
  return term.length >= 2 ? `/admin/conversaciones#${new URLSearchParams({ q: term })}` : null;
}

export function conversationSearchFromHash(hash: string): string {
  const term = new URLSearchParams(hash.replace(/^#/, "")).get("q")?.trim().slice(0, 100) ?? "";
  return term.length >= 2 ? term : "";
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
