import type { Lead, LeadFollowUp, Property, Project, PaymentAgreement, Installment, InstallmentPaymentMethod } from "@/data/admin-sample";
import { evaluateInstallmentStatus, getTodayDateString, formatInstallmentAmount, formatDueDate } from "@/lib/installment-notifications";
import { createNotification } from "@/lib/notifications";

export const ADMIN_STORAGE_KEYS = {
  leads: "everprop:leads:v2",
  properties: "everprop:properties:v2",
  projects: "everprop:projects:v2",
  leadFollowUps: "everprop:lead-follow-ups:v1",
  paymentAgreements: "everprop:agreements:v1",
  installments: "everprop:installments:v1",
} as const;

function readList<T>(key: string): T[] {
  if (typeof window === "undefined") return [];

  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return [];

    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function loadLeadList(seed: Lead[], companyId: string) {
  const stored = readList<Lead>(ADMIN_STORAGE_KEYS.leads);
  const source = stored.length > 0 ? stored : seed;
  return source.filter((lead) => lead.companyId === companyId);
}

export function loadPropertyList(seed: Property[], companyId: string) {
  const stored = readList<Property>(ADMIN_STORAGE_KEYS.properties);
  const source = stored.length > 0 ? stored : seed;
  return source.filter((property) => property.companyId === companyId);
}

export function loadProjectList(seed: Project[], companyId: string) {
  const stored = readList<Project>(ADMIN_STORAGE_KEYS.projects);
  const source = stored.length > 0 ? stored : seed;
  return source.filter((project) => project.companyId === companyId);
}

export function appendLeadToStorage(nextLead: Lead, seed: Lead[], companyId: string) {
  if (nextLead.companyId !== companyId) {
    throw new Error("El lead no pertenece a la empresa activa.");
  }

  const stored = readList<Lead>(ADMIN_STORAGE_KEYS.leads);
  const source = stored.length > 0 ? stored : seed;
  const companyLeads = source.filter((lead) => lead.companyId === companyId);
  const otherCompanyLeads = source.filter((lead) => lead.companyId !== companyId);
  const next = [...companyLeads, nextLead];

  if (typeof window !== "undefined") {
    window.localStorage.setItem(ADMIN_STORAGE_KEYS.leads, JSON.stringify([...otherCompanyLeads, ...next]));
  }

  return next;
}

export function appendPropertyToStorage(nextProperty: Property, seed: Property[], companyId: string) {
  if (nextProperty.companyId !== companyId) {
    throw new Error("La propiedad no pertenece a la empresa activa.");
  }

  const stored = readList<Property>(ADMIN_STORAGE_KEYS.properties);
  const source = stored.length > 0 ? stored : seed;
  const current = source.filter((property) => property.companyId === companyId);
  const otherCompanyProperties = source.filter((property) => property.companyId !== companyId);
  const next = [...current, nextProperty];
  window.localStorage.setItem(
    ADMIN_STORAGE_KEYS.properties,
    JSON.stringify([...otherCompanyProperties, ...next]),
  );
  return next;
}

export function loadLeadFollowUpList(seed: LeadFollowUp[], companyId: string) {
  const stored = readList<LeadFollowUp>(ADMIN_STORAGE_KEYS.leadFollowUps);
  const source = stored.length > 0 ? stored : seed;
  return source.filter((followUp) => followUp.companyId === companyId);
}

export function appendProjectToStorage(nextProject: Project, seed: Project[], companyId: string) {
  if (nextProject.companyId !== companyId) {
    throw new Error("El proyecto no pertenece a la empresa activa.");
  }

  const stored = readList<Project>(ADMIN_STORAGE_KEYS.projects);
  const source = stored.length > 0 ? stored : seed;
  const current = source.filter((project) => project.companyId === companyId);
  const otherCompanyProjects = source.filter((project) => project.companyId !== companyId);
  const next = [...current, nextProject];
  window.localStorage.setItem(
    ADMIN_STORAGE_KEYS.projects,
    JSON.stringify([...otherCompanyProjects, ...next]),
  );
  return next;
}

export function appendLeadFollowUpToStorage(
  nextFollowUp: LeadFollowUp,
  seed: LeadFollowUp[],
  companyId: string,
) {
  if (nextFollowUp.companyId !== companyId) {
    throw new Error("El seguimiento no pertenece a la empresa activa.");
  }

  const stored = readList<LeadFollowUp>(ADMIN_STORAGE_KEYS.leadFollowUps);
  const source = stored.length > 0 ? stored : seed;
  const companyFollowUps = source.filter((followUp) => followUp.companyId === companyId);
  const otherCompanyFollowUps = source.filter((followUp) => followUp.companyId !== companyId);
  const next = [nextFollowUp, ...companyFollowUps];

  if (typeof window !== "undefined") {
    window.localStorage.setItem(
      ADMIN_STORAGE_KEYS.leadFollowUps,
      JSON.stringify([...otherCompanyFollowUps, ...next]),
    );
  }

  return next;
}

export function updateLeadAgent(leadId: string, agentId: string | undefined, seed: Lead[], companyId: string = "c1", agentName?: string) {
  const stored = readList<Lead>(ADMIN_STORAGE_KEYS.leads);
  const source = stored.length > 0 ? stored : seed;
  const current = source.filter((lead) => lead.companyId === companyId);
  const otherCompanyLeads = source.filter((lead) => lead.companyId !== companyId);
  const next = current.map(lead => lead.id === leadId ? { ...lead, agentId, ...(agentName !== undefined ? { agentName } : {}) } : lead);
  window.localStorage.setItem(ADMIN_STORAGE_KEYS.leads, JSON.stringify([...otherCompanyLeads, ...next]));
  return next;
}

export function saveLeadList(list: Lead[], companyId?: string) {
  if (typeof window === "undefined") return;

  const targetCompanyIds = new Set(companyId ? [companyId] : list.map((lead) => lead.companyId));
  if (companyId && list.some((lead) => lead.companyId !== companyId)) {
    throw new Error("La lista contiene leads de otra empresa.");
  }

  const stored = readList<Lead>(ADMIN_STORAGE_KEYS.leads);
  const otherCompanyLeads = stored.filter((lead) => !targetCompanyIds.has(lead.companyId));
  window.localStorage.setItem(ADMIN_STORAGE_KEYS.leads, JSON.stringify([...otherCompanyLeads, ...list]));
}

export function savePropertyList(list: Property[], companyId?: string) {
  if (typeof window === "undefined") return;

  const targetCompanyIds = new Set(companyId ? [companyId] : list.map((property) => property.companyId));
  if (companyId && list.some((property) => property.companyId !== companyId)) {
    throw new Error("La lista contiene propiedades de otra empresa.");
  }

  const stored = readList<Property>(ADMIN_STORAGE_KEYS.properties);
  const otherCompanyProperties = stored.filter(
    (property) => !targetCompanyIds.has(property.companyId),
  );
  window.localStorage.setItem(
    ADMIN_STORAGE_KEYS.properties,
    JSON.stringify([...otherCompanyProperties, ...list]),
  );
}

export function saveProjectList(list: Project[], companyId?: string) {
  if (typeof window === "undefined") return;

  const targetCompanyIds = new Set(companyId ? [companyId] : list.map((project) => project.companyId));
  if (companyId && list.some((project) => project.companyId !== companyId)) {
    throw new Error("La lista contiene proyectos de otra empresa.");
  }

  const stored = readList<Project>(ADMIN_STORAGE_KEYS.projects);
  const otherCompanyProjects = stored.filter((project) => !targetCompanyIds.has(project.companyId));
  window.localStorage.setItem(
    ADMIN_STORAGE_KEYS.projects,
    JSON.stringify([...otherCompanyProjects, ...list]),
  );
}

export function removeVisitById(visitId: string, seedLeads: Lead[], seedProperties: Property[], companyId = "c1") {
  if (typeof window === "undefined") return { leads: seedLeads, properties: seedProperties };

  const leads = loadLeadList(seedLeads, companyId);
  const properties = loadPropertyList(seedProperties, companyId);

  const nextLeads = leads.map((lead) => ({ ...lead, visits: (lead.visits ?? []).filter((v) => v.id !== visitId) }));
  const nextProperties = properties.map((prop) => ({ ...prop, visits: (prop.visits ?? []).filter((v) => v.id !== visitId) }));

  saveLeadList(nextLeads, companyId);
  savePropertyList(nextProperties, companyId);

  return { leads: nextLeads, properties: nextProperties };
}

// ── Payment Agreements & Installments ──

export function loadPaymentAgreementList(seed: PaymentAgreement[], companyId: string = "c1"): PaymentAgreement[] {
  const stored = readList<PaymentAgreement>(ADMIN_STORAGE_KEYS.paymentAgreements);
  const source = stored.length > 0 ? stored : seed;
  return source.filter((item) => item.companyId === companyId);
}

export function savePaymentAgreementList(list: PaymentAgreement[], companyId?: string): void {
  if (typeof window === "undefined") return;

  const targetCompanyIds = new Set(companyId ? [companyId] : list.map((a) => a.companyId));
  const stored = readList<PaymentAgreement>(ADMIN_STORAGE_KEYS.paymentAgreements);
  const others = stored.filter((a) => !targetCompanyIds.has(a.companyId));
  window.localStorage.setItem(
    ADMIN_STORAGE_KEYS.paymentAgreements,
    JSON.stringify([...others, ...list]),
  );
}

export function appendPaymentAgreementToStorage(
  agreement: PaymentAgreement,
  seed: PaymentAgreement[],
  companyId: string = "c1"
): PaymentAgreement[] {
  const current = loadPaymentAgreementList(seed, companyId);
  const next = [agreement, ...current];
  savePaymentAgreementList(next, companyId);
  return next;
}

export function loadInstallmentList(seed: Installment[], companyId: string = "c1"): Installment[] {
  const stored = readList<Installment>(ADMIN_STORAGE_KEYS.installments);
  const source = stored.length > 0 ? stored : seed;
  return source.filter((inst) => (inst.companyId || "c1") === companyId);
}

export function saveInstallmentList(list: Installment[], companyId: string = "c1"): void {
  if (typeof window === "undefined") return;

  const stored = readList<Installment>(ADMIN_STORAGE_KEYS.installments);
  const others = stored.filter((inst) => (inst.companyId || "c1") !== companyId);
  window.localStorage.setItem(
    ADMIN_STORAGE_KEYS.installments,
    JSON.stringify([...others, ...list]),
  );
}

export function appendInstallmentsToStorage(
  newInstallments: Installment[],
  seed: Installment[],
  companyId: string = "c1"
): Installment[] {
  const current = loadInstallmentList(seed, companyId);
  const next = [...current, ...newInstallments];
  saveInstallmentList(next, companyId);
  return next;
}

export function recordInstallmentPayment(
  installmentId: string,
  paymentData: {
    amountPaid: number;
    paymentReceiptNumber: string;
    paymentMethod: InstallmentPaymentMethod;
    notes?: string;
    paidAt?: string;
  },
  seed: Installment[],
  companyId: string = "c1"
): Installment[] {
  const current = loadInstallmentList(seed, companyId);
  const next = current.map((inst) => {
    if (inst.id !== installmentId) return inst;
    return {
      ...inst,
      status: "PAID" as const,
      daysOverdue: 0,
      amountPaid: paymentData.amountPaid,
      paymentReceiptNumber: paymentData.paymentReceiptNumber,
      paymentMethod: paymentData.paymentMethod,
      paidAt: paymentData.paidAt || getTodayDateString(),
      notes: paymentData.notes ? `${inst.notes ? inst.notes + " | " : ""}${paymentData.notes}` : inst.notes,
    };
  });
  saveInstallmentList(next, companyId);
  return next;
}

/**
 * Creates an agreement and automatically generates its schedule of installments.
 */
export function createAgreementWithInstallments(
  agreementData: {
    leadId: string;
    advisorId?: string;
    propertyId?: string;
    propertyTitle?: string;
    projectName?: string;
    currency: "ARS" | "USD";
    modality: "FIXED" | "CAC" | "STEPPED";
    totalPrice: number;
    downPayment: number;
    financedBalance: number;
    totalInstallments: number;
    dayOfMonthDue: number;
    startDate: string; // YYYY-MM-DD
    notes?: string;
  },
  seedAgreements: PaymentAgreement[],
  seedInstallments: Installment[],
  companyId: string = "c1"
): { agreement: PaymentAgreement; installments: Installment[] } {
  const agreementId = `agr-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
  const publicId = `ACU-${new Date().getFullYear()}-${Math.floor(1000 + Math.random() * 9000)}`;
  const nowIso = new Date().toISOString();

  const newAgreement: PaymentAgreement = {
    id: agreementId,
    publicId,
    companyId,
    leadId: agreementData.leadId,
    advisorId: agreementData.advisorId,
    propertyId: agreementData.propertyId,
    propertyTitle: agreementData.propertyTitle,
    projectName: agreementData.projectName,
    currency: agreementData.currency,
    modality: agreementData.modality,
    totalPrice: agreementData.totalPrice,
    downPayment: agreementData.downPayment,
    financedBalance: agreementData.financedBalance,
    totalInstallments: agreementData.totalInstallments,
    dayOfMonthDue: agreementData.dayOfMonthDue,
    status: "ACTIVE",
    startDate: agreementData.startDate,
    notes: agreementData.notes,
    createdAt: nowIso,
    updatedAt: nowIso,
  };

  // Generate monthly installments
  const perInstallmentAmount = Math.round(agreementData.financedBalance / Math.max(1, agreementData.totalInstallments));
  const startParts = agreementData.startDate.split("-");
  const startYear = parseInt(startParts[0], 10);
  const startMonth = parseInt(startParts[1], 10) - 1;
  const dueDay = agreementData.dayOfMonthDue || 10;

  const generatedInstallments: Installment[] = [];

  for (let i = 1; i <= agreementData.totalInstallments; i++) {
    const dueDateObj = new Date(startYear, startMonth + i, dueDay);
    const y = dueDateObj.getFullYear();
    const m = String(dueDateObj.getMonth() + 1).padStart(2, "0");
    const d = String(dueDateObj.getDate()).padStart(2, "0");
    const dueDateStr = `${y}-${m}-${d}`;

    generatedInstallments.push({
      id: `inst-${agreementId}-${i}`,
      agreementId,
      leadId: agreementData.leadId,
      advisorId: agreementData.advisorId,
      companyId,
      installmentNumber: i,
      dueDate: dueDateStr,
      amountExpected: perInstallmentAmount,
      currency: agreementData.currency,
      status: "PENDING",
      daysOverdue: 0,
      noticeCount: 0,
    });
  }

  appendPaymentAgreementToStorage(newAgreement, seedAgreements, companyId);
  const updatedInstallments = appendInstallmentsToStorage(generatedInstallments, seedInstallments, companyId);

  return { agreement: newAgreement, installments: updatedInstallments };
}

/**
 * Scans installments, updates live statuses (OVERDUE, DUE_TODAY) and triggers notifications to advisors for newly due or overdue installments.
 */
export function evaluateInstallmentsAndNotify(
  agreements: PaymentAgreement[],
  installments: Installment[],
  leads: Lead[],
  companyId: string = "c1"
): { installments: Installment[]; hasChanges: boolean } {
  const todayStr = getTodayDateString();
  let hasChanges = false;

  const evaluated = installments.map((inst) => {
    if (inst.status === "PAID" || inst.status === "CANCELLED") {
      return inst;
    }

    const { status, daysOverdue } = evaluateInstallmentStatus(inst, todayStr);

    if (inst.status !== status || inst.daysOverdue !== daysOverdue) {
      hasChanges = true;
      return { ...inst, status, daysOverdue };
    }

    return inst;
  });

  if (hasChanges) {
    saveInstallmentList(evaluated, companyId);
  }

  // Check if we need to dispatch notifications to advisors
  if (typeof window !== "undefined") {
    evaluated.forEach((inst) => {
      if (inst.status === "OVERDUE" || inst.status === "DUE_TODAY") {
        const notifKey = `everprop:installment-notified:${inst.id}:${todayStr}:${inst.status}`;
        const alreadyNotified = window.localStorage.getItem(notifKey);

        if (!alreadyNotified) {
          const agreement = agreements.find((a) => a.id === inst.agreementId);
          const lead = leads.find((l) => l.id === inst.leadId);
          const advisorId = inst.advisorId || agreement?.advisorId || lead?.agentId || "usr-sales";
          const leadName = lead?.name || "Cliente";
          const amountStr = formatInstallmentAmount(inst.amountExpected, inst.currency);
          const totalInst = agreement?.totalInstallments || 1;

          if (inst.status === "OVERDUE") {
            createNotification(
              advisorId,
              `La cuota ${inst.installmentNumber}/${totalInst} de ${leadName} por ${amountStr} tiene ${inst.daysOverdue} días de mora.`,
              {
                title: `Cuota en mora · ${leadName}`,
                leadId: inst.leadId,
                actionUrl: `/admin/cobranzas?status=overdue&leadId=${inst.leadId}`,
                eventType: "PAYMENT_OVERDUE",
              }
            );
          } else if (inst.status === "DUE_TODAY") {
            createNotification(
              advisorId,
              `Hoy vence la cuota ${inst.installmentNumber}/${totalInst} de ${leadName} por ${amountStr}.`,
              {
                title: `Vencimiento de hoy · ${leadName}`,
                leadId: inst.leadId,
                actionUrl: `/admin/cobranzas?status=dueToday&leadId=${inst.leadId}`,
                eventType: "PAYMENT_DUE_TODAY",
              }
            );
          }

          try {
            window.localStorage.setItem(notifKey, "true");
          } catch {
            // ignore
          }
        }
      }
    });
  }

  return { installments: evaluated, hasChanges };
}
