import type { Project, Property, Lead, LeadFollowUp, LeadFollowUpType, LeadInterestCategory } from "@/data/admin-sample";
import type { UserProfile, UserRole } from "@/data/auth-sample";

const CONFIGURED_API_URL =
  process.env.NEXT_PUBLIC_EVERPROP_API_URL ||
  process.env.NEXT_PUBLIC_API_URL ||
  "http://localhost:18080";

const TENANT =
  process.env.NEXT_PUBLIC_EVERPROP_TENANT ||
  process.env.NEXT_PUBLIC_TENANT ||
  "bellomo";

export function resolveApiUrl(): string {
  if (typeof window !== "undefined") {
    // In the browser, return window.location.origin so requests go through Next.js rewrites.
    // This makes cookies first-party, resolving CSRF mismatch and cross-domain cookie blocking.
    return window.location.origin;
  }
  return CONFIGURED_API_URL;
}

type ApiEnvelope<T> = { data: T };
type ApiPage<T> = { data: T[]; meta?: { total?: number } };

type ApiUser = {
  id: string;
  display_name: string;
  email: string;
  role: string;
  capabilities: string[];
  tenant?: { name?: string };
};

type ApiProject = {
  public_id: string;
  name: string;
  project_type: string;
  status: string;
  progress?: number | string | null;
  total_units?: number | null;
  city?: string | null;
  province?: string | null;
  address?: string | null;
  description?: string | null;
  masterplan_image_url?: string | null;
};

type ApiProperty = {
  public_id: string;
  title: string;
  operation: string;
  category: string;
  status: string;
  price?: number | string | null;
  currency_code?: string | null;
  city?: string | null;
  neighborhood?: string | null;
  bedrooms?: number | null;
  bathrooms?: number | null;
  area_m2?: number | string | null;
  main_image_url?: string | null;
  description?: string | null;
  sector_name?: string | null;
  unit_number?: string | null;
  project?: { public_id?: string } | null;
  services?: Property["services"] | null;
  commercial_features?: Property["commercialFeatures"] | null;
};

export class EverpropApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message);
    this.name = "EverpropApiError";
  }
}

export function isInvalidEverpropSession(error: unknown) {
  return error instanceof EverpropApiError && [401, 403, 419].includes(error.status);
}

function xsrfToken() {
  if (typeof document === "undefined") return "";
  const entry = document.cookie
    .split(";")
    .map((c) => c.trim())
    .find((cookie) => cookie.startsWith("XSRF-TOKEN="));
  return entry ? decodeURIComponent(entry.slice("XSRF-TOKEN=".length)) : "";
}

async function apiFetch<T>(path: string, init: RequestInit = {}) {
  const headers = new Headers(init.headers);
  headers.set("Accept", "application/json");
  headers.set("X-Everprop-Tenant", TENANT);

  if (init.body) headers.set("Content-Type", "application/json");
  if (init.method && !["GET", "HEAD"].includes(init.method.toUpperCase())) {
    const token = xsrfToken();
    if (token) headers.set("X-XSRF-TOKEN", token);
  }

  let response: Response;
  try {
    response = await fetch(new URL(path, resolveApiUrl()), {
      ...init,
      headers,
      credentials: "include",
      cache: "no-store",
      signal: init.signal || AbortSignal.timeout(10_000),
    });
  } catch (reason) {
    const timedOut =
      reason instanceof DOMException && ["AbortError", "TimeoutError"].includes(reason.name);
    throw new EverpropApiError(
      timedOut
        ? "La API EverProp demoró más de 10 segundos en responder."
        : "No se pudo conectar con la API EverProp.",
      0,
    );
  }

  if (response.status === 204) return null as T;

  const payload = (await response.json().catch(() => null)) as
    | { message?: string; error?: { message?: string }; errors?: Record<string, string[]> }
    | null;

  if (!response.ok) {
    const validationMessage = payload?.errors ? Object.values(payload.errors).flat()[0] : null;
    throw new EverpropApiError(
      validationMessage || payload?.error?.message || payload?.message || `La API respondió ${response.status}.`,
      response.status,
    );
  }

  return payload as T;
}

function mapRole(role: string): UserRole {
  if (role === "SUPER_ADMIN" || role === "TENANT_ADMIN" || role === "SALES_MANAGER") return "ADMIN";
  return "ADVISOR";
}

function mapUser(user: ApiUser): UserProfile {
  const name = user.display_name || user.email;
  const avatar = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");

  return {
    id: user.id,
    email: user.email,
    role: mapRole(user.role),
    apiRole: user.role,
    name,
    avatar: avatar || "EP",
    title: user.tenant?.name ? `${user.tenant.name} · API` : "Usuario EverProp",
    permissions: user.capabilities,
    source: "api",
  };
}

function cleanText(text: string | null | undefined): string {
  if (!text) return "";
  return text
    .replace(/Roc\?+o/gi, "Rocío")
    .replace(/Roco/gi, "Rocío")
    .replace(/\?{2,}/g, "—")
    .replace(/\ufffd+/g, "—");
}

function mapProject(project: ApiProject): Project {
  const type = project.project_type.toUpperCase();
  const status = project.status.toUpperCase();

  return {
    id: project.public_id,
    companyId: "c1",
    name: cleanText(project.name),
    type: type.includes("LAND") ? "land_development" : type.includes("BUILD") ? "building" : "commercial",
    status:
      status === "COMPLETED"
        ? "completed"
        : status.includes("CONSTRUCTION")
          ? "under_construction"
          : status.includes("SALE") || status === "PUBLISHED"
            ? "pre_sale"
            : "planning",
    progress: Number(project.progress || 0),
    location: {
      city: project.city || "Sin ciudad informada",
      province: project.province || "Jujuy",
      address: project.address || undefined,
    },
    totalUnits: Number(project.total_units || 0),
    description: project.description || undefined,
    masterplanImage: project.masterplan_image_url || undefined,
    coverImage: project.masterplan_image_url || undefined,
  };
}

function mapProperty(property: ApiProperty): Property {
  const categoryLabels: Record<string, string> = {
    LOT: "Lote",
    APARTMENT: "Departamento",
    LOCAL: "Local",
    GARAGE: "Cochera",
    HOUSE: "Casa",
    TRADITIONAL: "Propiedad",
  };
  const operation = property.operation.toUpperCase();
  const status = property.status.toUpperCase();

  return {
    id: property.public_id,
    companyId: "c1",
    title: cleanText(property.title),
    operation: operation === "RENT" ? "rent" : operation === "TEMPORARY" ? "temporal" : "sale",
    propertyType: categoryLabels[property.category.toUpperCase()] || property.category,
    price: Number(property.price || 0),
    currency: property.currency_code === "ARS" ? "ARS" : "USD",
    city: property.city || "Sin ciudad informada",
    neighborhood: property.neighborhood || "",
    bedrooms: property.bedrooms || 0,
    bathrooms: property.bathrooms || 0,
    area_m2: property.area_m2 == null ? undefined : Number(property.area_m2),
    mainImage: property.main_image_url || undefined,
    description: cleanText(property.description) || undefined,
    projectId: property.project?.public_id || undefined,
    sectorName: property.sector_name || undefined,
    unitNumber: property.unit_number || undefined,
    status: status === "SOLD" ? "sold" : status === "RESERVED" ? "reserved" : "available",
    services: property.services || undefined,
    commercialFeatures: property.commercial_features || undefined,
  };
}

export async function loginEverprop(email: string, password: string) {
  await apiFetch<null>("/sanctum/csrf-cookie");
  const response = await apiFetch<ApiEnvelope<ApiUser>>("/api/v1/auth/login", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });
  return mapUser(response.data);
}

export async function currentEverpropUser() {
  try {
    const response = await apiFetch<ApiEnvelope<ApiUser>>("/api/v1/auth/me");
    return mapUser(response.data);
  } catch (error) {
    if (isInvalidEverpropSession(error)) return null;
    throw error;
  }
}

export async function logoutEverprop() {
  await apiFetch<null>("/api/v1/auth/logout", { method: "POST" });
}

async function catalogFrom(prefix: "/api/v1/admin" | "/api/v1/public") {
  const [projects, properties] = await Promise.all([
    apiFetch<ApiPage<ApiProject>>(`${prefix}/projects?per_page=100`),
    apiFetch<ApiPage<ApiProperty>>(`${prefix}/properties?per_page=100`),
  ]);

  return {
    projects: projects.data.map(mapProject),
    properties: properties.data.map(mapProperty),
    source: prefix.includes("admin") ? ("admin-api" as const) : ("public-api" as const),
  };
}

export async function loadEverpropCatalog() {
  return catalogFrom("/api/v1/admin");
}

export async function everpropHealth() {
  const response = await apiFetch<{ status?: string }>("/healthz");
  return ["ok", "up", "ready"].includes(response.status || "");
}

export type CreatePropertyPayload = {
  title: string;
  operation?: "sale" | "rent" | "temporal";
  propertyType?: string;
  price?: number;
  currency?: "USD" | "ARS";
  city: string;
  province?: string;
  neighborhood?: string;
  projectId?: string;
  sectorName?: string;
  unitNumber?: string;
  bedrooms?: number;
  bathrooms?: number;
  area_m2?: number;
  description?: string;
  services?: string[];
  commercialFeatures?: Record<string, any>;
};

export async function createEverpropProperty(data: CreatePropertyPayload) {
  const categoryMap: Record<string, string> = {
    Lote: "LOT",
    Departamento: "APARTMENT",
    Local: "LOCAL",
    Cochera: "GARAGE",
    Casa: "HOUSE",
    Propiedad: "TRADITIONAL",
  };

  const payload = {
    title: data.title,
    operation: (data.operation || "sale").toUpperCase(),
    category: categoryMap[data.propertyType || ""] || "LOT",
    status: "AVAILABLE",
    price: data.price ? Number(data.price) : null,
    currency_code: data.price ? (data.currency || "USD") : null,
    city: data.city,
    province: data.province || "Jujuy",
    neighborhood: data.neighborhood || null,
    project_id: data.projectId ? 1 : 1, // Bellomo project ID
    sector_name: data.sectorName || null,
    unit_number: data.unitNumber || null,
    bedrooms: data.bedrooms ?? null,
    bathrooms: data.bathrooms ?? null,
    area_m2: data.area_m2 ?? null,
    description: data.description || null,
    services_json: data.services || null,
    commercial_features_json: data.commercialFeatures || null,
  };

  const response = await apiFetch<ApiEnvelope<ApiProperty>>("/api/v1/admin/properties", {
    method: "POST",
    body: JSON.stringify(payload),
  });

  return mapProperty(response.data);
}

export async function updateEverpropPropertyStatus(publicId: string, status: "available" | "reserved" | "sold", version = 1) {
  const statusMap: Record<string, string> = {
    available: "AVAILABLE",
    reserved: "RESERVED",
    sold: "SOLD",
  };

  const response = await apiFetch<ApiEnvelope<ApiProperty>>(`/api/v1/admin/properties/${publicId}/publish`, {
    method: "PATCH",
    body: JSON.stringify({
      status: statusMap[status] || "AVAILABLE",
      version,
    }),
  });

  return mapProperty(response.data);
}

export type CreateProjectPayload = {
  name: string;
  city: string;
  province?: string;
  projectType?: "land_development" | "building" | "commercial";
  status?: "planning" | "pre_sale" | "under_construction" | "completed";
  progress?: number;
  totalUnits?: number;
  address?: string;
  description?: string;
};

export async function createEverpropProject(data: CreateProjectPayload) {
  const typeMap: Record<string, string> = {
    land_development: "LAND_DEVELOPMENT",
    building: "BUILDING",
    commercial: "COMMERCIAL",
  };

  const statusMap: Record<string, string> = {
    planning: "PLANNING",
    pre_sale: "PRE_SALE",
    under_construction: "UNDER_CONSTRUCTION",
    completed: "COMPLETED",
  };

  const payload = {
    name: data.name,
    city: data.city,
    province: data.province || "Jujuy",
    project_type: typeMap[data.projectType || "land_development"] || "LAND_DEVELOPMENT",
    status: statusMap[data.status || "under_construction"] || "UNDER_CONSTRUCTION",
    progress: data.progress ?? 50,
    total_units: data.totalUnits ?? 30,
    address: data.address || null,
    description: data.description || null,
  };

  const response = await apiFetch<ApiEnvelope<ApiProject>>("/api/v1/admin/projects", {
    method: "POST",
    body: JSON.stringify(payload),
  });

  return mapProject(response.data);
}

export type ApiLead = {
  id: string;
  db_id?: number;
  name: string;
  email?: string;
  phone?: string;
  title?: string;
  stage?: string;
  stage_label?: string;
  priority?: string;
  budget?: number;
  currency?: string;
  notes?: string;
  agent_id?: number | string;
  agent_name?: string;
  last_touch_at?: string;
  follow_up_updated_at?: string;
  property_ids?: string[];
  properties?: Array<{
    id: string;
    title: string;
    price?: number | null;
    currency?: string | null;
    category?: string | null;
    project_id?: string | null;
    project_name?: string | null;
    unit_number?: string | null;
    sector_name?: string | null;
    interest_level?: string | null;
    status?: string | null;
    notes?: string | null;
  }>;
  created_at?: string;
  updated_at?: string;
};

export function mapLead(apiLead: ApiLead): Lead {
  const stageMap: Record<string, Lead["stage"]> = {
    NEW: "new",
    CONTACTED: "contacted",
    QUALIFIED: "contacted",
    VISIT_SCHEDULED: "visiting",
    NEGOTIATION: "negotiation",
    WON: "closing",
    LOST: "closing",
  };

  const propertyIds = apiLead.property_ids && apiLead.property_ids.length > 0
    ? apiLead.property_ids
    : (apiLead.properties || []).map((p) => p.id);

  const interests = (apiLead.properties || []).map((p) => {
    const rawCat = (p.category || "").toUpperCase();
    let mappedCategory: LeadInterestCategory | undefined = undefined;
    if (rawCat === "LOT" || rawCat === "LOTEO") mappedCategory = "loteo";
    else if (rawCat === "LOCAL" || rawCat === "COMMERCIAL") mappedCategory = "local";
    else if (rawCat === "GARAGE" || rawCat === "COCHERA") mappedCategory = "cochera";
    else if (rawCat === "APARTMENT" || rawCat === "HOUSE" || rawCat === "TRADITIONAL") mappedCategory = "tradicional";

    return {
      id: p.id,
      companyId: "c1",
      propertyId: p.id,
      propertyTitle: p.title,
      price: p.price ? Number(p.price) : undefined,
      currency: p.currency || "USD",
      category: mappedCategory,
      projectId: p.project_id || undefined,
      unitId: p.unit_number ? p.id : undefined,
      status: p.status || "ACTIVE",
      interestLevel: p.interest_level || "MEDIUM",
      notes: p.notes || undefined,
      createdAt: apiLead.created_at || new Date().toISOString(),
      updatedAt: apiLead.updated_at || new Date().toISOString(),
    };
  });

  return {
    id: apiLead.id,
    companyId: "c1",
    name: cleanText(apiLead.name),
    origin: "Web / Formulario",
    propertyIds,
    stage: stageMap[apiLead.stage?.toUpperCase() || ""] || "new",
    lastActivity: apiLead.updated_at || apiLead.created_at || new Date().toISOString(),
    followUpUpdatedAt: apiLead.last_touch_at || apiLead.follow_up_updated_at || undefined,
    phone: apiLead.phone || undefined,
    email: apiLead.email || undefined,
    notes: cleanText(apiLead.notes) || undefined,
    interests,
    agentId: apiLead.agent_id ? String(apiLead.agent_id) : undefined,
    agentName: apiLead.agent_name || undefined,
  };
}

export async function loadEverpropLeads(): Promise<Lead[]> {
  const response = await apiFetch<{ data: ApiLead[] }>("/api/v1/admin/leads");
  return (response.data || []).map(mapLead);
}

export async function createEverpropLead(data: {
  name: string;
  email?: string;
  phone?: string;
  stage?: string;
  priority?: string;
  budget?: number;
  currency?: "USD" | "ARS";
  notes?: string;
  agentId?: string | number | null;
  propertyId?: string | null;
}) {
  const response = await apiFetch<{ data: ApiLead }>("/api/v1/admin/leads", {
    method: "POST",
    body: JSON.stringify({
      name: data.name,
      email: data.email || null,
      phone: data.phone || null,
      stage: data.stage || "NEW",
      priority: (data.priority || "NORMAL").toUpperCase(),
      budget: data.budget || null,
      currency: data.currency || "USD",
      notes: data.notes || null,
      agent_id: data.agentId ? (typeof data.agentId === "number" ? data.agentId : String(data.agentId)) : null,
      property_id: data.propertyId || null,
    }),
  });

  return mapLead(response.data);
}

export async function updateEverpropLead(
  leadPublicId: string,
  data: {
    name?: string;
    email?: string;
    phone?: string;
    stage?: string;
    priority?: string;
    notes?: string;
    agentId?: string | number | null;
  }
) {
  const payload: Record<string, any> = {};
  if (data.name !== undefined) payload.name = data.name;
  if (data.email !== undefined) payload.email = data.email || null;
  if (data.phone !== undefined) payload.phone = data.phone || null;
  if (data.stage !== undefined) payload.stage = data.stage;
  if (data.priority !== undefined) payload.priority = data.priority;
  if (data.notes !== undefined) payload.notes = data.notes || null;
  if (data.agentId !== undefined) {
    payload.agent_id = data.agentId ? (typeof data.agentId === "number" ? data.agentId : String(data.agentId)) : null;
  }

  return apiFetch<{ status: string }>(`/api/v1/admin/leads/${leadPublicId}`, {
    method: "PUT",
    body: JSON.stringify(payload),
  });
}

export async function loadEverpropLeadById(leadPublicId: string): Promise<Lead> {
  const response = await apiFetch<{ data: ApiLead }>(`/api/v1/admin/leads/${leadPublicId}`);
  return mapLead(response.data);
}

export type ApiLeadFollowUp = {
  id: string;
  companyId: string;
  leadId: string;
  agentId: string;
  agentName?: string;
  agentAvatar?: string;
  type: LeadFollowUpType;
  occurredAt: string;
  summary: string;
  result: string;
  nextAction?: string;
  nextContactAt?: string;
  createdAt?: string;
};

export async function loadEverpropLeadFollowUps(leadPublicId: string): Promise<LeadFollowUp[]> {
  const response = await apiFetch<{ data: ApiLeadFollowUp[] }>(`/api/v1/admin/leads/${leadPublicId}/follow-ups`);
  return (response.data || []).map((item) => ({
    id: item.id,
    companyId: item.companyId || "c1",
    leadId: item.leadId,
    agentId: item.agentId,
    agentName: item.agentName || undefined,
    type: item.type,
    occurredAt: item.occurredAt,
    summary: item.summary,
    result: item.result,
    nextAction: item.nextAction || undefined,
    nextContactAt: item.nextContactAt || undefined,
  }));
}

export async function createEverpropLeadFollowUp(
  leadPublicId: string,
  data: {
    type: LeadFollowUpType;
    occurredAt: string;
    summary: string;
    result: string;
    nextAction?: string;
    nextContactAt?: string;
    agentId?: string | number | null;
  }
): Promise<LeadFollowUp> {
  const response = await apiFetch<{ data: ApiLeadFollowUp }>(`/api/v1/admin/leads/${leadPublicId}/follow-ups`, {
    method: "POST",
    body: JSON.stringify({
      type: data.type,
      occurred_at: data.occurredAt,
      summary: data.summary,
      result: data.result,
      next_action: data.nextAction || null,
      next_contact_at: data.nextContactAt || null,
      agent_id: data.agentId ? (typeof data.agentId === "number" ? data.agentId : String(data.agentId)) : null,
    }),
  });

  const item = response.data;
  return {
    id: item.id,
    companyId: item.companyId || "c1",
    leadId: item.leadId,
    agentId: item.agentId,
    agentName: item.agentName || undefined,
    type: item.type,
    occurredAt: item.occurredAt,
    summary: item.summary,
    result: item.result,
    nextAction: item.nextAction || undefined,
    nextContactAt: item.nextContactAt || undefined,
  };
}

export async function loadEverpropAllFollowUps(): Promise<LeadFollowUp[]> {
  const response = await apiFetch<{ data: ApiLeadFollowUp[] }>("/api/v1/admin/follow-ups");
  return (response.data || []).map((item) => ({
    id: item.id,
    companyId: item.companyId || "c1",
    leadId: item.leadId,
    agentId: item.agentId,
    agentName: item.agentName || undefined,
    type: item.type,
    occurredAt: item.occurredAt,
    summary: item.summary,
    result: item.result,
    nextAction: item.nextAction || undefined,
    nextContactAt: item.nextContactAt || undefined,
  }));
}

export async function attachEverpropLeadProperty(
  leadPublicId: string,
  propertyPublicId: string | number,
  options?: {
    interestLevel?: string;
    notes?: string;
    price?: number;
    currency?: string;
  }
) {
  return apiFetch<{ status: string; data: any }>(`/api/v1/admin/leads/${leadPublicId}/properties`, {
    method: "POST",
    body: JSON.stringify({
      property_id: String(propertyPublicId),
      interest_level: options?.interestLevel || "MEDIUM",
      notes: options?.notes || null,
      quoted_price: options?.price ?? null,
      quoted_currency_code: options?.currency ?? null,
    }),
  });
}

export async function updateEverpropLeadProperty(
  leadPublicId: string,
  propertyPublicId: string | number,
  data: {
    status?: string;
    interestLevel?: string;
    notes?: string;
  }
) {
  const payload: Record<string, any> = {};
  if (data.status !== undefined) payload.status = data.status;
  if (data.interestLevel !== undefined) payload.interest_level = data.interestLevel;
  if (data.notes !== undefined) payload.notes = data.notes;

  return apiFetch<{ status: string; data: any }>(
    `/api/v1/admin/leads/${leadPublicId}/properties/${propertyPublicId}`,
    {
      method: "PATCH",
      body: JSON.stringify(payload),
    }
  );
}

export async function detachEverpropLeadProperty(leadPublicId: string, propertyPublicId: string) {
  return apiFetch<{ status: string }>(`/api/v1/admin/leads/${leadPublicId}/properties/${propertyPublicId}`, {
    method: "DELETE",
  });
}


export type UpdatePropertyPayload = {
  title?: string;
  operation?: "sale" | "rent" | "temporal";
  propertyType?: string;
  status?: "available" | "reserved" | "sold";
  price?: number;
  currency?: "USD" | "ARS";
  city?: string;
  province?: string;
  neighborhood?: string;
  sectorName?: string;
  unitNumber?: string;
  area_m2?: number;
  bedrooms?: number;
  bathrooms?: number;
  description?: string;
  version?: number;
};

export async function updateEverpropProperty(publicId: string, data: UpdatePropertyPayload) {
  const categoryMap: Record<string, string> = {
    Lote: "LOT",
    Departamento: "APARTMENT",
    Local: "LOCAL",
    Cochera: "GARAGE",
    Casa: "HOUSE",
    Propiedad: "TRADITIONAL",
  };
  const statusMap: Record<string, string> = {
    available: "AVAILABLE",
    reserved: "RESERVED",
    sold: "SOLD",
  };

  const payload: Record<string, any> = {
    version: data.version ?? 1,
  };

  if (data.title !== undefined) payload.title = data.title;
  if (data.operation !== undefined) payload.operation = data.operation.toUpperCase();
  if (data.propertyType !== undefined) payload.category = categoryMap[data.propertyType] || "LOT";
  if (data.status !== undefined) payload.status = statusMap[data.status] || "AVAILABLE";
  if (data.price !== undefined) {
    payload.price = data.price ? Number(data.price) : null;
    payload.currency_code = data.price ? (data.currency || "USD") : null;
  }
  if (data.city !== undefined) payload.city = data.city;
  if (data.province !== undefined) payload.province = data.province;
  if (data.neighborhood !== undefined) payload.neighborhood = data.neighborhood;
  if (data.sectorName !== undefined) payload.sector_name = data.sectorName;
  if (data.unitNumber !== undefined) payload.unit_number = data.unitNumber;
  if (data.area_m2 !== undefined) payload.area_m2 = data.area_m2 ? Number(data.area_m2) : null;
  if (data.bedrooms !== undefined) payload.bedrooms = data.bedrooms ?? null;
  if (data.bathrooms !== undefined) payload.bathrooms = data.bathrooms ?? null;
  if (data.description !== undefined) payload.description = data.description;

  const response = await apiFetch<ApiEnvelope<ApiProperty>>(`/api/v1/admin/properties/${publicId}`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });

  return mapProperty(response.data);
}

export type GenerateLotsPayload = {
  projectId: number | string;
  sectorName: string; // Manzana
  lotFrom: number;
  lotTo: number;
  area_m2: number;
  frente_m?: number;
  fondo_m?: number;
  ochava_m2?: number;
  price?: number;
  currency?: "USD" | "ARS";
  cornerLots?: number[];
  cornerPrice?: number;
  cornerArea_m2?: number;
  services?: string[];
  description?: string;
};

export async function generateLotsBatch(payload: GenerateLotsPayload) {
  const response = await apiFetch<{ data: ApiProperty[]; message: string }>("/api/v1/admin/properties/batch-generate", {
    method: "POST",
    body: JSON.stringify({
      project_id: Number(payload.projectId),
      sector_name: payload.sectorName.trim(),
      lot_from: Number(payload.lotFrom),
      lot_to: Number(payload.lotTo),
      area_m2: Number(payload.area_m2),
      frente_m: payload.frente_m ? Number(payload.frente_m) : undefined,
      fondo_m: payload.fondo_m ? Number(payload.fondo_m) : undefined,
      ochava_m2: payload.ochava_m2 ? Number(payload.ochava_m2) : undefined,
      price: payload.price ? Number(payload.price) : null,
      currency_code: payload.price ? (payload.currency || "USD") : null,
      corner_lots: payload.cornerLots || [],
      corner_price: payload.cornerPrice ? Number(payload.cornerPrice) : null,
      corner_area_m2: payload.cornerArea_m2 ? Number(payload.cornerArea_m2) : null,
      services: payload.services || [],
      description: payload.description || undefined,
    }),
  });

  return {
    properties: response.data.map(mapProperty),
    message: response.message,
  };
}

export type ApiNotification = {
  id: string;
  targetUserId: string;
  title: string;
  message: string;
  leadId?: string | null;
  actionUrl?: string | null;
  eventType?: string | null;
  timestamp: string;
  read: boolean;
};

export async function loadEverpropNotifications(): Promise<{
  data: ApiNotification[];
  meta?: { unread_count?: number };
}> {
  return apiFetch<{ data: ApiNotification[]; meta?: { unread_count?: number } }>(
    "/api/v1/admin/notifications"
  );
}

export async function markEverpropNotificationRead(id: string): Promise<void> {
  await apiFetch(`/api/v1/admin/notifications/${id}/read`, {
    method: "PATCH",
  });
}

export async function markAllEverpropNotificationsRead(): Promise<void> {
  await apiFetch("/api/v1/admin/notifications/mark-all-read", {
    method: "POST",
  });
}

export async function clearAllEverpropNotifications(): Promise<void> {
  await apiFetch("/api/v1/admin/notifications", {
    method: "DELETE",
  });
}

export const STAGE_FRONTEND_TO_API: Record<string, string> = {
  new: "NEW",
  contacted: "CONTACTED",
  visiting: "VISIT_SCHEDULED",
  negotiation: "NEGOTIATION",
  closing: "WON",
};

export async function updateEverpropLeadStage(leadPublicId: string, stage: string) {
  const apiStage = STAGE_FRONTEND_TO_API[stage] || stage.toUpperCase();
  return apiFetch<{ status: string; data: any }>(`/api/v1/admin/leads/${leadPublicId}`, {
    method: "PATCH",
    body: JSON.stringify({ stage: apiStage }),
  });
}

export async function updateEverpropLeadPropertyStatus(
  leadPublicId: string,
  propertyPublicId: string,
  status: string
) {
  return apiFetch<{ status: string; data: any }>(
    `/api/v1/admin/leads/${leadPublicId}/properties/${propertyPublicId}`,
    {
      method: "PATCH",
      body: JSON.stringify({ status }),
    }
  );
}



