"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { motion, useAnimation } from "framer-motion";
import { Bell, Download, Menu, Plus } from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { AdminFullscreenMenu } from "@/components/admin/AdminFullscreenMenu";
import { NewLeadDrawer } from "@/components/admin/NewLeadDrawer";
import { GlobalSearch } from "@/components/admin/navbar/GlobalSearch";
import { useCurrentSession } from "@/hooks/use-current-session";
import { MOBILE_QUERY, useIsMobile } from "@/hooks/use-mobile";
import { isMockDataMode } from "@/lib/data-mode";
import { fetchNotifications, markAllNotificationsAsRead, markNotificationAsRead, type AppNotification } from "@/lib/notifications";
import { cn } from "@/lib/utils";
import { useSidebar } from "@/components/ui/sidebar";
import { ThemeToggle } from "@/components/theme/ThemeToggle";

type Props = {
  companyName?: string;
  className?: string;
};

export function AdminNavbar({ companyName = "Bellomo", className }: Props) {
  const router = useRouter();
  const { user, isEngineer } = useCurrentSession();
  const { state: sidebarState, toggleSidebar } = useSidebar();
  const isMobile = useIsMobile();
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isNotificationsOpen, setIsNotificationsOpen] = useState(false);
  const [isLeadDrawerOpen, setIsLeadDrawerOpen] = useState(false);
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const bellControls = useAnimation();
  const prevUnreadRef = useRef(0);

  useEffect(() => {
    if (!user?.id) return;

    let mounted = true;

    const refresh = async () => {
      try {
        const notifs = await fetchNotifications(user.id);
        if (mounted) {
          setNotifications(notifs);
        }
      } catch (err) {
        console.error("Error fetching notifications:", err);
      }
    };

    void refresh();

    window.addEventListener("everprop_notifications_updated", refresh);
    let channel: BroadcastChannel | null = null;
    try {
      channel = new BroadcastChannel("everprop_notifications");
      channel.onmessage = refresh;
    } catch {
      // BroadcastChannel may fail in some environments
    }

    // Polling every 30 seconds to fetch new notifications in real-time
    const interval = setInterval(refresh, 30_000);

    // Refresh when user returns to window tab
    window.addEventListener("focus", refresh);

    return () => {
      mounted = false;
      window.removeEventListener("everprop_notifications_updated", refresh);
      window.removeEventListener("focus", refresh);
      clearInterval(interval);
      channel?.close();
    };
  }, [user?.id]);

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

  const handleMarkAsRead = async () => {
    if (!user?.id) return;
    setNotifications((current) => current.map((notification) => ({ ...notification, read: true })));
    await markAllNotificationsAsRead(user.id);
  };

  const userInfo = {
    name: user?.name || "Cargando...",
    role: user?.title || "",
    initials: user?.avatar || "??",
  };

  return (
    <>
      <header className={cn("z-30 flex flex-col gap-3 border-b border-border bg-card px-3 py-3 text-card-foreground sm:px-4", className)}>
        <div className="flex items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <Button
              type="button"
              variant="ghost"
              onClick={() => {
                if (isMobile) {
                  setIsMenuOpen(true);
                  return;
                }
                setIsMenuOpen(false);
                toggleSidebar();
              }}
              className="h-10 shrink-0 gap-2 px-3 text-sm font-semibold"
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
              <span className="hidden sm:inline">
                {isMobile ? "Menú" : sidebarState === "expanded" ? "Ocultar menú" : "Mostrar menú"}
              </span>
            </Button>
          </div>

          <div className="flex items-center justify-end gap-2">
            <Button
              variant="outline"
              size="sm"
              className="hidden items-center gap-2 xl:inline-flex"
              onClick={() => router.push("/admin/properties/new")}
            >
              <Plus className="h-4 w-4" /> Propiedad
            </Button>
            {!isEngineer && (
              <Button
                size="sm"
                className="hidden items-center gap-2 bg-blue-600 text-white hover:bg-blue-700 xl:inline-flex"
                onClick={() => setIsLeadDrawerOpen(true)}
              >
                <Plus className="h-4 w-4" /> Lead
              </Button>
            )}

            <button
              type="button"
              onClick={() => {
                handleMarkAsRead();
                setIsNotificationsOpen(true);
              }}
              className="relative inline-flex h-9 w-9 items-center justify-center rounded-full transition-colors hover:bg-slate-100"
              aria-label="Notificaciones"
            >
              <motion.div animate={bellControls}>
                <Bell className="h-4 w-4" />
              </motion.div>
              {unreadCount > 0 && (
                <motion.span
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  className="absolute -right-0.5 -top-0.5 flex h-4 w-4 items-center justify-center rounded-full border-2 border-white bg-red-500"
                >
                  <span className="text-[8px] font-black leading-none text-white">{unreadCount > 9 ? "9+" : unreadCount}</span>
                </motion.span>
              )}
            </button>

            <div
              role="img"
              aria-label={`Usuario actual: ${userInfo.name}`}
              title={`${userInfo.name}${userInfo.role ? ` · ${userInfo.role}` : ""}`}
              className="relative ml-1 flex h-9 w-9 cursor-default items-center justify-center rounded-full border border-slate-200"
            >
              <Avatar className="h-full w-full">
                <AvatarFallback className="bg-blue-600 text-xs font-bold text-white">{userInfo.initials}</AvatarFallback>
              </Avatar>
            </div>
          </div>
        </div>

        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="min-w-0 flex-1">
            <GlobalSearch />
          </div>
          <ThemeToggle className="w-full shrink-0 sm:w-auto" />
        </div>
      </header>

      {isMobile && <AdminFullscreenMenu open={isMenuOpen} onOpenChange={setIsMenuOpen} />}

      <Dialog open={isNotificationsOpen} onOpenChange={setIsNotificationsOpen}>
        <DialogContent fullScreen className="flex bg-slate-50" showCloseButton>
          <div className="flex h-dvh min-h-0 w-full flex-col">
            <header className="shrink-0 border-b border-slate-200 bg-white px-4 pb-5 pt-[max(1rem,env(safe-area-inset-top))] sm:px-8 lg:px-12">
              <div className="mx-auto w-full max-w-[min(94vw,2800px)] pr-16">
                <DialogTitle className="text-2xl font-bold text-slate-950 sm:text-3xl">Notificaciones</DialogTitle>
                <DialogDescription className="mt-2 text-base text-slate-600">
                  Actividad reciente de tu cuenta de EverProp.
                </DialogDescription>
              </div>
            </header>

            <div className="min-h-0 flex-1 overflow-y-auto px-4 py-6 sm:px-8 sm:py-8 lg:px-12">
              <div className="mx-auto w-full max-w-[min(94vw,2800px)]">
                {notifications.length === 0 ? (
                  <div className="flex min-h-[50vh] flex-col items-center justify-center rounded-3xl border border-dashed border-slate-300 bg-white p-8 text-center">
                    <Bell className="h-10 w-10 text-slate-300" aria-hidden="true" />
                    <p className="mt-4 text-xl font-bold text-slate-900">No hay notificaciones</p>
                    <p className="mt-2 text-base text-slate-500">Cuando haya novedades aparecerán en esta pantalla.</p>
                  </div>
                ) : (
                  <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
                    {notifications.map((notification) => (
                      <article
                        key={notification.id}
                        onClick={async () => {
                          if (!notification.read) {
                            void markNotificationAsRead(notification.id);
                            setNotifications((prev) =>
                              prev.map((n) => (n.id === notification.id ? { ...n, read: true } : n))
                            );
                          }
                          const url = notification.actionUrl || (notification.leadId ? `/admin/leads/${notification.leadId}` : null);
                          if (url) {
                            setIsNotificationsOpen(false);
                            router.push(url);
                          }
                        }}
                        className={cn(
                          "min-h-36 rounded-2xl border bg-white p-5 shadow-sm transition-all cursor-pointer hover:shadow-md",
                          notification.read ? "border-slate-200 hover:border-slate-300" : "border-blue-200 bg-blue-50/60 hover:border-blue-300",
                        )}
                      >
                        <div className="flex items-start gap-3">
                          <span className={cn("mt-1 size-3 shrink-0 rounded-full", notification.read ? "bg-slate-300" : "bg-blue-600")} />
                          <div>
                            {notification.title && (
                              <p className="text-xs font-bold uppercase tracking-wider text-blue-600 mb-1">
                                {notification.title}
                              </p>
                            )}
                            <p className="text-base font-semibold leading-7 text-slate-900">{notification.message}</p>
                            <p className="mt-3 text-sm font-medium text-slate-500">
                              {new Date(notification.timestamp).toLocaleString("es-AR", { dateStyle: "medium", timeStyle: "short" })}
                            </p>
                          </div>
                        </div>
                      </article>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <NewLeadDrawer open={isLeadDrawerOpen} onOpenChange={setIsLeadDrawerOpen} />
    </>
  );
}
