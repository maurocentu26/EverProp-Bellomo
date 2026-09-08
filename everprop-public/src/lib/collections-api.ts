import type { PaymentAgreement, Installment, Lead } from "@/data/admin-sample";
import * as local from "@/lib/admin-storage";
import { apiFetch } from "@/lib/everprop-api";
import { isMockDataMode } from "@/lib/data-mode";

const root = "/api/v1/admin";
type Page<T> = { data: T[]; meta: { last_page: number } };

async function allPages<T>(path: string): Promise<T[]> {
  const rows: T[] = [];
  let page = 1;
  let last = 1;
  do {
    const result = await apiFetch<Page<T>>(`${root}/${path}${path.includes("?") ? "&" : "?"}page=${page}`);
    rows.push(...result.data);
    last = result.meta.last_page;
    page++;
  } while (page <= last);
  return rows;
}

export async function loadPaymentAgreementList(seed: PaymentAgreement[], companyId = "c1", leadId?: string) {
  if (isMockDataMode) return local.loadPaymentAgreementList(seed, companyId);
  return allPages<PaymentAgreement>(`payment-agreements${leadId ? `?leadId=${encodeURIComponent(leadId)}` : ""}`);
}

export async function loadInstallmentList(seed: Installment[], companyId = "c1", leadId?: string) {
  if (isMockDataMode) return local.loadInstallmentList(seed, companyId);
  return allPages<Installment>(`installments${leadId ? `?leadId=${encodeURIComponent(leadId)}` : ""}`);
}

export async function loadCollectionLeads(): Promise<Lead[]> {
  const rows = await allPages<Pick<Lead, "id" | "name" | "phone" | "agentId">>("collections/leads");
  return rows.map(row => ({ ...row, name: row.name || "Cliente", companyId: "", origin: "crm", propertyIds: [], stage: "new", lastActivity: "" }));
}

export function collectionsUpdated() {
  window.dispatchEvent(new Event("everprop_agreements_updated"));
  try {
    const channel = new BroadcastChannel("everprop_agreements");
    channel.postMessage("updated");
    channel.close();
  } catch { /* Same-window refresh remains available. */ }
}

// Retain only a payload fingerprint and request key across uncertain network failures.
// A retry (including after refresh) reuses the key; no financial payload is cached.
async function mutationKey(path: string, payload: unknown) {
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(JSON.stringify(payload)));
  const fingerprint = Array.from(new Uint8Array(bytes), b => b.toString(16).padStart(2, "0")).join("");
  const storageKey = `everprop:collection-request:${path}:${fingerprint}`;
  const key = sessionStorage.getItem(storageKey) || crypto.randomUUID();
  sessionStorage.setItem(storageKey, key);
  return { key, complete: () => sessionStorage.removeItem(storageKey) };
}

type AgreementInput = Parameters<typeof local.createAgreementWithInstallments>[0] & { monthlyRatePct?: number };
export async function createAgreementWithInstallments(data: AgreementInput, agreements: PaymentAgreement[], installments: Installment[], companyId = "c1") {
  if (isMockDataMode) return local.createAgreementWithInstallments(data, agreements, installments, companyId);
  if (data.modality !== "FIXED") throw new Error("Los acuerdos online admiten cuotas fijas. CAC y escalonado requieren reglas de ajuste aprobadas.");
  // Advisor and tenant are resolved by Laravel from the authenticated user and real lead.
  const { advisorId, financedBalance, ...payload } = data;
  void advisorId; void financedBalance;
  const request = await mutationKey("agreements", payload);
  const result = await apiFetch<{ data: PaymentAgreement }>(`${root}/payment-agreements`, {
    method: "POST", body: JSON.stringify({ ...payload, idempotencyKey: request.key }),
  });
  const updated = await loadInstallmentList([], companyId);
  request.complete();
  collectionsUpdated();
  return { agreement: result.data, installments: updated };
}

export async function recordInstallmentPayment(id: string, data: Parameters<typeof local.recordInstallmentPayment>[1], seed: Installment[], companyId = "c1") {
  if (isMockDataMode) return local.recordInstallmentPayment(id, data, seed, companyId);
  const request = await mutationKey(`payment:${id}`, data);
  await apiFetch(`${root}/installments/${encodeURIComponent(id)}/payments`, {
    method: "POST", body: JSON.stringify({ ...data, idempotencyKey: request.key }),
  });
  const updated = await loadInstallmentList([], companyId);
  request.complete();
  collectionsUpdated();
  return updated;
}

export type CollectionPayment = {
  id: string; amount: string; method: string; receiptNumber: string; paidAt: string;
  notes?: string; reversedAt?: string; reversalReason?: string;
};
export async function loadPayments(installmentId: string) {
  return (await apiFetch<{ data: CollectionPayment[] }>(`${root}/installments/${encodeURIComponent(installmentId)}/payments`)).data;
}
export async function reversePayment(paymentId: string, reason: string) {
  await apiFetch(`${root}/payments/${encodeURIComponent(paymentId)}/reverse`, { method: "POST", body: JSON.stringify({ reason }) });
  collectionsUpdated();
}
