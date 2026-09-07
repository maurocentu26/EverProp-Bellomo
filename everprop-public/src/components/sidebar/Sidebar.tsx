"use client";

import { type ComponentProps } from "react";
import { Sidebar, SidebarRail } from "@/components/ui/sidebar";
import { SidebarBrand } from "./sidebar-brand";
import { SidebarNav } from "./sidebar-nav";
import { SidebarSimulations } from "./sidebar-simulations";
import { SidebarUser } from "./sidebar-user";
import { useIsMobile } from "@/hooks/use-mobile";

export function AppSidebar({ ...props }: ComponentProps<typeof Sidebar>) {
  const isMobile = useIsMobile();

  if (isMobile) return null;

  return (
    <Sidebar 
      collapsible="icon" 
      className="" 
      {...props}
    >
      <SidebarBrand />
      
      <SidebarNav />
      
      <SidebarSimulations />

      <SidebarUser />

      <SidebarRail />
    </Sidebar>
  );
}
