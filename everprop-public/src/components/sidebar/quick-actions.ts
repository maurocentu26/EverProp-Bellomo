import { Plus, CalendarDays, HardHat, type LucideIcon } from "lucide-react";

export interface QuickAction {
  title: string;
  href: string;
  icon: LucideIcon;
  tone: "primary" | "secondary";
}

export function getAvailableQuickActions({
  isAdvisor,
  isEngineer,
}: {
  isAdvisor?: boolean;
  isEngineer?: boolean;
}): QuickAction[] {
  if (isAdvisor) {
    return [
      {
        title: "Nuevo Lead",
        href: "/admin/leads/new",
        icon: Plus,
        tone: "primary",
      },
      {
        title: "Mi Agenda",
        href: "/admin/agenda",
        icon: CalendarDays,
        tone: "secondary",
      },
    ];
  }

  if (isEngineer) {
    return [
      {
        title: "Nueva Propiedad",
        href: "/admin/properties/new",
        icon: Plus,
        tone: "primary",
      },
      {
        title: "Proyectos",
        href: "/admin/desarrollos",
        icon: HardHat,
        tone: "secondary",
      },
    ];
  }

  return [
    {
      title: "Nuevo Lead",
      href: "/admin/leads/new",
      icon: Plus,
      tone: "primary",
    },
    {
      title: "Nueva Propiedad",
      href: "/admin/properties/new",
      icon: Plus,
      tone: "secondary",
    },
  ];
}

export const quickActionsConfig: QuickAction[] = [
  { 
    title: "Nuevo Lead", 
    href: "/admin/leads/new", 
    icon: Plus, 
    tone: "primary",
  },
  { 
    title: "Nueva Propiedad", 
    href: "/admin/properties/new", 
    icon: Plus, 
    tone: "secondary",
  },
];
