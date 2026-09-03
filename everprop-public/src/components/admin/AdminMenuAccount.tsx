"use client";

import { LogOut } from "lucide-react";

import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/auth-context";
import { cn } from "@/lib/utils";

type AdminMenuAccountProps = {
  surface: "sidebar" | "fullscreen";
  collapsed?: boolean;
};

export function AdminMenuAccount({ surface, collapsed = false }: AdminMenuAccountProps) {
  const { currentUser, logout } = useAuth();
  const fullscreen = surface === "fullscreen";
  const userName = currentUser?.name || "Usuario";
  const userRole = currentUser?.title || "EverProp";
  const initials = currentUser?.avatar || "??";

  return (
    <footer
      className={cn(
        "shrink-0 border-t border-sidebar-border bg-sidebar text-sidebar-foreground",
        fullscreen
          ? "px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3 sm:px-6"
          : "p-2",
      )}
    >
      <div
        className={cn(
          "flex items-center",
          fullscreen
            ? "mx-auto w-full max-w-[min(94vw,2800px)] gap-3"
            : "gap-2",
          collapsed && "justify-center",
        )}
      >
        <Avatar className={cn(
          "shrink-0 rounded-xl border border-sidebar-border",
          fullscreen ? "size-10" : collapsed ? "size-8" : "size-9",
        )}>
          <AvatarFallback className="bg-blue-600 text-[10px] font-black text-white">
            {initials}
          </AvatarFallback>
        </Avatar>

        {!collapsed && (
          <>
            <div className="min-w-0 flex-1">
              <p className={cn("truncate font-bold leading-tight", fullscreen ? "text-base" : "text-sm")}>{userName}</p>
              <p className="mt-0.5 truncate text-xs text-sidebar-foreground/60">{userRole}</p>
            </div>
            <Button
              type="button"
              variant="ghost"
              onClick={() => void logout()}
              aria-label="Cerrar sesión"
              title="Cerrar sesión"
              className={cn(
                "shrink-0 gap-2 text-rose-600 hover:bg-rose-500/10 hover:text-rose-700 dark:text-rose-300 dark:hover:text-rose-200",
                fullscreen ? "h-10 px-3 text-sm font-semibold" : "size-10 px-0",
              )}
            >
              <LogOut className="size-4" aria-hidden="true" />
              {fullscreen && <span>Cerrar sesión</span>}
              {!fullscreen && <span className="sr-only">Cerrar sesión</span>}
            </Button>
          </>
        )}
      </div>
    </footer>
  );
}
