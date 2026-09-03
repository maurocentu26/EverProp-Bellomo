export type Stage = "new" | "contacted" | "visiting" | "negotiation" | "closing";

export const STAGE_ORDER: Stage[] = ["new", "contacted", "visiting", "negotiation", "closing"];

export const STAGE_LABELS: Record<Stage, string> = {
  new: "Nuevo",
  contacted: "Contactado",
  visiting: "Visitando",
  negotiation: "Negociación",
  closing: "Cerrando",
};
