import { apiFetch } from "@/lib/everprop-api";

export type KnowledgeStatus = "DRAFT" | "APPROVED" | "REVOKED";

export type KnowledgeDocument = {
  id: string;
  title: string;
  audience: "PUBLIC" | "INTERNAL";
  status: KnowledgeStatus;
  version: number;
  valid_until: string | null;
  approved_at: string | null;
  updated_at: string;
};

export type VisitRequestStatus = "REQUESTED" | "CONFIRMED" | "DECLINED" | "CANCELLED";

export type VisitRequest = {
  id: string;
  status: VisitRequestStatus;
  created_at: string;
  slots: { start_utc: string; end_utc: string; timezone: string }[];
  note: string | null;
  property: { id: string; code: string | null; title: string };
  contact: { name: string | null; phone: string | null; email: string | null; unverified: string[] };
  conversation_id: string;
  visit_id: string | null;
};

export const KNOWLEDGE_STATUS_LABELS: Record<KnowledgeStatus, string> = {
  DRAFT: "Borrador (el asistente no la usa)",
  APPROVED: "Aprobada",
  REVOKED: "Revocada",
};

/** A slot in the visitor's own time zone, e.g. "jue 02/10 10:00–11:00 (America/Argentina/Jujuy)". */
export function formatSlot(slot: VisitRequest["slots"][number]): string {
  const opts: Intl.DateTimeFormatOptions = { timeZone: slot.timezone, hour: "2-digit", minute: "2-digit" };
  const day = new Intl.DateTimeFormat("es-AR", { timeZone: slot.timezone, weekday: "short", day: "2-digit", month: "2-digit" }).format(new Date(slot.start_utc));
  const from = new Intl.DateTimeFormat("es-AR", opts).format(new Date(slot.start_utc));
  const to = new Intl.DateTimeFormat("es-AR", opts).format(new Date(slot.end_utc));
  return `${day} ${from}–${to} (${slot.timezone})`;
}

/** datetime-local value ("2026-10-02T10:00") for the slot start, in the browser's zone. */
export function slotToLocalInput(startUtc: string): string {
  const d = new Date(startUtc);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export const listKnowledge = () => apiFetch<{ data: KnowledgeDocument[] }>("/api/v1/admin/knowledge");

export const createKnowledge = (input: { title: string; body: string; audience: "PUBLIC" | "INTERNAL"; valid_until?: string }) =>
  apiFetch<{ data: { id: string; status: KnowledgeStatus } }>("/api/v1/admin/knowledge", { method: "POST", body: JSON.stringify(input) });

export const approveKnowledge = (id: string) =>
  apiFetch(`/api/v1/admin/knowledge/${encodeURIComponent(id)}/approve`, { method: "POST" });

export const revokeKnowledge = (id: string) =>
  apiFetch(`/api/v1/admin/knowledge/${encodeURIComponent(id)}/revoke`, { method: "POST" });

export const listVisitRequests = (status: VisitRequestStatus = "REQUESTED") =>
  apiFetch<{ data: VisitRequest[] }>(`/api/v1/admin/visit-requests?status=${status}`);

export const confirmVisitRequest = (id: string, scheduledAtIso: string, notes?: string) =>
  apiFetch<{ data: { visit_id: string } }>(`/api/v1/admin/visit-requests/${encodeURIComponent(id)}/confirm`, {
    method: "POST",
    body: JSON.stringify({ scheduled_at: scheduledAtIso, notes }),
  });

export const declineVisitRequest = (id: string) =>
  apiFetch(`/api/v1/admin/visit-requests/${encodeURIComponent(id)}/decline`, { method: "POST" });
