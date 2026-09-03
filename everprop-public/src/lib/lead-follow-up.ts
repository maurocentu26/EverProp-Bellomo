import type { LeadFollowUp } from "@/data/admin-sample";

const DAY_IN_MS = 24 * 60 * 60 * 1000;
export const FOLLOW_UP_LIMIT_DAYS = 10;
export const FOLLOW_UP_WARNING_DAYS = 2;
export const ARGENTINA_TIME_ZONE = "America/Argentina/Buenos_Aires";

export type LeadFollowUpState = {
  kind: "none" | "current" | "dueSoon" | "overdue";
  title: string;
  detail: string;
  formattedDate?: string;
  formattedDeadline?: string;
  lastContactAt?: string;
  elapsedDays?: number;
  remainingDays?: number;
};

export function isCommercialContact(followUp: LeadFollowUp) {
  return followUp.type !== "note";
}

export function formatArgentinaDateTime(value: string | Date) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "Fecha inválida";

  return new Intl.DateTimeFormat("es-AR", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: ARGENTINA_TIME_ZONE,
  }).format(date);
}

export function toArgentinaDateTimeInputValue(date: Date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
    timeZone: ARGENTINA_TIME_ZONE,
  }).formatToParts(date);
  const valueByType = new Map(parts.map((part) => [part.type, part.value]));

  return `${valueByType.get("year")}-${valueByType.get("month")}-${valueByType.get("day")}T${valueByType.get("hour")}:${valueByType.get("minute")}`;
}

export function argentinaDateTimeInputToIso(value: string) {
  const withSeconds = value.length === 16 ? `${value}:00` : value;
  const date = new Date(`${withSeconds}-03:00`);
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
}

export function getLeadFollowUps(
  followUps: LeadFollowUp[],
  leadId: string,
  companyId?: string,
) {
  return followUps
    .filter((followUp) => (
      followUp.leadId === leadId && (!companyId || followUp.companyId === companyId)
    ))
    .sort((a, b) => new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime());
}

export function getLastCommercialContactAt(
  followUps: LeadFollowUp[],
  leadId: string,
  legacyUpdatedAt?: string,
  companyId?: string,
) {
  const candidates = getLeadFollowUps(followUps, leadId, companyId)
    .filter(isCommercialContact)
    .map((followUp) => followUp.occurredAt);

  if (legacyUpdatedAt) candidates.push(legacyUpdatedAt);

  return candidates.reduce<string | undefined>((latest, value) => {
    const timestamp = new Date(value).getTime();
    if (Number.isNaN(timestamp)) return latest;
    if (!latest || timestamp > new Date(latest).getTime()) return value;
    return latest;
  }, undefined);
}

export function getLeadFollowUpState(
  followUps: LeadFollowUp[],
  leadId: string,
  legacyUpdatedAt?: string,
  now: Date = new Date(),
  companyId?: string,
): LeadFollowUpState {
  const lastContactAt = getLastCommercialContactAt(
    followUps,
    leadId,
    legacyUpdatedAt,
    companyId,
  );

  if (!lastContactAt) {
    return {
      kind: "none",
      title: "Sin seguimiento",
      detail: "Todavía no se registró un contacto comercial.",
    };
  }

  const lastContact = new Date(lastContactAt);
  const deadline = new Date(lastContact.getTime() + FOLLOW_UP_LIMIT_DAYS * DAY_IN_MS);
  const elapsedMs = Math.max(0, now.getTime() - lastContact.getTime());
  const remainingMs = deadline.getTime() - now.getTime();
  const elapsedDays = Math.floor(elapsedMs / DAY_IN_MS);
  const formattedDate = formatArgentinaDateTime(lastContact);
  const formattedDeadline = formatArgentinaDateTime(deadline);

  if (remainingMs < 0) {
    const overdueDays = Math.max(1, Math.ceil(Math.abs(remainingMs) / DAY_IN_MS));
    return {
      kind: "overdue",
      title: "Vencido",
      detail: `Venció hace ${overdueDays} ${overdueDays === 1 ? "día" : "días"}`,
      formattedDate,
      formattedDeadline,
      lastContactAt,
      elapsedDays,
      remainingDays: 0,
    };
  }

  const remainingDays = Math.ceil(remainingMs / DAY_IN_MS);
  if (remainingMs <= FOLLOW_UP_WARNING_DAYS * DAY_IN_MS) {
    return {
      kind: "dueSoon",
      title: "Próximo a vencer",
      detail: remainingDays === 0
        ? "Vence hoy"
        : `Vence en ${remainingDays} ${remainingDays === 1 ? "día" : "días"}`,
      formattedDate,
      formattedDeadline,
      lastContactAt,
      elapsedDays,
      remainingDays,
    };
  }

  return {
    kind: "current",
    title: "Al día",
    detail: elapsedDays === 0
      ? "Último contacto hoy"
      : `Último contacto hace ${elapsedDays} ${elapsedDays === 1 ? "día" : "días"}`,
    formattedDate,
    formattedDeadline,
    lastContactAt,
    elapsedDays,
    remainingDays,
  };
}
