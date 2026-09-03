"use client";

import { AdminNavigationMenu } from "@/components/admin/AdminNavigationMenu";
import { SidebarContent, useSidebar } from "@/components/ui/sidebar";

export function SidebarNav() {
  const { state } = useSidebar();

  return (
    <SidebarContent>
      <AdminNavigationMenu surface="sidebar" collapsed={state === "collapsed"} />
    </SidebarContent>
  );
}
