import type { commercialQueueGroups } from "./commercial-queue";

export type DayPriority = ReturnType<typeof commercialQueueGroups>["all"][number];

export function dayPriorities(queue: DayPriority[]) {
  return queue.filter(item => item.priorityWeight > 0).slice(0, 4);
}

export function priorityReason(item: DayPriority) {
  if (item.isOverdue) return item.state?.detail || "El seguimiento está vencido. Retomá el contacto.";
  if (item.isDueToday) return "Tenés un contacto comprometido para hoy.";
  if (item.isNew) return "Espera tu primera respuesta.";
  return "Revisá el seguimiento y acordá el próximo paso.";
}

export function claimDayGuide(storage: Pick<Storage, "getItem" | "setItem">, key: string, day: string) {
  if (storage.getItem(key) === day) return false;
  storage.setItem(key, day);
  return true;
}

export function leadInitials(name: string) {
  return name.trim().split(/\s+/).filter(Boolean).slice(0, 2).map(part => part[0]).join("").toLocaleUpperCase("es-AR");
}
