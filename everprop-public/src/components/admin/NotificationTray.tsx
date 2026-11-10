"use client";

import { useEffect, useRef, useState, type Dispatch, type KeyboardEvent, type ReactNode, type SetStateAction } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Archive, CalendarDays, Check, CheckCheck, Circle, CircleDollarSign, Clock, Inbox, MessageCircle, MoreVertical, Settings2, SlidersHorizontal, UserRound, Volume2, X } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { archiveNotification, markAllNotificationsAsRead, markNotificationAsRead, markNotificationAsUnread, type AppNotification, type UserIdentifier } from "@/lib/notifications";
import { groupByDay, isForMe, KIND_LABEL, notificationKind, timeLabel, urgencyLabel, type NotificationKind } from "@/lib/notification-tray";
import { cn } from "@/lib/utils";

const FOCUS = "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";
const KIND_ICON = { conv: MessageCircle, lead: UserRound, visit: CalendarDays, pay: CircleDollarSign, sys: Settings2 } as const;
const KIND_STYLE: Record<NotificationKind, string> = {
  conv: "bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-200",
  lead: "bg-teal-100 text-teal-800 dark:bg-teal-950 dark:text-teal-200",
  visit: "bg-violet-100 text-violet-800 dark:bg-violet-950 dark:text-violet-200",
  pay: "bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200",
  sys: "bg-slate-200 text-slate-800 dark:bg-slate-800 dark:text-slate-200",
};
const absolute = (timestamp: string) => new Date(timestamp).toLocaleString("es-AR", { timeZone: "America/Argentina/Buenos_Aires", dateStyle: "medium", timeStyle: "short" });
// Only in-panel destinations: a notification payload must never send the browser off-site.
const destination = (n: AppNotification) => (n.actionUrl?.startsWith("/admin/") ? n.actionUrl : n.leadId ? `/admin/leads/${n.leadId}` : null);

type Notice = { text: string; error?: boolean; undo?: () => void };

type Props = {
  user: UserIdentifier;
  notifications: AppNotification[];
  setNotifications: Dispatch<SetStateAction<AppNotification[]>>;
  /** Ids waiting for their Undo window before the server delete; hidden here and from the bell count. */
  archiving: ReadonlySet<string>;
  setArchiving: Dispatch<SetStateAction<ReadonlySet<string>>>;
  loadState: "loading" | "ready" | "error";
  onRetry: () => void;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  isMobile: boolean;
  trigger: ReactNode;
  triggerLabel: string;
  triggerClassName: string;
  soundEnabled: boolean;
  onToggleSound: () => void;
};

export function NotificationTray(props: Props) {
  const { user, notifications, setNotifications, archiving, setArchiving, open, onOpenChange, isMobile, trigger, triggerLabel, triggerClassName } = props;
  const router = useRouter();
  // Lives outside the popup so the tab, the filter and pending archives survive closing the tray.
  const [tab, setTab] = useState<"mine" | "all">("mine");
  const [onlyUnread, setOnlyUnread] = useState(false);
  const [notice, setNotice] = useState<Notice | null>(null);
  // An archive is only sent once its Undo is no longer offered: notice closed or replaced, or tray closed.
  const pendingArchive = useRef<(() => void) | null>(null);

  const show = (next: Notice | null) => {
    const commit = pendingArchive.current;
    pendingArchive.current = null;
    commit?.();
    setNotice(next);
  };
  const setOpen = (next: boolean) => { if (!next) show(null); onOpenChange(next); };
  const setRead = (ids: string[], read: boolean) => setNotifications((current) => current.map((n) => (ids.includes(n.id) ? { ...n, read } : n)));
  const fail = (text: string) => show({ text, error: true });

  async function toggleRead(n: AppNotification) {
    setRead([n.id], !n.read);
    try { await (n.read ? markNotificationAsUnread(n.id) : markNotificationAsRead(n.id)); }
    catch { setRead([n.id], n.read); fail("No se pudo guardar el cambio. Reintentá."); }
  }

  function openItem(n: AppNotification) {
    if (!n.read) void toggleRead(n);
    const url = destination(n);
    if (url) { setOpen(false); router.push(url); }
  }

  async function markRead(target: AppNotification[], everything: boolean) {
    const ids = target.filter((n) => !n.read).map((n) => n.id);
    if (!ids.length) return;
    setRead(ids, true);
    try { await (everything ? markAllNotificationsAsRead(user) : Promise.all(ids.map(markNotificationAsRead))); }
    catch { setRead(ids, false); fail("No se pudieron marcar como leídas. Reintentá."); return; }
    // Stays until the next action or until the tray closes.
    show({
      text: ids.length === 1 ? "1 notificación marcada como leída" : `${ids.length} notificaciones marcadas como leídas`,
      undo: () => {
        setNotice(null);
        setRead(ids, false);
        void Promise.all(ids.map(markNotificationAsUnread)).catch(() => fail("No se pudo deshacer. Reintentá."));
      },
    });
  }

  function archive(n: AppNotification) {
    const restore = () => setArchiving((current) => { const next = new Set(current); next.delete(n.id); return next; });
    setArchiving((current) => new Set(current).add(n.id));
    show({ text: "Notificación archivada", undo: () => { pendingArchive.current = null; restore(); setNotice(null); } });
    // ponytail: the delete waits for the Undo to go away, so Undo needs no restore endpoint; closing the browser tab first keeps the notification.
    pendingArchive.current = () => {
      archiveNotification(n.id)
        .then(() => setNotifications((current) => current.filter((item) => item.id !== n.id)))
        .catch(() => fail("No se pudo archivar la notificación. Reintentá."))
        .finally(restore);
    };
  }

  const visible = notifications.filter((n) => !archiving.has(n.id));
  const body = (title: ReactNode) => (
    <TrayBody
      title={title} visible={visible} tab={tab} setTab={setTab} onlyUnread={onlyUnread} setOnlyUnread={setOnlyUnread}
      notice={notice} dismissNotice={() => show(null)} loadState={props.loadState} onRetry={props.onRetry}
      soundEnabled={props.soundEnabled} onToggleSound={props.onToggleSound}
      onClose={() => setOpen(false)} onOpenItem={openItem} onToggleRead={(n) => void toggleRead(n)} onArchive={archive}
      onMarkRead={(target, everything) => void markRead(target, everything)}
      onOpenPreferences={() => { setOpen(false); router.push("/admin/settings#avisos-dispositivo"); }}
    />
  );

  if (isMobile) {
    return (
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetTrigger className={triggerClassName} aria-label={triggerLabel}>{trigger}</SheetTrigger>
        <SheetContent side="right" showCloseButton={false} className="admin-workspace flex !w-full flex-col gap-0 p-0 data-[side=right]:!w-full data-[side=right]:sm:!max-w-md">
          {body(<SheetTitle className="text-base font-bold text-foreground">Notificaciones</SheetTitle>)}
        </SheetContent>
      </Sheet>
    );
  }
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger className={triggerClassName} aria-label={triggerLabel}>{trigger}</PopoverTrigger>
      <PopoverContent align="end" sideOffset={8} aria-labelledby="notif-tray-title" className="admin-workspace flex max-h-[min(44rem,calc(100dvh-5.5rem))] w-[28rem] max-w-[calc(100vw-1.5rem)] flex-col overflow-hidden rounded-2xl p-0 shadow-xl">
        {body(<h2 id="notif-tray-title" className="text-base font-bold text-foreground">Notificaciones</h2>)}
      </PopoverContent>
    </Popover>
  );
}

type BodyProps = {
  title: ReactNode;
  visible: AppNotification[];
  tab: "mine" | "all";
  setTab: (tab: "mine" | "all") => void;
  onlyUnread: boolean;
  setOnlyUnread: Dispatch<SetStateAction<boolean>>;
  notice: Notice | null;
  dismissNotice: () => void;
  loadState: Props["loadState"];
  onRetry: () => void;
  soundEnabled: boolean;
  onToggleSound: () => void;
  onClose: () => void;
  onOpenItem: (n: AppNotification) => void;
  onToggleRead: (n: AppNotification) => void;
  onArchive: (n: AppNotification) => void;
  onMarkRead: (target: AppNotification[], everything: boolean) => void;
  onOpenPreferences: () => void;
};

function TrayBody({ title, visible, tab, setTab, onlyUnread, setOnlyUnread, notice, dismissNotice, loadState, onRetry, soundEnabled, onToggleSound, onClose, onOpenItem, onToggleRead, onArchive, onMarkRead, onOpenPreferences }: BodyProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const menuButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!menuOpen) return;
    const closeOutside = (event: PointerEvent) => { if (!menuRef.current?.contains(event.target as Node)) setMenuOpen(false); };
    document.addEventListener("pointerdown", closeOutside);
    return () => document.removeEventListener("pointerdown", closeOutside);
  }, [menuOpen]);

  const mine = visible.filter((n) => isForMe(n.eventType));
  const inTab = tab === "mine" ? mine : visible;
  const tabUnread = inTab.filter((n) => !n.read);
  const list = onlyUnread ? tabUnread : inTab;
  const mineUnread = mine.filter((n) => !n.read).length;
  const allUnread = visible.filter((n) => !n.read).length;

  function onMenuKey(event: KeyboardEvent) {
    if (event.key !== "Escape") return;
    event.stopPropagation();
    setMenuOpen(false);
    menuButtonRef.current?.focus();
  }

  const menuItem = cn("flex min-h-11 w-full items-center gap-3 rounded-lg px-3 text-left text-sm hover:bg-muted disabled:cursor-default disabled:opacity-50 disabled:hover:bg-transparent", FOCUS);
  const toggleTrack = (on: boolean) => (
    <span aria-hidden="true" className={cn("relative h-5 w-9 shrink-0 rounded-full transition-colors", on ? "bg-blue-600" : "bg-slate-300 dark:bg-slate-600")}>
      <span className={cn("absolute top-0.5 left-0.5 size-4 rounded-full bg-white shadow transition-transform motion-reduce:transition-none", on && "translate-x-4")} />
    </span>
  );

  let empty: { title: string; text: string; action?: { label: string; run: () => void } } | null = null;
  if (!list.length && loadState !== "loading") {
    if (onlyUnread && inTab.length) empty = { title: "No tenés notificaciones sin leer", text: "Cuando te asignen un lead, te escriban o venza una cuota, aparece acá.", action: { label: "Mostrar también las leídas", run: () => setOnlyUnread(false) } };
    else if (tab === "mine" && visible.length) empty = { title: "No hay notificaciones para vos", text: "Las novedades del equipo y del sistema están en Todas.", action: { label: "Ver todas", run: () => setTab("all") } };
    else empty = { title: "Todavía no hay notificaciones", text: "Cuando te asignen un lead, te escriban o venza una cuota, aparece acá." };
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex flex-wrap items-center gap-x-1 py-1.5 pr-2 pl-4">
        <div className="mr-auto">{title}</div>
        <button type="button" role="switch" aria-checked={onlyUnread} onClick={() => setOnlyUnread((value) => !value)} className={cn("order-last inline-flex min-h-11 w-full items-center gap-2 rounded-lg text-sm font-medium text-muted-foreground hover:text-foreground sm:order-none sm:w-auto sm:px-2", FOCUS)}>
          Solo no leídas{toggleTrack(onlyUnread)}
        </button>
        <div ref={menuRef} className="relative">
          <button ref={menuButtonRef} type="button" aria-label="Más opciones" aria-expanded={menuOpen} aria-controls="notif-tray-menu" onClick={() => setMenuOpen((value) => !value)} className={cn("inline-flex size-11 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground aria-expanded:bg-muted", FOCUS)}>
            <MoreVertical className="size-5" aria-hidden="true" />
          </button>
          {menuOpen && (
            <div id="notif-tray-menu" onKeyDown={onMenuKey} className="absolute top-full right-0 z-30 mt-1 w-72 max-w-[calc(100vw-2rem)] rounded-xl border border-border bg-popover p-1 text-popover-foreground shadow-lg">
              <button type="button" disabled={!allUnread} onClick={() => { setMenuOpen(false); onMarkRead(visible, true); }} className={menuItem}><CheckCheck className="size-4 shrink-0" aria-hidden="true" />Marcar todas como leídas</button>
              <button type="button" role="switch" aria-checked={soundEnabled} onClick={onToggleSound} className={menuItem}>
                <Volume2 className="size-4 shrink-0" aria-hidden="true" /><span className="mr-auto">Sonido al recibir</span>{toggleTrack(soundEnabled)}
              </button>
              <div className="-mx-1 my-1 h-px bg-border" />
              {/* One flow for device alerts (Settings): a bare browser permission is not an activation. */}
              <button type="button" onClick={() => { setMenuOpen(false); onOpenPreferences(); }} className={menuItem}>
                <SlidersHorizontal className="size-4 shrink-0" aria-hidden="true" />
                <span>Preferencias de notificación<span className="block text-xs text-muted-foreground">Qué te avisamos y por dónde</span></span>
              </button>
            </div>
          )}
        </div>
        <button type="button" aria-label="Cerrar notificaciones" onClick={onClose} className={cn("inline-flex size-11 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground lg:hidden", FOCUS)}>
          <X className="size-5" aria-hidden="true" />
        </button>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-x-3 border-b border-border px-4">
        <div role="group" aria-label="Mostrar" className="flex gap-5">
          {([["mine", "Para mí", mineUnread], ["all", "Todas", allUnread]] as const).map(([id, label, count]) => (
            <button key={id} type="button" aria-pressed={tab === id} onClick={() => setTab(id)} className={cn("-mb-px inline-flex min-h-11 items-center gap-1.5 border-b-2 text-sm font-semibold", tab === id ? "border-primary text-foreground dark:border-blue-400" : "border-transparent text-muted-foreground hover:text-foreground", FOCUS)}>
              {label}
              {count > 0 && <span className={cn("min-w-5 rounded-full px-1.5 text-center text-xs font-bold", tab === id ? "bg-blue-600 text-white" : "bg-muted text-foreground")}><span className="sr-only">, sin leer: </span>{count}</span>}
            </button>
          ))}
        </div>
        {tabUnread.length > 0 && <button type="button" onClick={() => onMarkRead(tabUnread, tab === "all")} className={cn("min-h-11 rounded-lg px-2 text-sm font-semibold text-blue-700 hover:bg-muted dark:text-blue-300", FOCUS)}>Marcar como leídas</button>}
      </div>

      {loadState === "error" && (
        <div role="alert" className="mx-4 mt-3 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-amber-500/40 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
          No pudimos actualizar. Ves lo último que cargó.
          <button type="button" onClick={onRetry} className={cn("min-h-11 rounded-lg border border-current px-3 font-semibold", FOCUS)}>Reintentar</button>
        </div>
      )}

      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain pb-1">
        {loadState === "loading" && !list.length && <p role="status" className="px-4 py-10 text-center text-sm text-muted-foreground">Cargando notificaciones…</p>}
        {empty && (
          <div className="flex flex-col items-center px-6 py-12 text-center">
            <span className="grid size-12 place-items-center rounded-2xl bg-muted text-muted-foreground"><Inbox className="size-6" aria-hidden="true" /></span>
            <p className="mt-4 text-sm font-semibold text-foreground">{empty.title}</p>
            <p className="mt-1 max-w-xs text-sm text-muted-foreground">{empty.text}</p>
            {empty.action && <button type="button" onClick={empty.action.run} className={cn("mt-4 min-h-11 rounded-lg border border-border px-4 text-sm font-semibold hover:bg-muted", FOCUS)}>{empty.action.label}</button>}
          </div>
        )}
        {groupByDay(list).map((group) => (
          <section key={group.label} aria-labelledby={`notif-day-${group.label}`}>
            <h3 id={`notif-day-${group.label}`} className="sticky top-0 z-20 bg-popover/95 px-4 pt-3 pb-1 text-xs font-bold text-muted-foreground backdrop-blur">{group.label}</h3>
            <ul>
              {group.items.map((n) => {
                const kind = notificationKind(n.eventType);
                const Icon = KIND_ICON[kind];
                const urgency = n.read ? null : urgencyLabel(n.eventType);
                const toggleLabel = n.read ? "Marcar como no leída" : "Marcar como leída";
                const tool = cn("inline-flex size-9 items-center justify-center gap-1.5 rounded-md whitespace-nowrap text-muted-foreground hover:bg-muted hover:text-foreground pointer-coarse:h-11 pointer-coarse:w-auto pointer-coarse:border pointer-coarse:border-border pointer-coarse:px-3 pointer-coarse:text-xs pointer-coarse:font-semibold", FOCUS);
                return (
                  <li key={n.id} className={cn("group relative grid grid-cols-[0.5rem_2.5rem_minmax(0,1fr)] gap-x-3 border-t border-border/60 py-3 pr-3 pl-2 first:border-t-0 has-[.row-link:focus-visible]:ring-2 has-[.row-link:focus-visible]:ring-ring has-[.row-link:focus-visible]:ring-inset", n.read ? "hover:bg-muted/50" : "bg-blue-50/70 hover:bg-blue-50 dark:bg-blue-950/30 dark:hover:bg-blue-950/50")}>
                    <span aria-hidden="true" className={cn("mt-4 size-2 justify-self-center rounded-full", n.read ? "bg-transparent" : "bg-blue-600 dark:bg-blue-400")} />
                    <span aria-hidden="true" className={cn("grid size-10 place-items-center rounded-xl", KIND_STYLE[kind])}><Icon className="size-5" /></span>
                    <div className="min-w-0">
                      <button type="button" onClick={() => onOpenItem(n)} className="row-link block w-full text-left outline-none after:absolute after:inset-0 after:content-['']">
                        <span className={cn("block text-sm leading-snug text-foreground", n.read ? "font-medium" : "font-bold")}>{!n.read && <span className="sr-only">No leída. </span>}{n.title || "Notificación"}</span>
                        <span className="mt-0.5 line-clamp-2 block text-sm leading-snug text-muted-foreground">{n.message}</span>
                      </button>
                      <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                        {urgency && <span className="inline-flex items-center gap-1 rounded-full bg-red-50 px-2 py-0.5 font-semibold text-red-700 dark:bg-red-950/60 dark:text-red-300"><Clock className="size-3" aria-hidden="true" />{urgency}</span>}
                        <time dateTime={n.timestamp} title={absolute(n.timestamp)}>{timeLabel(n.timestamp)}</time>
                        <span>{KIND_LABEL[kind]}</span>
                      </div>
                    </div>
                    <div className="absolute top-2 right-2 z-10 hidden gap-0.5 rounded-lg border border-border bg-card p-0.5 shadow-sm group-focus-within:flex group-hover:flex pointer-coarse:relative pointer-coarse:top-auto pointer-coarse:right-auto pointer-coarse:col-start-3 pointer-coarse:mt-2 pointer-coarse:flex pointer-coarse:flex-wrap pointer-coarse:gap-2 pointer-coarse:border-0 pointer-coarse:bg-transparent pointer-coarse:p-0 pointer-coarse:shadow-none">
                      <button type="button" aria-label={toggleLabel} title={toggleLabel} onClick={() => onToggleRead(n)} className={tool}>
                        {n.read ? <Circle className="size-4" aria-hidden="true" /> : <Check className="size-4" aria-hidden="true" />}
                        <span aria-hidden="true" className="hidden pointer-coarse:inline">{n.read ? "No leída" : "Leída"}</span>
                      </button>
                      <button type="button" aria-label="Archivar" title="Archivar" onClick={() => onArchive(n)} className={tool}>
                        <Archive className="size-4" aria-hidden="true" />
                        <span aria-hidden="true" className="hidden pointer-coarse:inline">Archivar</span>
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>
          </section>
        ))}
      </div>

      <div aria-live="polite" className="empty:hidden px-3 pb-2">
        {notice && (
          <div role={notice.error ? "alert" : "status"} className={cn("flex items-center gap-2 rounded-xl py-1 pr-1 pl-4 text-sm shadow-md", notice.error ? "bg-red-700 text-white" : "bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900")}>
            <span className="mr-auto py-2">{notice.text}</span>
            {notice.undo && <button type="button" onClick={notice.undo} className={cn("min-h-11 rounded-lg px-3 font-semibold text-blue-300 underline-offset-2 hover:underline dark:text-blue-700", FOCUS)}>Deshacer</button>}
            <button type="button" aria-label="Cerrar aviso" onClick={dismissNotice} className={cn("inline-flex size-11 items-center justify-center rounded-lg opacity-80 hover:opacity-100", FOCUS)}><X className="size-4" aria-hidden="true" /></button>
          </div>
        )}
      </div>

      <Link href="/admin/notifications" onClick={onClose} className={cn("flex min-h-11 items-center justify-center border-t border-border text-sm font-semibold text-blue-700 hover:bg-muted dark:text-blue-300", FOCUS)}>
        Ver todas las notificaciones
      </Link>
    </div>
  );
}
