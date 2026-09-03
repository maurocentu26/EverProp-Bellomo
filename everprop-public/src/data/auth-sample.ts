export type UserRole = "ADMIN" | "ENGINEER" | "ADVISOR";

export type UserProfile = {
  id: string;
  email: string;
  role: UserRole;
  name: string;
  avatar: string;
  title: string;
  permissions: string[];
  source?: "api" | "demo";
  apiRole?: string;
};

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
