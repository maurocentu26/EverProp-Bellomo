"use client";

import { AdminMenuBrand } from "@/components/admin/AdminMenuBrand";
import { SidebarHeader, useSidebar } from "@/components/ui/sidebar";

export function SidebarBrand() {
  const { state } = useSidebar();

  return (
    <SidebarHeader className="border-b border-sidebar-border p-2">
      <AdminMenuBrand surface="sidebar" collapsed={state === "collapsed"} />
    </SidebarHeader>
  );
}
