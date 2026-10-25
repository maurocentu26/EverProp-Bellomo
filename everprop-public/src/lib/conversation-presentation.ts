import type { ConversationState, ConversationSummary } from "@/lib/conversations-api";

export const CONVERSATION_TABS = [
  ["human", "Para vos"],
  ["ai", "Con la IA"],
  ["closed", "Cerradas"],
] as const;

export type ConversationTab = typeof CONVERSATION_TABS[number][0];

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
