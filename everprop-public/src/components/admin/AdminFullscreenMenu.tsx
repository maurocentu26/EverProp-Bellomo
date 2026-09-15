"use client";

import { X } from "lucide-react";

import { AdminMenuAccount } from "@/components/admin/AdminMenuAccount";
import { AdminMenuBrand } from "@/components/admin/AdminMenuBrand";
import { AdminNavigationMenu } from "@/components/admin/AdminNavigationMenu";
import { ThemeToggle } from "@/components/theme/ThemeToggle";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";

type AdminFullscreenMenuProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export function AdminFullscreenMenu({ open, onOpenChange }: AdminFullscreenMenuProps) {
  const closeMenu = () => onOpenChange(false);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent fullScreen showCloseButton={false} className="admin-workspace flex bg-sidebar text-sidebar-foreground">
        <DialogTitle className="sr-only">Menú principal</DialogTitle>
        <DialogDescription className="sr-only">
          Navegación principal y acciones disponibles en Bellomo.
        </DialogDescription>

        <div className="flex h-dvh min-h-0 w-full flex-col">
          <header className="shrink-0 border-b border-sidebar-border bg-sidebar px-4 pb-4 pt-[max(1rem,env(safe-area-inset-top))] text-sidebar-foreground sm:px-6">
            <div className="mx-auto flex w-full max-w-[min(94vw,2800px)] items-center justify-between gap-3">
              <AdminMenuBrand surface="fullscreen" onNavigate={closeMenu} />

              <div className="flex shrink-0 items-center gap-2">
                <ThemeToggle compact className="border-sidebar-border bg-sidebar text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground" />
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  onClick={closeMenu}
                  aria-label="Cerrar menú"
                  title="Cerrar menú"
                  className="size-12 shrink-0 border-sidebar-border bg-sidebar text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                >
                  <X className="size-5" aria-hidden="true" />
                </Button>
              </div>
            </div>
          </header>

          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain bg-sidebar text-sidebar-foreground">
            <div className="mx-auto w-full max-w-[min(94vw,2800px)]">
              <AdminNavigationMenu surface="fullscreen" onNavigate={closeMenu} />
            </div>
          </div>

          <AdminMenuAccount surface="fullscreen" />
        </div>
      </DialogContent>
    </Dialog>
  );
}
