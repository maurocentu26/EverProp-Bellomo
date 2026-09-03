import { Plus, type LucideIcon } from "lucide-react";

export interface QuickAction {
  title: string;
  href: string;
  icon: LucideIcon;
  tone: "primary" | "secondary";
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
