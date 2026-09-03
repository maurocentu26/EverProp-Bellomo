"use client";

import { AdminMenuAccount } from "@/components/admin/AdminMenuAccount";
import { useSidebar } from "@/components/ui/sidebar";

export function SidebarUser() {
  const { state } = useSidebar();

  return <AdminMenuAccount surface="sidebar" collapsed={state === "collapsed"} />;
}
