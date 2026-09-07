"use client";

import { useMemo } from "react";
import Link from "next/link";
import { ChevronRight } from "lucide-react";

import { useCurrentSession } from "@/hooks/use-current-session";
import { isMockDataMode } from "@/lib/data-mode";
import { cn } from "@/lib/utils";
import { getAvailableNavigationGroups } from "@/components/sidebar/navigation";
import { quickActionsConfig } from "@/components/sidebar/quick-actions";
import { useSidebarActive } from "@/components/sidebar/use-sidebar-active";

type AdminNavigationMenuProps = {
  surface: "sidebar" | "fullscreen";
  collapsed?: boolean;
  onNavigate?: () => void;
};

export function AdminNavigationMenu({
  surface,
  collapsed = false,
  onNavigate,
}: AdminNavigationMenuProps) {
  const { isEngineer, isAdvisor } = useCurrentSession();
  const { isItemActive, isChildActive } = useSidebarActive();
  const fullscreen = surface === "fullscreen";
  const groups = useMemo(
    () => getAvailableNavigationGroups({ isEngineer, isAdvisor, isMockMode: isMockDataMode }),
    [isEngineer, isAdvisor],
  );

  return (
    <div className={cn(fullscreen ? "space-y-7 px-4 py-5 sm:px-6 sm:py-7" : "space-y-4 px-2 pb-3")}>
      {fullscreen && (
        <section aria-labelledby="menu-quick-actions-title">
          <h2 id="menu-quick-actions-title" className="mb-3 text-xs font-bold uppercase tracking-[0.14em] text-sidebar-foreground/65">
            Acciones rápidas
          </h2>
          <div className="grid gap-2 sm:grid-cols-3">
            {quickActionsConfig.map((action) => {
              const ActionIcon = action.icon;
              return (
                <Link
                  key={action.title}
                  href={action.href}
                  onClick={onNavigate}
                  className={cn(
                    "flex min-h-13 items-center gap-3 rounded-xl border px-4 text-base font-semibold outline-none transition-colors focus-visible:ring-4 focus-visible:ring-blue-500/40",
                    action.tone === "primary"
                      ? "border-blue-600 bg-blue-600 text-white hover:bg-blue-700"
                      : "border-sidebar-border bg-sidebar-accent/45 text-sidebar-foreground hover:bg-sidebar-accent",
                  )}
                >
                  <ActionIcon className="size-5 shrink-0" aria-hidden="true" />
                  <span>{action.title}</span>
                  <ChevronRight className="ml-auto size-4 opacity-60" aria-hidden="true" />
                </Link>
              );
            })}
          </div>
        </section>
      )}

      <nav
        aria-label="Navegación administrativa"
        className={cn(fullscreen ? "grid gap-6 md:grid-cols-3" : "space-y-4")}
      >
        {groups.map((group) => (
          <section key={group.label}>
            {!collapsed && (
              <h2 className={cn(
                "font-bold uppercase tracking-[0.14em] text-sidebar-foreground/55",
                fullscreen ? "mb-3 text-xs" : "mb-2 px-2 text-[10px]",
              )}>
                {group.label}
              </h2>
            )}

            <div className={cn(fullscreen ? "space-y-2" : "space-y-1")}>
              {group.items.map((item) => {
                const Icon = item.icon;
                const active = isItemActive(item);
                return (
                  <div key={item.title}>
                    <Link
                      href={item.href}
                      onClick={onNavigate}
                      aria-current={active ? "page" : undefined}
                      aria-label={collapsed ? item.title : undefined}
                      title={collapsed ? item.title : undefined}
                      className={cn(
                        "flex items-center rounded-xl font-semibold outline-none transition-colors focus-visible:ring-4 focus-visible:ring-blue-500/40",
                        fullscreen ? "min-h-13 gap-3 px-3 text-base" : "min-h-11 gap-2 px-2 text-sm",
                        collapsed && "justify-center px-0",
                        active
                          ? "bg-sidebar-accent text-sidebar-accent-foreground shadow-sm"
                          : "text-sidebar-foreground hover:bg-sidebar-accent/65 hover:text-sidebar-accent-foreground",
                      )}
                    >
                      <span className={cn(
                        "flex shrink-0 items-center justify-center rounded-lg",
                        fullscreen ? "size-9" : "size-8",
                        active ? "bg-blue-100 text-blue-700" : "bg-sidebar-foreground/8 text-blue-600 dark:text-blue-300",
                      )}>
                        <Icon className="size-4.5" aria-hidden="true" />
                      </span>
                      {!collapsed && (
                        <>
                          <span className="min-w-0 flex-1 truncate">{item.title}</span>
                          {item.children && (
                            <ChevronRight className={cn("size-4 opacity-60 transition-transform", active && "rotate-90")} aria-hidden="true" />
                          )}
                        </>
                      )}
                    </Link>

                    {!collapsed && active && item.children && (
                      <div className={cn("ml-4 mt-1 space-y-1 border-l border-sidebar-border pl-4", !fullscreen && "ml-5 pl-3")}>
                        {item.children.map((child) => {
                          const ChildIcon = child.icon;
                          const childActive = isChildActive(child);
                          return (
                            <Link
                              key={child.title}
                              href={child.href}
                              onClick={onNavigate}
                              aria-current={childActive ? "page" : undefined}
                              className={cn(
                                "flex min-h-10 items-center gap-2 rounded-lg px-3 text-sm font-medium outline-none transition-colors focus-visible:ring-4 focus-visible:ring-blue-500/40",
                                childActive
                                  ? "bg-sidebar-accent/75 text-sidebar-accent-foreground"
                                  : "text-sidebar-foreground/65 hover:bg-sidebar-accent/50 hover:text-sidebar-accent-foreground",
                              )}
                            >
                              {ChildIcon && <ChildIcon className="size-4 text-blue-600 dark:text-blue-300" aria-hidden="true" />}
                              <span>{child.title}</span>
                            </Link>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </section>
        ))}
      </nav>
    </div>
  );
}
