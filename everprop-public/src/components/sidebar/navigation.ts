import { 
  Home, 
  Building2, 
  Users, 
  CalendarDays, 
  Settings, 
  Plus,
  HardHat,
  Map,
  Store,
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
};

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
    label: "Activos Comerciales",
    items: [
      { title: "Locales y Cocheras", href: "/admin/comercial", icon: Store, matchPath: "/admin/comercial" },
      { title: "Agenda", href: "/admin/agenda", icon: CalendarDays, matchPath: "/admin/agenda" },
      { title: "Configuración", href: "/admin/settings", icon: Settings, matchPath: "/admin/settings" },
    ]
  }
];

export const navigationConfig: NavItem[] = navigationGroups.flatMap(g => g.items);

export function getAvailableNavigationGroups({
  isEngineer,
}: NavigationAccess): NavGroup[] {
  if (!isEngineer) return navigationGroups;

  return navigationGroups
    .map((group) => {
      if (group.label !== "Activos Comerciales") return group;
      return {
        ...group,
        items: group.items.filter((item) => item.title !== "Agenda"),
      };
    })
    .filter((group) => group.label !== "Comercializadora");
}
