import { 
  Home, 
  Building2, 
  Users, 
  CalendarDays, 
  Settings, 
  Plus,
  HardHat,
  Map,
  type LucideIcon 
} from "lucide-react";

export interface NavChild {
  title: string;
  href: string;
  icon?: LucideIcon;
}

export interface NavItem {
  title: string;
  href: string;
  icon: LucideIcon;
  matchPath?: string;
  hash?: string;
  children?: NavChild[];
}

export interface NavGroup {
  label: string;
  items: NavItem[];
}

type NavigationAccess = {
  isEngineer: boolean;
  isMockMode: boolean;
  isAdvisor?: boolean;
  canCreate?: boolean;
  canManageUsers?: boolean;
};

export const advisorNavigationGroups: NavGroup[] = [
  {
    label: "Mi Gestión",
    items: [
      { title: "Mi Día", href: "/admin", icon: Home, matchPath: "/admin" },
      { 
        title: "Mis Leads", 
        href: "/admin/leads", 
        icon: Users, 
        matchPath: "/admin/leads",
        children: [{ title: "Nuevo Lead", href: "/admin/leads/new", icon: Plus }]
      },
      { title: "Mi Agenda", href: "/admin/agenda", icon: CalendarDays, matchPath: "/admin/agenda" },
    ]
  },
  {
    label: "Catálogo & Disponibilidad",
    items: [
      { 
        title: "Propiedades & Unidades", 
        href: "/admin/properties", 
        icon: Building2, 
        matchPath: "/admin/properties"
      },
      { title: "Proyectos & Desarrollos", href: "/admin/desarrollos", icon: HardHat, matchPath: "/admin/desarrollos" },
      { title: "Matriz de Lotes", href: "/admin/inventory-matrix", icon: Map, matchPath: "/admin/inventory-matrix" },
    ]
  }
];

export const navigationGroups: NavGroup[] = [
  {
    label: "Desarrollos",
    items: [
      { title: "Dashboard", href: "/admin#dashboard", icon: Home, hash: "#dashboard" },
      { title: "Proyectos", href: "/admin/desarrollos", icon: HardHat, matchPath: "/admin/desarrollos" },
      { title: "Inventario", href: "/admin/inventory-matrix", icon: Map, matchPath: "/admin/inventory-matrix" },
    ]
  },
  {
    label: "Comercializadora",
    items: [
      { 
        title: "Propiedades", 
        href: "/admin/properties", 
        icon: Building2, 
        matchPath: "/admin/properties",
        children: [{ title: "Nueva Unidad", href: "/admin/properties/new", icon: Plus }]
      },
      { 
        title: "Leads", 
        href: "/admin/leads", 
        icon: Users, 
        matchPath: "/admin/leads",
        children: [{ title: "Nuevo Lead", href: "/admin/leads/new", icon: Plus }]
      },
    ]
  },
  {
    label: "Gestión",
    items: [
      { title: "Agenda", href: "/admin/agenda", icon: CalendarDays, matchPath: "/admin/agenda" },
      { title: "Configuración", href: "/admin/settings", icon: Settings, matchPath: "/admin/settings" },
    ]
  }
];

export const navigationConfig: NavItem[] = navigationGroups.flatMap(g => g.items);

export function getAvailableNavigationGroups({
  isEngineer,
  isAdvisor,
  isMockMode,
  canCreate = false,
  canManageUsers = false,
}: NavigationAccess): NavGroup[] {
  if (isAdvisor) {
    return advisorNavigationGroups.map((group) => ({
      ...group,
      items: (isMockMode ? group.items : group.items.filter((item) => item.title !== "Mi Agenda")).map((item) => ({
        ...item,
        children: canCreate ? item.children : undefined,
      })),
    }));
  }

  if (isEngineer) {
    return navigationGroups
      .map((group) => {
        if (group.label !== "Gestión") return group;
        return {
          ...group,
          items: group.items.filter((item) => item.title !== "Agenda" && item.title !== "Configuración"),
        };
      })
      .filter((group) => group.label !== "Comercializadora");
  }

  return navigationGroups.map((group) => ({
    ...group,
    items: (isMockMode
      ? group.items
      : group.items.filter((item) => item.title !== "Agenda"))
      .filter((item) => item.title !== "Configuración" || canManageUsers)
      .map((item) => ({
        ...item,
        children: canCreate ? item.children : undefined,
      })),
  }));
}
