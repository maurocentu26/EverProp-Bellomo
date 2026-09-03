import type { Lead, LeadFollowUp, Property, Project } from "@/data/admin-sample";

export const ADMIN_STORAGE_KEYS = {
  leads: "everprop:leads:v2",
  properties: "everprop:properties:v2",
  projects: "everprop:projects:v2",
  leadFollowUps: "everprop:lead-follow-ups:v1",
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

export function updateLeadAgent(leadId: string, agentId: string | undefined, seed: Lead[], companyId: string = "c1") {
  const stored = readList<Lead>(ADMIN_STORAGE_KEYS.leads);
  const source = stored.length > 0 ? stored : seed;
  const current = source.filter((lead) => lead.companyId === companyId);
  const otherCompanyLeads = source.filter((lead) => lead.companyId !== companyId);
  const next = current.map(lead => lead.id === leadId ? { ...lead, agentId } : lead);
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
