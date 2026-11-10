"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { motion, useAnimation } from "framer-motion";
import { Bell, Home, Menu, MessagesSquare, Users, Plus } from "lucide-react";
import { toast } from "sonner";
import { nextTopbarState } from "@/lib/topbar-scroll";
import { isForMe } from "@/lib/notification-tray";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { AdminFullscreenMenu } from "@/components/admin/AdminFullscreenMenu";
import { NotificationTray } from "@/components/admin/NotificationTray";
import { GlobalSearch } from "@/components/admin/navbar/GlobalSearch";
import { useCurrentSession } from "@/hooks/use-current-session";
import { MOBILE_QUERY, useIsMobile } from "@/hooks/use-mobile";
import { fetchNotifications, isNotificationForUser, showDesktopNotification, type AppNotification } from "@/lib/notifications";
import { apiFetch } from "@/lib/everprop-api";
import { isMockDataMode } from "@/lib/data-mode";
import { cn } from "@/lib/utils";
import { useSidebar } from "@/components/ui/sidebar";
import { ThemeToggle } from "@/components/theme/ThemeToggle";
import { PanelTextSizeControl } from "@/components/theme/PanelTextSize";
import { NotificationPermissionPrompt } from "@/components/admin/NotificationPermissionPrompt";
import { playCorporateNotificationChime } from "@/lib/notification-audio";

type Props = {
  companyName?: string;
  className?: string;
};

export function AdminNavbar({ companyName = "Bellomo", className }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const { user, isEngineer, isAdvisor, isAdmin } = useCurrentSession();
  const { state: sidebarState, toggleSidebar } = useSidebar();
  const isMobile = useIsMobile();
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isNotificationsOpen, setIsNotificationsOpen] = useState(false);
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [loadState, setLoadState] = useState<"loading" | "ready" | "error">("loading");
  const [archiving, setArchiving] = useState<ReadonlySet<string>>(() => new Set());
  const [soundEnabled, setSoundEnabled] = useState(false);
  const trayOpenRef = useRef(false);
  const refreshRef = useRef<() => void>(() => {});
  useEffect(() => { trayOpenRef.current = isNotificationsOpen; }, [isNotificationsOpen]);
  const topbarRef = useRef<HTMLElement>(null);
  // Se oculta al bajar y vuelve al subir. Las vistas con scroll interno, como Conversaciones, no mueven este contenedor.
  useEffect(() => {
    const topbar = topbarRef.current;
    const scroller = document.querySelector<HTMLElement>('[data-admin-scroll-container="true"]');
    if (!topbar || !scroller) return;
    let state = { hidden: false, anchor: scroller.scrollTop };
    const apply = (hidden: boolean) => {
      state.hidden = hidden;
      topbar.dataset.hidden = String(hidden);
      topbar.style.marginTop = hidden ? `-${topbar.offsetHeight}px` : "";
    };
    const onScroll = () => {
      const inUse = topbar.querySelector(':focus-visible, [aria-haspopup][aria-expanded="true"]');
      const height = topbar.offsetHeight;
      const next = nextTopbarState(state, { y: scroller.scrollTop, maxScroll: scroller.scrollHeight - scroller.clientHeight, height });
      state = { hidden: state.hidden, anchor: next.anchor };
      apply(next.hidden && !inUse);
    };
    const onFocus = () => apply(false);
    scroller.addEventListener("scroll", onScroll, { passive: true });
    topbar.addEventListener("focusin", onFocus);
    return () => {
      scroller.removeEventListener("scroll", onScroll);
      topbar.removeEventListener("focusin", onFocus);
    };
  }, []);
  const soundEnabledRef = useRef(false);
  const seenNotificationIds = useRef<Set<string> | null>(null);
  useEffect(() => {
    try { const enabled = localStorage.getItem("bellomo:notification-sound") === "on"; setSoundEnabled(enabled); soundEnabledRef.current = enabled; } catch {}
  }, []);
  const bellControls = useAnimation();
  const prevUnreadRef = useRef(0);
  const latestIdRef = useRef<string | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Live database refresh; the demo SSE stream is isolated from API sessions.
  useEffect(() => {
    if (!user?.id) return;
    let mounted = true;
    let refreshing = false;
    let checking = false;
    let revision = "";
    seenNotificationIds.current = null;

    // Initial fetch
    const refresh = async () => {
      if (!mounted || refreshing) return;
      refreshing = true;
      try {
        const notifs = await fetchNotifications(user);
        if (!mounted) return;
        const previous = seenNotificationIds.current;
        const incoming = previous ? notifs.filter((notification) => !notification.read && !previous.has(notification.id)) : [];
        const seen = previous ?? new Set<string>();
        notifs.forEach(notification => seen.add(notification.id));
        seenNotificationIds.current = seen;
        setNotifications(notifs);
        setLoadState("ready");
        if (incoming.length) {
          if (soundEnabledRef.current) playCorporateNotificationChime();
          const notification = incoming[0];
          // With the tray open, new items just appear at the top (PatternFly): no toast over it.
          if (!trayOpenRef.current) toast.info(incoming.length > 1 ? `${incoming.length} nuevas notificaciones` : notification.title || "Nueva notificación", {
            description: notification.message, duration: 12000,
            action: notification.actionUrl ? { label: "Ver", onClick: () => router.push(notification.actionUrl!) } : undefined,
          });
          if (document.visibilityState === "hidden") {
            const isConversationAlert = notification.eventType === "CONVERSATION_NEEDS_ATTENTION";
            showDesktopNotification(
              isConversationAlert ? "Un cliente espera respuesta" : (notification.title || "Bellomo"),
              {
                body: isConversationAlert ? "Abrí la conversación para atenderlo." : notification.message,
                tag: notification.id,
                data: { url: notification.actionUrl },
              },
            );
          }
        }
        return true;
      } catch (err) {
        console.error("Error fetching notifications:", err);
        if (mounted) setLoadState("error");
      } finally { refreshing = false; }
    };
    refreshRef.current = () => void refresh();
    void refresh();

    const eventSource = isMockDataMode ? new EventSource('/api/notifications/stream') : null;
    const check = async () => {
      if (!mounted || checking || refreshing) return;
      if (isMockDataMode) { await refresh(); return; }
      checking = true;
      try {
        const state = await apiFetch<{revision: string}>("/api/v1/admin/notifications/count");
        if (mounted && state.revision !== revision) { if (await refresh()) revision = state.revision; }
      } catch { /* The next check retries without overlapping requests. */ }
      finally { checking = false; }
    };
    const poll = window.setInterval(() => void check(), 2000);
    const onVisible = () => { if (document.visibilityState === "visible") void refresh(); };
    window.addEventListener('focus', refresh);
    window.addEventListener('online', refresh);
    document.addEventListener('visibilitychange', onVisible);

    eventSource?.addEventListener('notification', (e) => {
      try {
        const data = JSON.parse(e.data);
        const isForMe = isNotificationForUser(data.targetUserId, user);
        if (isForMe) {
          setNotifications(prev => {
            if (prev.some(n => n.id === data.id)) return prev;
            return [data, ...prev];
          });
          if (soundEnabledRef.current) playCorporateNotificationChime();
          showDesktopNotification(data.title || "Nueva notificación", { body: data.message });
          if (!trayOpenRef.current) toast.info(data.title || "Nueva notificación", {
            description: data.message,
            action: data.actionUrl
              ? { label: "Ver", onClick: () => router.push(data.actionUrl!) }
              : undefined,
          });
        }
      } catch (err) {
        console.error("Error parsing SSE notification:", err);
      }
    });

    eventSource?.addEventListener('update', () => {
      void refresh();
    });

    // Support for existing cross-tab sync if needed
    const handleLocalUpdate = () => void refresh();
    window.addEventListener("everprop_notifications_updated", handleLocalUpdate);
    let channel: BroadcastChannel | null = null;
    try { 
      channel = new BroadcastChannel("everprop_notifications"); 
      channel.onmessage = handleLocalUpdate; 
    } catch { /* ignore */ }

    return () => {
      mounted = false;
      eventSource?.close();
      window.clearInterval(poll);
      window.removeEventListener("focus", refresh);
      window.removeEventListener("online", refresh);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("everprop_notifications_updated", handleLocalUpdate);
      channel?.close();
    };
  }, [user, router]);

  // The bell counts only what is directed at this user ("Para mí"); team and system news wait in "Todas".
  const unreadCount = notifications.filter((notification) => !notification.read && isForMe(notification.eventType) && !archiving.has(notification.id)).length;

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

  const toggleSound = () => {
    const enabled = !soundEnabled;
    setSoundEnabled(enabled); soundEnabledRef.current = enabled;
    try { localStorage.setItem("bellomo:notification-sound", enabled ? "on" : "off"); } catch {}
    if (enabled) playCorporateNotificationChime();
  };

  const userInfo = {
    name: user?.name || "Cargando...",
    role: user?.title || "",
    initials: user?.avatar || "??",
  };

  return (
    <>
      {user?.id && <NotificationPermissionPrompt key={user.id} />}
      <header ref={topbarRef} className={cn("admin-topbar z-30 border-b border-border bg-card px-4 py-3 lg:px-8 text-card-foreground", className)}>
        <div className="flex items-center justify-between gap-3">
          <div className="flex min-w-0 flex-1 items-center gap-3">
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
              className={cn("size-11 min-h-11 min-w-11 p-0 shrink-0 rounded-xl hover:bg-muted dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 transition-colors", isAdvisor && "advisor-top-menu")}
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
            <div className="min-w-0 flex-1 max-w-xl"><GlobalSearch /></div>
          </div>

          <div className="flex items-center justify-end gap-2">
            {!isAdvisor && (
              <Button
                variant="outline"
                size="sm"
                className="hidden min-h-11 items-center gap-2 xl:inline-flex"
                onClick={() => router.push("/admin/properties/new")}
              >
                <Plus className="h-4 w-4" /> Activo
              </Button>
            )}
            {!isEngineer && (
              <Button
                size="sm"
                className="hidden min-h-11 items-center gap-2 bg-blue-600 text-white hover:bg-blue-700 xl:inline-flex"
                onClick={() => router.push("/admin/leads/new")}
              >
                <Plus className="h-4 w-4" /> Lead
              </Button>
            )}

            {/* Theme Toggle (Icon Only) */}
            <ThemeToggle />
            <PanelTextSizeControl />

            <NotificationTray
              user={user}
              notifications={notifications}
              setNotifications={setNotifications}
              archiving={archiving}
              setArchiving={setArchiving}
              loadState={loadState}
              onRetry={() => refreshRef.current()}
              open={isNotificationsOpen}
              onOpenChange={setIsNotificationsOpen}
              isMobile={isMobile}
              soundEnabled={soundEnabled}
              onToggleSound={toggleSound}
              triggerLabel={unreadCount ? `Notificaciones, ${unreadCount} para vos sin leer` : "Notificaciones"}
              triggerClassName="relative inline-flex size-11 min-h-11 min-w-11 items-center justify-center rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900 text-slate-700 dark:text-slate-200 shadow-2xs transition-colors hover:bg-muted dark:hover:bg-slate-800 aria-expanded:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              trigger={<>
                <motion.div animate={bellControls}>
                  <Bell className="h-4 w-4" aria-hidden="true" />
                </motion.div>
                {unreadCount > 0 && (
                  <motion.span
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    aria-hidden="true"
                    className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full border-2 border-background bg-red-600 px-1"
                  >
                    <span className="text-[10px] font-black leading-none text-white">{unreadCount > 9 ? "9+" : unreadCount}</span>
                  </motion.span>
                )}
              </>}
            />

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

      </header>

      {isAdvisor && <nav className="advisor-dock" aria-label="Navegación principal">
        <Link href="/admin" aria-current={pathname === "/admin" ? "page" : undefined}><Home aria-hidden />Mi Día</Link>
        <Link href="/admin/conversaciones" aria-current={pathname.startsWith("/admin/conversaciones") ? "page" : undefined}><MessagesSquare aria-hidden />Mensajes</Link>
        <Link href="/admin/leads" aria-current={pathname.startsWith("/admin/leads") ? "page" : undefined}><Users aria-hidden />Leads</Link>
        <button type="button" onClick={() => setIsMenuOpen(true)} aria-expanded={isMenuOpen}><Menu aria-hidden />Más</button>
      </nav>}
      {isMobile && <AdminFullscreenMenu open={isMenuOpen} onOpenChange={setIsMenuOpen} />}
    </>
  );
}

