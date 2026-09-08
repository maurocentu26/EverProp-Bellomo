export type UserRole = "ADMIN" | "ENGINEER" | "ADVISOR";

export type ApiRoleCode =
  | "SUPER_ADMIN"
  | "TENANT_ADMIN"
  | "SALES_MANAGER"
  | "SALES_ADVISOR"
  | "BOT_OPERATOR"
  | "READ_ONLY";

export type ApiCapability =
  | "viewAny"
  | "view"
  | "create"
  | "update"
  | "delete"
  | "publish"
  | "assign"
  | "manageUsers"
  | "manageIntegrations";

export type UserProfile = {
  id: string;
  email: string;
  role: UserRole;
  name: string;
  avatar: string;
  title: string;
  permissions: string[];
  source?: "api" | "demo";
  apiRole?: ApiRoleCode | string;
};

const DEMO_CAPABILITIES: Record<UserRole, readonly ApiCapability[]> = {
  ADMIN: ["viewAny", "view", "create", "update", "delete", "publish", "assign", "manageUsers", "manageIntegrations"],
  ENGINEER: ["viewAny", "view", "create", "update", "publish"],
  ADVISOR: ["viewAny", "view", "create", "update"],
};

/**
 * API capabilities are authoritative. Demo users retain their legacy role-based
 * behavior so visual QA keeps working without broadening real-account access.
 */
export function userHasCapability(user: UserProfile | null | undefined, capability: ApiCapability): boolean {
  if (!user) return false;
  if (user.source === "api") return user.permissions.includes(capability);
  return DEMO_CAPABILITIES[user.role].includes(capability);
}

export const MOCK_USERS: UserProfile[] = [
  {
    id: "usr-admin",
    email: "admin@bellomo.com",
    role: "ADMIN",
    name: "Marcos Bellomo",
    avatar: "MB",
    title: "Director General",
    permissions: ["full_access", "view_all_stats", "reassign_leads", "manage_inventory"],
    source: "demo",
  },
  {
    id: "usr-manager",
    email: "sofia@bellomo.com",
    role: "ENGINEER",
    name: "Ing. Sofía Bellomo",
    avatar: "SB",
    title: "Ingeniera / Directora de Obra",
    permissions: ["desarrolladora_workspace", "manage_inventory", "construction_progress"],
    source: "demo",
  },
  {
    id: "usr-sales",
    email: "lucas.albarracin@bellomo.com",
    role: "ADVISOR",
    name: "Lucas Albarracín",
    avatar: "LA",
    title: "Asesor Comercial",
    permissions: ["assigned_leads_only", "assigned_visits_only"],
    source: "demo",
  },
  {
    id: "usr-sales-2",
    email: "valentina.morales@bellomo.com",
    role: "ADVISOR",
    name: "Valentina Morales",
    avatar: "VM",
    title: "Asesora Comercial",
    permissions: ["assigned_leads_only", "assigned_visits_only"],
    source: "demo",
  },
];

export const REAL_ADVISORS = [
  {
    id: "b1100000-0000-4000-8000-000000000101",
    numericId: "1",
    name: "Lucas Albarracín",
    role: "Asesor Comercial · Loteos",
    avatar: "LA",
    email: "lucas.albarracin@bellomo.com",
  },
  {
    id: "b1100000-0000-4000-8000-000000000102",
    numericId: "2",
    name: "Valentina Morales",
    role: "Asesora Comercial · Locales & Inversiones",
    avatar: "VM",
    email: "valentina.morales@bellomo.com",
  },
  {
    id: "b1100000-0000-4000-8000-000000000104",
    numericId: "4",
    name: "Ing. Sofía Bellomo",
    role: "Gerente Comercial",
    avatar: "SB",
    email: "sofia@bellomo.com",
  },
  {
    id: "b1100000-0000-4000-8000-000000000100",
    numericId: "3",
    name: "Marcos Bellomo",
    role: "Director General",
    avatar: "MB",
    email: "admin@bellomo.com",
  },
];

export type AdvisorInfo = {
  id: string;
  name: string;
  role: string;
  avatar: string;
};

export function getAdvisor(agentId?: string | number | null, fallbackName?: string): AdvisorInfo | undefined {
  if (!agentId && !fallbackName) return undefined;
  const strId = agentId ? String(agentId).trim() : "";

  if (strId) {
    const real = REAL_ADVISORS.find((a) => a.id === strId || a.numericId === strId || a.email.toLowerCase() === strId.toLowerCase());
    if (real) return { id: real.id, name: real.name, role: real.role, avatar: real.avatar };

    const mock = MOCK_USERS.find((u) => u.id === strId || u.email.toLowerCase() === strId.toLowerCase());
    if (mock) return { id: mock.id, name: mock.name, role: mock.title, avatar: mock.avatar };
  }

  if (fallbackName && fallbackName.trim()) {
    const trimmed = fallbackName.trim();
    const realByName = REAL_ADVISORS.find((a) => a.name.toLowerCase() === trimmed.toLowerCase());
    if (realByName) return { id: realByName.id, name: realByName.name, role: realByName.role, avatar: realByName.avatar };

    const mockByName = MOCK_USERS.find((u) => u.name.toLowerCase() === trimmed.toLowerCase());
    if (mockByName) return { id: mockByName.id, name: mockByName.name, role: mockByName.title, avatar: mockByName.avatar };

    return { id: strId || "", name: trimmed, role: "Asesor Comercial", avatar: trimmed.slice(0, 2).toUpperCase() };
  }

  return undefined;
}

export function getAdvisorName(agentId?: string | number | null, fallbackName?: string): string {
  const advisor = getAdvisor(agentId, fallbackName);
  return advisor ? advisor.name : "Sin asignar";
}
