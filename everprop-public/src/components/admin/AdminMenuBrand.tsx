"use client";

import Link from "next/link";
import { Command } from "lucide-react";

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
      aria-label="EverProp · Dashboard"
      className={cn(
        "flex min-w-0 items-center rounded-xl outline-none focus-visible:ring-4 focus-visible:ring-blue-400/60",
        fullscreen ? "gap-3 text-white" : "min-h-12 gap-2 px-2 text-sidebar-foreground",
        collapsed && "justify-center px-0",
      )}
    >
      <span
        className={cn(
          "flex shrink-0 items-center justify-center bg-blue-600 text-white shadow-lg shadow-blue-600/20",
          fullscreen ? "size-12 rounded-2xl sm:size-14" : "size-8 rounded-lg",
        )}
      >
        <Command className={cn(fullscreen ? "size-6 sm:size-7" : "size-4")} aria-hidden="true" />
      </span>

      {!collapsed && (
        <span className="min-w-0">
          <span className={cn("block truncate font-bold tracking-tight", fullscreen ? "text-xl sm:text-2xl" : "text-sm")}>
            EverProp
          </span>
          <span className={cn("block truncate", fullscreen ? "text-base text-slate-300" : "text-[10px] font-bold uppercase tracking-wider text-sidebar-foreground/55")}>
            {fullscreen ? "Bellomo · Menú principal" : "Bellomo"}
          </span>
        </span>
      )}
    </Link>
  );
}
