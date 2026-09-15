"use client";

import Link from "next/link";

import { cn } from "@/lib/utils";

type AdminMenuBrandProps = {
  surface: "sidebar" | "fullscreen";
  collapsed?: boolean;
  onNavigate?: () => void;
};

export function AdminMenuBrand({
  surface,
  collapsed = false,
  onNavigate,
}: AdminMenuBrandProps) {
  const fullscreen = surface === "fullscreen";

  return (
    <Link
      href="/admin#dashboard"
      onClick={onNavigate}
      aria-label="Bellomo · 50 años · Inicio"
      className={cn(
        "flex min-w-0 items-center justify-center rounded-xl outline-none focus-visible:ring-4 focus-visible:ring-blue-400/60",
        fullscreen ? "gap-3 text-white" : "min-h-12 gap-2 px-2 text-sidebar-foreground",
        collapsed && "justify-center px-0",
      )}
    >
      <span
        role="img"
        aria-label="50 · Bellomo · Desde 1976"
        className={cn("bellomo-anniversary my-2 shrink-0", collapsed ? "h-7 w-10" : "h-[112px] w-[168px]")}
      />
    </Link>
  );
}
