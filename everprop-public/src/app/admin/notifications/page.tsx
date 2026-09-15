"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { PushPreferences } from "@/components/admin/PushPreferences";
import { Bell, Check } from "lucide-react";
import { useCurrentSession } from "@/hooks/use-current-session";
import { fetchNotifications, markNotificationAsRead, type AppNotification } from "@/lib/notifications";

export default function NotificationsPage() {
  const { user } = useCurrentSession();
  const [items, setItems] = useState<AppNotification[]>([]);
  const [filter, setFilter] = useState<"all" | "unread">("all");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const refresh = useCallback(async () => {
    if (!user) return;
    try { setItems(await fetchNotifications(user)); setError(""); }
    catch { setError("No pudimos actualizar las notificaciones. Reintentá."); }
    finally { setLoading(false); }
  }, [user]);
  useEffect(() => { void refresh(); const timer = window.setInterval(() => void refresh(), 30000); return () => clearInterval(timer); }, [refresh]);
  const visible = items.filter((item) => filter !== "unread" || !item.read);
  async function update(item: AppNotification) {
    if (busy) return;
    setBusy(item.id);
    try {
      await markNotificationAsRead(item.id);
      window.dispatchEvent(new Event("everprop_notifications_updated"));
      await refresh();
    } catch { setError("No se pudo guardar el cambio. Reintentá."); }
    finally { setBusy(null); }
  }
  return <section className="mx-auto w-full max-w-5xl min-w-0 space-y-5 pb-8">
    <header><h1 className="text-2xl font-bold">Notificaciones</h1><p className="mt-2 text-sm text-muted-foreground">Novedades y asignaciones de tu cuenta.</p></header>
    <details className="rounded-xl border border-border bg-card"><summary className="cursor-pointer px-4 py-3 text-sm font-semibold">Configurar avisos del dispositivo</summary><div className="px-3 pb-3"><PushPreferences /></div></details>
    <div role="group" aria-label="Filtrar notificaciones" className="grid grid-cols-2 gap-1 sm:flex sm:gap-2">
      {([["all", "Todas"], ["unread", "No leídas"]] as const).map(([id, label]) => <button key={id} type="button" aria-pressed={filter === id} onClick={() => setFilter(id)} className={`min-h-11 rounded-xl border px-2 py-2 text-xs sm:px-4 sm:text-sm font-semibold ${filter === id ? "border-blue-600 bg-blue-600 text-white" : "border-border bg-card"}`}>{label}</button>)}
    </div>
    {error && <div role="alert" className="rounded-xl border border-amber-500/40 p-4 text-sm">{error}<button type="button" onClick={() => void refresh()} className="ml-3 underline">Reintentar</button></div>}
    {loading ? <p role="status">Cargando notificaciones…</p> : visible.length === 0 ? <div className="rounded-2xl border border-border bg-card p-8 text-center"><Bell className="mx-auto mb-3 size-6"/><p>No hay notificaciones en esta vista.</p></div> : <ul className="space-y-3">{visible.map((item) => {
      const url = item.actionUrl?.startsWith("/admin/") ? item.actionUrl : item.leadId ? `/admin/leads/${item.leadId}` : null;
      return <li key={item.id} className={`min-w-0 rounded-2xl border p-4 sm:p-5 ${item.read ? "border-border bg-card" : "border-blue-500/50 bg-blue-500/5"}`}>
        <div className="flex flex-wrap justify-between gap-2"><h2 className="font-semibold break-words">{item.title || "Notificación"}{" "}{!item.read && <span className="ml-2 text-xs text-blue-600 dark:text-blue-300">Nueva</span>}</h2><time className="text-xs text-muted-foreground" dateTime={item.timestamp}>{new Date(item.timestamp).toLocaleString("es-AR", {timeZone:"America/Argentina/Buenos_Aires",dateStyle:"medium",timeStyle:"short"})}</time></div>
        <p className="mt-2 break-words text-sm text-muted-foreground">{item.message}</p>
        <div className="mt-3 flex flex-wrap gap-2">
          {url && <Link href={url} className="inline-flex min-h-11 items-center rounded-lg border border-border px-3 text-sm">Ver detalle</Link>}
          {!item.read && <button type="button" disabled={busy !== null} onClick={() => void update(item)} className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-border px-3 text-sm disabled:opacity-50"><Check className="size-4"/>Marcar leída</button>}
        </div>
      </li>;
    })}</ul>}
  </section>;
}
