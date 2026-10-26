"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { CalendarCheck, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { isMockDataMode } from "@/lib/data-mode";
import { loadEverpropVisits } from "@/lib/everprop-api";
import { listConversations } from "@/lib/conversations-api";
import { useCurrentSession } from "@/hooks/use-current-session";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import {
  confirmVisitRequest,
  declineVisitRequest,
  formatSlot,
  listVisitRequests,
  slotToLocalInput,
  type VisitRequest,
} from "@/lib/assistant-api";

export function VisitRequestsBoard({ conversationId, channelLabel }: { conversationId?: string; channelLabel?: string } = {}) {
  const { user } = useCurrentSession();
  const readOnly = user?.apiRole === "READ_ONLY";
  const [items, setItems] = useState<VisitRequest[]>([]);
  const [error, setError] = useState("");
  const [when, setWhen] = useState<Record<string, string>>({});
  const [confirmation, setConfirmation] = useState<{ item: VisitRequest; date: string } | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [confirmError, setConfirmError] = useState("");
  const [tab, setTab] = useState("pending");
  const [editing, setEditing] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [metadataWarning, setMetadataWarning] = useState("");
  const [asOf, setAsOf] = useState(() => Date.now());

  const refresh = useCallback(async () => {
    try {
      const requested = await listVisitRequests("REQUESTED");
      if (conversationId) {
        setItems(requested.data);
      } else {
        const responses = await Promise.all([listVisitRequests("CONFIRMED"), listVisitRequests("DECLINED"), listVisitRequests("CANCELLED")]);
        const rows = [...requested.data, ...responses.flatMap(response => response.data)];
        for (const item of rows) item.slots = [...item.slots].sort((a, b) => Date.parse(a.start_utc) - Date.parse(b.start_utc));
        if (!isMockDataMode) {
          const [visits, conversations] = await Promise.allSettled([loadEverpropVisits(), listConversations("all")]);
          for (const item of rows) {
            const visit = visits.status === "fulfilled" ? visits.value.find(v => v.id === item.visit_id) : undefined;
            const conversation = conversations.status === "fulfilled" ? conversations.value.data.find(c => c.id === item.conversation_id) : undefined;
            item.scheduled_at = visit?.scheduledAt;
            if (visit?.status === "cancelled") item.status = "CANCELLED";
            item.channel = conversation?.channel === "WHATSAPP" ? "WhatsApp" : conversation?.channel === "WEB_CHAT" ? "Web" : undefined;
          }
          setMetadataWarning(visits.status === "rejected" || conversations.status === "rejected" ? "Algunos horarios o canales no se pudieron cargar. Usá Actualizar para reintentar." : "");
        }
        setItems(rows);
      }
      setError("");
      setAsOf(Date.now());
    } catch {
      setError("No se pudieron cargar las solicitudes. Usá Actualizar para reintentar.");
    } finally {
      setLoading(false);
    }
  }, [conversationId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  function confirm(item: VisitRequest) {
    if (readOnly) return;
    const value = when[item.id] ?? (item.slots[0] ? slotToLocalInput(item.slots[0].start_utc) : "");
    if (!value) return toast.error("Elegí fecha y hora.");
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return toast.error("Elegí una fecha y hora válidas.");
    setConfirmError("");
    setConfirmation({ item, date: date.toISOString() });
  }

  async function saveConfirmation() {
    if (readOnly || !confirmation || confirming) return;
    setConfirming(true);
    try {
      await confirmVisitRequest(confirmation.item.id, confirmation.date);
      setConfirmation(null);
      toast.success("Visita agendada. Avisale al cliente desde la conversación.");
      await refresh();
    } catch {
      setConfirmError("No se pudo confirmar. Revisá si ya se resolvió o si la fecha es pasada.");
    } finally {
      setConfirming(false);
    }
  }

  async function decline(item: VisitRequest) {
    if (readOnly) return;
    if (!window.confirm("¿Rechazar esta solicitud? Avisale al cliente desde la conversación.")) return;
    try {
      await declineVisitRequest(item.id);
      await refresh();
    } catch {
      toast.error("No se pudo rechazar.");
    }
  }

  const visibleItems = conversationId ? items.filter(item => item.conversation_id === conversationId) : items;
  const past = visibleItems.filter(item => item.status === "DECLINED" || item.status === "CANCELLED" ||
    (item.status === "CONFIRMED" && item.scheduled_at && Date.parse(item.scheduled_at) < asOf) ||
    (item.status === "REQUESTED" && item.slots.length > 0 && item.slots.every(slot => Date.parse(slot.end_utc) < asOf)));
  const pending = visibleItems.filter(item => item.status === "REQUESTED" && !past.includes(item)).sort((a, b) =>
    (Date.parse(a.slots[0]?.start_utc) || Infinity) - (Date.parse(b.slots[0]?.start_utc) || Infinity));
  const confirmed = visibleItems.filter(item => item.status === "CONFIRMED" && !past.includes(item));
  const selected = tab === "past" ? past : confirmed;
  const scheduledLabel = (item: VisitRequest) => item.scheduled_at
    ? new Date(item.scheduled_at).toLocaleString("es-AR", { weekday: "long", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZone: "America/Argentina/Buenos_Aires" })
    : "Horario acordado no disponible";
  const actions = (item: VisitRequest, featured: boolean) => !readOnly && <div className="visit-actions">
    <button type="button" className={featured ? "visit-white" : "mi-day-primary"} onClick={() => confirm(item)}>Confirmar</button>
    <button type="button" className="mi-day-secondary" aria-expanded={editing === item.id} onClick={() => setEditing(editing === item.id ? null : item.id)}>{featured ? "Proponer otro horario" : "Otro horario"}</button>
    {editing === item.id && <div className="visit-editor">
      <p>Acordá el horario con el cliente antes de confirmar.</p>
      <Link href={`/admin/conversaciones?c=${item.conversation_id}`}>Hablar con el cliente</Link>
      <label>Fecha y hora acordada
        <input type="datetime-local" value={when[item.id] ?? (item.slots[0] ? slotToLocalInput(item.slots[0].start_utc) : "")}
          onChange={e => setWhen({ ...when, [item.id]: e.target.value })} />
      </label>
      <button type="button" className="mi-day-primary" onClick={() => confirm(item)}>Revisar y confirmar visita</button>
      <button type="button" className="mi-day-secondary" onClick={() => void decline(item)}>Rechazar solicitud</button>
    </div>}
  </div>;

  return (
    <section className={conversationId ? "conversation-visits" : "mi-day visit-board"}>
      {conversationId && <section className="conversation-about">
        <h2>Sobre este cliente</h2>
        <dl>
          <div><dt>Interés solicitado</dt><dd>{error ? "No se pudo cargar el interés de las solicitudes." : visibleItems.length ? visibleItems.map(item => [item.property.code, item.property.title].filter(Boolean).join(" · ")).join("; ") : "Sin solicitudes de visita pendientes."}</dd></div>
          <div><dt>Etapa comercial</dt><dd>Consultar en la ficha del cliente</dd></div>
          <div><dt>Origen de la conversación</dt><dd>{channelLabel}</dd></div>
        </dl>
      </section>}
      {conversationId ? <><header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          {conversationId ? <h2>Visitas solicitadas</h2> : <h1 className="text-2xl font-bold">Solicitudes de visita</h1>}
          <p className="mt-1 text-sm text-muted-foreground">Pedidas por clientes al asistente. No están agendadas hasta que las confirmes acá.</p>
        </div>
        <button type="button" onClick={() => void refresh()} className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-border bg-card px-4 text-sm font-semibold">
          <RefreshCw className="h-4 w-4" aria-hidden /> Actualizar
        </button>
      </header>
      {error && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-800 dark:bg-red-500/10 dark:text-red-200">{error}</p>}
      <ul role="list" className="grid gap-3">
        {visibleItems.length === 0 && !error && <li className="rounded-2xl border border-border bg-card p-6 text-center text-sm text-muted-foreground">No hay solicitudes pendientes.</li>}
        {visibleItems.map((item) => (
          <li key={item.id} className={`${conversationId ? "conversation-visit " : ""}grid gap-3 rounded-2xl border border-border bg-card p-4`}>
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="font-bold">Solicitada · por confirmar</p>
                <p className="flex items-center gap-2 font-semibold"><CalendarCheck className="h-4 w-4" aria-hidden /> {item.property.code ?? ""} {item.property.title}</p>
                <p className="text-sm text-muted-foreground">
                  {item.contact.name || "Visitante"} · {item.contact.phone ?? "sin teléfono"} {item.contact.email ? `· ${item.contact.email}` : ""}
                  {item.contact.unverified.length > 0 && " · datos declarados en el chat, sin verificar"}
                </p>
              </div>
              {!conversationId && <Link href={`/admin/conversaciones?c=${item.conversation_id}`} className="text-sm font-semibold text-blue-700 underline dark:text-blue-300">Ver conversación</Link>}
            </div>
            <ul className="text-sm">
              {item.slots.map((slot) => <li key={slot.start_utc}>• {formatSlot(slot)}</li>)}
            </ul>
            {item.note && <p className="rounded-lg bg-muted p-2 text-sm">“{item.note}”</p>}
            {!readOnly && (
              <div className="flex flex-wrap items-end gap-2">
                <label className="grid gap-1 text-sm font-medium">
                  Fecha y hora acordada
                  <input type="datetime-local" value={when[item.id] ?? (item.slots[0] ? slotToLocalInput(item.slots[0].start_utc) : "")}
                    onChange={(e) => setWhen({ ...when, [item.id]: e.target.value })} className="min-h-11 rounded-xl border border-border bg-background px-3 text-sm" />
                </label>
                <button type="button" onClick={() => void confirm(item)} className="mi-day-primary">Revisar y confirmar visita</button>
                <button type="button" onClick={() => void decline(item)} className="min-h-11 rounded-xl border border-border px-4 text-sm font-semibold">Rechazar</button>
              </div>
            )}
          </li>
        ))}
      </ul>
      </> : <>
        <header className="visit-heading">
          <div><h1>Solicitudes de visita</h1><p>Ninguna está confirmada hasta que vos la confirmes.</p></div>
          <div className="visit-tabs" role="group" aria-label="Estado de las solicitudes">
            {[["pending", "Por confirmar", pending.length], ["confirmed", "Confirmadas", confirmed.length], ["past", "Pasadas", past.length]].map(([value, label, count]) =>
              <button key={value} type="button" aria-pressed={tab === value} onClick={() => setTab(String(value))}>{label} · {count}</button>)}
          </div>
        </header>
        <div className="visit-toolbar"><p>{readOnly ? "Solo lectura" : "Revisá cada pedido y acordá la visita con el cliente."}</p><button type="button" className="mi-day-secondary" onClick={() => void refresh()}><RefreshCw aria-hidden /> Actualizar</button></div>
        {error && <p role="alert" className="visit-alert">{error}</p>}
        {metadataWarning && <p role="status" className="visit-alert">{metadataWarning}</p>}
        {loading && <p role="status">Cargando solicitudes…</p>}
        {!loading && !error && tab === "pending" && <ul className="visit-grid" aria-label="Solicitudes por confirmar">
          {!pending.length && <li className="visit-empty"><CalendarCheck aria-hidden /><h2>No hay solicitudes pendientes</h2><p>Los nuevos pedidos del asistente aparecerán acá.</p></li>}
          {pending.map((item, index) => <li key={item.id} className={`visit-card ${index === 0 ? "visit-featured" : "visit-pending"}`}>
            {index === 0 && <p>La más cercana</p>}
            <p className="visit-date">{item.slots[0] ? formatSlot(item.slots[0]) : "Fecha a coordinar"}</p>
            <span className="visit-status">Solicitada · por confirmar</span>
            <h2>{item.contact.name || "Visitante"}</h2>
            <p>{item.property.code ?? "Código sin informar"} · {item.property.title}</p>
            <p>Canal: {item.channel || "Sin informar"}</p>
            <p>Pidió el {new Date(item.created_at).toLocaleString("es-AR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", timeZone: "America/Argentina/Buenos_Aires" })}</p>
            {item.contact.unverified.length > 0 && <p>Datos declarados en el chat, sin verificar</p>}
            {item.slots.slice(1).map(slot => <p key={slot.start_utc}>{formatSlot(slot)}</p>)}
            {item.note && <blockquote>“{item.note}”</blockquote>}
            {actions(item, index === 0)}
            <Link className="visit-conversation" href={`/admin/conversaciones?c=${item.conversation_id}`}>Ver conversación</Link>
          </li>)}
        </ul>}
        {!loading && !error && <section className="visit-confirmed">
          <header><h2>{tab === "past" ? "Solicitudes pasadas" : "Visitas confirmadas"}</h2><span>{selected.length}</span></header>
          <div className="visit-table" role="table" aria-label={tab === "past" ? "Solicitudes pasadas" : "Visitas confirmadas"}>
            <div className="visit-table-head" role="row">{["Día y hora", "Cliente", "Qué va a ver", "Estado", "Conversación"].map(label => <span role="columnheader" key={label}>{label}</span>)}</div>
            {selected.map(item => <div className="visit-table-row" role="row" key={item.id}>
              <div role="cell"><span className="visit-mobile-label">Día y hora</span><b>{scheduledLabel(item)}</b></div>
              <div role="cell"><span className="visit-mobile-label">Cliente</span>{item.contact.name || "Visitante"}</div>
              <div role="cell"><span className="visit-mobile-label">Qué va a ver</span>{item.property.code ?? "Código sin informar"} · {item.property.title}</div>
              <div role="cell"><span className={`visit-status ${item.status === "CONFIRMED" ? "visit-success" : ""}`}>{item.status === "CONFIRMED" ? (item.confirmed_by ? `Confirmada por ${item.confirmed_by}` : "Confirmada · autor no disponible") : item.status === "DECLINED" ? "Rechazada" : item.status === "REQUESTED" ? "Solicitada · horario vencido" : "Cancelada"}</span></div>
              <div role="cell"><Link className="mi-day-secondary" href={`/admin/conversaciones?c=${item.conversation_id}`}>Ver conversación</Link></div>
            </div>)}
          </div>
          {!selected.length && <p className="visit-empty">{tab === "past" ? "No hay solicitudes pasadas." : "Todavía no hay visitas confirmadas."}</p>}
        </section>}
      </>}
      {!readOnly && <Dialog open={Boolean(confirmation)} onOpenChange={open => { if (!open && !confirming) setConfirmation(null); }}>
        <DialogContent showCloseButton={false} className="admin-workspace mi-day mi-day-guide sm:max-w-xl max-h-[calc(100dvh-2rem)] overflow-y-auto p-6">
          <DialogTitle className="text-2xl font-bold">¿Confirmamos la visita?</DialogTitle>
          <DialogDescription>Revisá los datos antes de agendar. Después avisale al cliente desde la conversación.</DialogDescription>
          {confirmation && <dl className="space-y-3 break-words">
            <div><dt className="font-bold">Cliente</dt><dd>{confirmation.item.contact.name || "Visitante (nombre sin informar)"}</dd></div>
            <div><dt className="font-bold">Unidad</dt><dd>{confirmation.item.property.code ?? "Código sin informar"} · {confirmation.item.property.title}</dd></div>
            <div><dt className="font-bold">Fecha y hora</dt><dd>{(() => { const slot = confirmation.item.slots.find(s => new Date(s.start_utc).getTime() === new Date(confirmation.date).getTime()); return slot ? formatSlot(slot) : new Date(confirmation.date).toLocaleString("es-AR", { dateStyle: "full", timeStyle: "short", timeZone: "America/Argentina/Buenos_Aires" }); })()}</dd></div>
          </dl>}
          {confirmError && <p role="alert" className="text-rose-700 dark:text-rose-300">{confirmError}</p>}
          <Button className="mi-day-primary" disabled={confirming} onClick={() => void saveConfirmation()}>{confirming ? "Confirmando…" : "Confirmar y agendar"}</Button>
          <Button variant="outline" disabled={confirming} onClick={() => setConfirmation(null)}>Todavía no</Button>
        </DialogContent>
      </Dialog>}
    </section>
  );
}
