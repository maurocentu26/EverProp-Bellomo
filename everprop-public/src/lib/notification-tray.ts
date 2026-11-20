// EVP-119: how the bell tray classifies, labels and groups notifications. Pure: no imports, tested in tests/notification-tray.test.mjs.

export type NotificationKind = "conv" | "lead" | "visit" | "pay" | "sys";
export type DayGroup = "Hoy" | "Ayer" | "Anteriores";

const TZ = "America/Argentina/Buenos_Aires";
// ponytail: "Para mí" is inferred from event_type until notifications carry who they are about. Unknown types stay in "Para mí" so nothing directed gets hidden.
const TEAM_EVENTS = /^(LEAD_CREATED_UNASSIGNED|PUBLIC_LEAD_RECEIVED|FOLLOW_UP_TEAM|INTEGRATION_|WEBHOOK_|SIMULATION|INFO)/;

const upper = (eventType?: string | null) => (eventType ?? "").toUpperCase();

export function isForMe(eventType?: string | null): boolean {
  const type = upper(eventType);
  return type !== "" && !TEAM_EVENTS.test(type);
}

export function notificationKind(eventType?: string | null): NotificationKind {
  const type = upper(eventType);
  if (/^(CONVERSATION|MESSAGE)_/.test(type)) return "conv";
  if (/^VISIT_/.test(type)) return "visit";
  if (/^(INSTALLMENT|PAYMENT)_/.test(type)) return "pay";
  if (/^(LEAD|PUBLIC_LEAD|FOLLOW_UP)_|^REENGAGE$/.test(type)) return "lead";
  return "sys";
}

export const KIND_LABEL: Record<NotificationKind, string> = {
  conv: "Conversaciones", lead: "Leads", visit: "Visitas", pay: "Cobranzas", sys: "Sistema",
};

export function urgencyLabel(eventType?: string | null): string | null {
  switch (upper(eventType)) {
    case "INSTALLMENT_OVERDUE": case "PAYMENT_OVERDUE": return "Vencida";
    case "INSTALLMENT_DUE_TODAY": case "PAYMENT_DUE_TODAY": return "Vence hoy";
    case "CONVERSATION_NEEDS_ATTENTION": return "Sin responder";
    case "INTEGRATION_REVOKED": return "Requiere acción";
    default: return null;
  }
}

const dayKey = (date: Date) => date.toLocaleDateString("en-CA", { timeZone: TZ });

export function dayGroup(timestamp: string, now = new Date()): DayGroup {
  const key = dayKey(new Date(timestamp));
  if (key === dayKey(now)) return "Hoy";
  // Argentina has no DST, so "yesterday" is always 24 h back.
  if (key === dayKey(new Date(now.getTime() - 86_400_000))) return "Ayer";
  return "Anteriores";
}

export function timeLabel(timestamp: string, now = new Date()): string {
  const date = new Date(timestamp);
  const minutes = Math.floor((now.getTime() - date.getTime()) / 60_000);
  if (minutes < 1) return "Recién";
  if (minutes < 60) return `hace ${minutes} min`;
  const time = date.toLocaleTimeString("es-AR", { timeZone: TZ, hour: "2-digit", minute: "2-digit", hour12: false });
  const group = dayGroup(timestamp, now);
  if (group === "Hoy") return time;
  if (group === "Ayer") return `ayer, ${time}`;
  return `${date.toLocaleDateString("es-AR", { timeZone: TZ, day: "numeric", month: "short" })}, ${time}`;
}

export function groupByDay<T extends { timestamp: string }>(items: T[], now = new Date()): { label: DayGroup; items: T[] }[] {
  const newestFirst = [...items].sort((a, b) => Date.parse(b.timestamp) - Date.parse(a.timestamp));
  return (["Hoy", "Ayer", "Anteriores"] as const)
    .map((label) => ({ label, items: newestFirst.filter((item) => dayGroup(item.timestamp, now) === label) }))
    .filter((group) => group.items.length > 0);
}
