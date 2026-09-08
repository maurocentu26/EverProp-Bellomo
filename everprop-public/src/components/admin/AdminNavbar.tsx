"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { motion, useAnimation } from "framer-motion";
import { Bell, Check, ExternalLink, Inbox, Menu, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { AdminFullscreenMenu } from "@/components/admin/AdminFullscreenMenu";
import { GlobalSearch } from "@/components/admin/navbar/GlobalSearch";
import { useCurrentSession } from "@/hooks/use-current-session";
import { MOBILE_QUERY, useIsMobile } from "@/hooks/use-mobile";
import { clearAllNotifications, fetchNotifications, markAllNotificationsAsRead, markNotificationAsRead, requestDesktopNotificationPermission, safeAdminActionUrl, showDesktopNotification, type AppNotification } from "@/lib/notifications";
import { cn } from "@/lib/utils";
import { useSidebar } from "@/components/ui/sidebar";
import { ThemeToggle } from "@/components/theme/ThemeToggle";
import { playCorporateNotificationChime } from "@/lib/notification-audio";

type Props = {
  companyName?: string;
  className?: string;
};

export function AdminNavbar({ className }: Props) {
  const router = useRouter();
  const { user, isEngineer, isAdvisor, canCreate } = useCurrentSession();
  const { state: sidebarState, toggleSidebar } = useSidebar();
  const isMobile = useIsMobile();
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isNotificationsOpen, setIsNotificationsOpen] = useState(false);
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const bellControls = useAnimation();
  const prevUnreadRef = useRef(0);
  const latestIdRef = useRef<string | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Polling autenticado contra Laravel; se pausa cuando la pestaña no está visible.
  useEffect(() => {
    if (!user?.id) return;
    let mounted = true;

    const refresh = async () => {
      try {
        const notifs = await fetchNotifications(user);
        if (!mounted) return;

        const newest = notifs.find((notification) => !notification.read);
        if (newest && newest.id !== latestIdRef.current && latestIdRef.current !== null) {
          const actionUrl = safeAdminActionUrl(newest.actionUrl)
            ?? (newest.leadId ? `/admin/leads/${encodeURIComponent(newest.leadId)}` : null);
          playCorporateNotificationChime();
          showDesktopNotification(newest.title || "Nueva notificación", { body: newest.message });
          toast.info(newest.title || "Nueva notificación", {
            description: newest.message,
            action: actionUrl
              ? { label: "Ver", onClick: () => router.push(actionUrl) }
              : undefined,
          });
        }
        if (newest) latestIdRef.current = newest.id;
        setNotifications(notifs);
      } catch (err) {
        console.error("Error fetching notifications:", err);
      }
    };

    const startPolling = () => {
      if (intervalRef.current) return;
      intervalRef.current = setInterval(refresh, 12_000);
    };
    const stopPolling = () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
    const handleVisibilityChange = () => {
      if (document.visibilityState === "hidden") {
        stopPolling();
        return;
      }
      void refresh();
      startPolling();
    };

    const handleLocalUpdate = () => void refresh();
    void refresh();
    startPolling();
    window.addEventListener("everprop_notifications_updated", handleLocalUpdate);
    window.addEventListener("focus", handleLocalUpdate);
    document.addEventListener("visibilitychange", handleVisibilityChange);
    let channel: BroadcastChannel | null = null;
    try {
      channel = new BroadcastChannel("everprop_notifications");
      channel.onmessage = handleLocalUpdate;
    } catch { /* ignore */ }

    return () => {
      mounted = false;
      stopPolling();
      window.removeEventListener("everprop_notifications_updated", handleLocalUpdate);
      window.removeEventListener("focus", handleLocalUpdate);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      channel?.close();
    };
  }, [user, router]);

  const unreadCount = notifications.filter((notification) => !notification.read).length;

  useEffect(() => {
    if (unreadCount > prevUnreadRef.current) {
      void bellControls.start({
        rotate: [0, -15, 15, -10, 10, -5, 5, 0],
        transition: { duration: 0.5, ease: "easeInOut" },
      });
    }
    prevUnreadRef.current = unreadCount;
  }, [bellControls, unreadCount]);

  useEffect(() => {
    const mobileQuery = window.matchMedia(MOBILE_QUERY);
    const closeMenuOnDesktop = (event: MediaQueryListEvent) => {
      if (!event.matches) setIsMenuOpen(false);
    };

    mobileQuery.addEventListener("change", closeMenuOnDesktop);
    return () => mobileQuery.removeEventListener("change", closeMenuOnDesktop);
  }, []);

  const handleMarkAllAsRead = async () => {
    if (!user?.id) return;
    try {
      await markAllNotificationsAsRead(user);
      setNotifications((current) => current.map((notification) => ({ ...notification, read: true })));
    } catch (error) {
      console.error("Error marking notifications as read:", error);
      toast.error("No se pudieron marcar las notificaciones como leídas.");
    }
  };

  const handleClearAll = async () => {
    if (!user?.id) return;
    try {
      await clearAllNotifications(user);
      setNotifications([]);
    } catch (error) {
      console.error("Error clearing notifications:", error);
      toast.error("No se pudieron limpiar las notificaciones.");
    }
  };

  const handleNotificationClick = async (n: AppNotification) => {
    if (!n.read) {
      try {
        await markNotificationAsRead(n.id);
        setNotifications((prev) => prev.map((item) => (item.id === n.id ? { ...item, read: true } : item)));
      } catch (error) {
        console.error("Error marking notification as read:", error);
        toast.error("No se pudo actualizar la notificación.");
        return;
      }
    }
    const url = safeAdminActionUrl(n.actionUrl)
      ?? (n.leadId ? `/admin/leads/${encodeURIComponent(n.leadId)}` : null);
    if (url) { setIsNotificationsOpen(false); router.push(url); }
  };

  const userInfo = {
    name: user?.name || "Cargando...",
    role: user?.title || "",
    initials: user?.avatar || "??",
  };

  return (
    <>
      <header className={cn("z-30 flex flex-col gap-2 sm:gap-3 border-b border-border bg-card px-3 py-2 sm:px-4 sm:py-3 text-card-foreground", className)}>
        <div className="flex items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={() => {
                if (isMobile) {
                  setIsMenuOpen(true);
                  return;
                }
                setIsMenuOpen(false);
                toggleSidebar();
              }}
              className="size-9 sm:size-10 p-0 shrink-0 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 transition-colors"
              aria-label={
                isMobile
                  ? "Abrir menú principal"
                  : sidebarState === "expanded"
                    ? "Contraer menú lateral"
                    : "Expandir menú lateral"
              }
              aria-expanded={isMobile ? isMenuOpen : sidebarState === "expanded"}
            >
              <Menu className="h-5 w-5" aria-hidden="true" />
            </Button>
          </div>

          <div className="flex items-center justify-end gap-2">
            {canCreate && !isAdvisor && (
              <Button
                variant="outline"
                size="sm"
                className="hidden items-center gap-2 xl:inline-flex"
                onClick={() => router.push("/admin/properties/new")}
              >
                <Plus className="h-4 w-4" /> Propiedad
              </Button>
            )}
            {canCreate && !isEngineer && (
              <Button
                size="sm"
                className="hidden items-center gap-2 bg-blue-600 text-white hover:bg-blue-700 xl:inline-flex"
                onClick={() => router.push("/admin/leads/new")}
              >
                <Plus className="h-4 w-4" /> Lead
              </Button>
            )}

            {/* Theme Toggle (Icon Only) */}
            <ThemeToggle />

            {/* Notifications Drawer (Sheet) */}
            <Sheet open={isNotificationsOpen} onOpenChange={setIsNotificationsOpen}>
              <SheetTrigger
                className="relative inline-flex size-9 sm:size-10 items-center justify-center rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900 text-slate-700 dark:text-slate-200 shadow-2xs transition-colors hover:bg-slate-100 dark:hover:bg-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                aria-label="Notificaciones"
              >
                <motion.div animate={bellControls}>
                  <Bell className="h-4 w-4" />
                </motion.div>
                {unreadCount > 0 && (
                  <motion.span
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    className="absolute -right-0.5 -top-0.5 flex h-4 w-4 items-center justify-center rounded-full border-2 border-background bg-red-600"
                  >
                    <span className="text-[8px] font-black leading-none text-white">{unreadCount > 9 ? "9+" : unreadCount}</span>
                  </motion.span>
                )}
              </SheetTrigger>
              <SheetContent side="right" className="flex w-full flex-col p-0 sm:max-w-md">
                <SheetHeader className="border-b border-border px-5 py-4 text-left">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <SheetTitle className="text-base font-bold text-foreground">Notificaciones</SheetTitle>
                      {unreadCount > 0 ? (
                        <span className="rounded-full bg-blue-100 px-2 py-0.5 text-xs font-semibold text-blue-700 dark:bg-blue-950/60 dark:text-blue-300">
                          {unreadCount} sin leer
                        </span>
                      ) : (
                        <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
                          Al día
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-1">
                      {unreadCount > 0 && (
                        <button
                          type="button"
                          onClick={handleMarkAllAsRead}
                          className="inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-semibold text-blue-600 transition-colors hover:bg-blue-50 dark:text-blue-400 dark:hover:bg-blue-950/50"
                        >
                          <Check className="h-3.5 w-3.5" /> Marcar leídas
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={async () => {
                          const p = await requestDesktopNotificationPermission();
                          if (p === 'granted') toast.success("Notificaciones de escritorio activadas");
                          else if (p === 'denied') toast.error("Notificaciones bloqueadas por el navegador");
                        }}
                        className="inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-semibold text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                        title="Activar notificaciones de escritorio"
                      >
                        <Bell className="h-3.5 w-3.5" />
                      </button>
                      {notifications.length > 0 && (
                        <button
                          type="button"
                          onClick={handleClearAll}
                          className="inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-semibold text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
                          title="Vaciar todas las notificaciones"
                        >
                          <Trash2 className="h-3.5 w-3.5" /> Limpiar
                        </button>
                      )}
                    </div>
                  </div>
                  <SheetDescription className="text-xs text-muted-foreground">
                    Alertas de leads asignados, compromisos comerciales y eventos del sistema.
                  </SheetDescription>
                </SheetHeader>

                <div className="flex-1 overflow-y-auto p-4 space-y-2.5">
                  {notifications.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-16 text-center">
                      <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-muted text-muted-foreground">
                        <Inbox className="h-6 w-6" />
                      </div>
                      <p className="mt-4 text-sm font-semibold text-foreground">Bandeja al día</p>
                      <p className="mt-1 text-xs text-muted-foreground max-w-[220px]">
                        No tenés notificaciones pendientes. Cuando haya nuevos contactos o novedades aparecerán acá.
                      </p>
                    </div>
                  ) : (
                    notifications.map((n) => (
                      <button
                        key={n.id}
                        type="button"
                        onClick={() => handleNotificationClick(n)}
                        className={cn(
                          "group relative flex w-full flex-col gap-1.5 rounded-xl border p-3.5 text-left transition-all",
                          n.read
                            ? "border-border bg-card hover:border-border/80 hover:bg-accent/40 text-muted-foreground"
                            : "border-blue-200 bg-blue-50/50 hover:bg-blue-50/80 dark:border-blue-900/60 dark:bg-blue-950/20 dark:hover:bg-blue-950/30 text-foreground"
                        )}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-2">
                            <span
                              className={cn(
                                "h-2 w-2 rounded-full shrink-0",
                                n.read ? "bg-muted-foreground/30" : "bg-blue-600 ring-2 ring-blue-200 dark:ring-blue-950"
                              )}
                            />
                            {n.title && (
                              <span className="text-[11px] font-bold uppercase tracking-wider text-blue-600 dark:text-blue-400">
                                {n.title}
                              </span>
                            )}
                          </div>
                          <span className="text-[11px] text-muted-foreground">
                            {new Date(n.timestamp).toLocaleString("es-AR", {
                              day: "2-digit",
                              month: "short",
                              hour: "2-digit",
                              minute: "2-digit",
                            })}
                          </span>
                        </div>

                        <p className={cn("text-xs leading-relaxed font-medium text-foreground", n.read && "text-muted-foreground")}>
                          {n.message}
                        </p>

                        {(n.leadId || safeAdminActionUrl(n.actionUrl)) && (
                          <div className="mt-1 flex items-center gap-1 text-[11px] font-semibold text-blue-600 dark:text-blue-400 group-hover:underline">
                            <span>Ver detalle</span>
                            <ExternalLink className="h-3 w-3" />
                          </div>
                        )}
                      </button>
                    ))
                  )}
                </div>
              </SheetContent>
            </Sheet>

            <div
              role="img"
              aria-label={`Usuario actual: ${userInfo.name}`}
              title={`${userInfo.name}${userInfo.role ? ` · ${userInfo.role}` : ""}`}
              className="relative ml-0.5 sm:ml-1 flex size-9 sm:size-10 cursor-default items-center justify-center rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden shadow-2xs"
            >
              <Avatar className="h-full w-full rounded-xl">
                <AvatarFallback className="bg-blue-600 text-xs font-bold text-white rounded-xl">{userInfo.initials}</AvatarFallback>
              </Avatar>
            </div>
          </div>
        </div>

        <div className="w-full min-w-0">
          <GlobalSearch />
        </div>
      </header>

      {isMobile && <AdminFullscreenMenu open={isMenuOpen} onOpenChange={setIsMenuOpen} />}
    </>
  );
}
