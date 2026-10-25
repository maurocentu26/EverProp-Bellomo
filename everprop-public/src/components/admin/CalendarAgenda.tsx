"use client";

import { useEffect, useMemo, useState, useCallback, useRef } from "react";
import Link from "next/link";
import { ChevronLeft, ChevronRight, CalendarDays, Clock, Building2, Plus, MessageCircle } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { toast } from "sonner";
import type { Visit } from "@/data/admin-sample";
import { loadLeadFollowUpList, loadLeadList, loadPropertyList, removeVisitById } from "@/lib/admin-storage";
import { Button } from "@/components/ui/button";
import { useCurrentSession } from "@/hooks/use-current-session";
import { useDashboardMode } from "@/lib/dashboard-context";
import { leads as sampleLeads, properties as sampleProperties } from "@/data/admin-sample";
import { getAdvisor } from "@/data/auth-sample";
import { cn } from "@/lib/utils";
import { deferEffectUpdate } from "@/lib/deferred-effect";
import { isMockDataMode } from "@/lib/data-mode";
import { loadEverpropVisits, cancelEverpropVisit } from "@/lib/everprop-api";
import { toArgentinaDateTimeInputValue, ARGENTINA_TIME_ZONE, formatArgentinaDateTime } from "@/lib/lead-follow-up";
import { seedMockAgenda } from "@/lib/mock-agenda";
import { NewVisitModal } from "@/components/admin/NewVisitModal";

type AgendaItem = Visit & {
  leadName: string;
  propertyTitle?: string;
  propertyType?: string;
  phone?: string;
  email?: string;
  agentName?: string;
  agentAvatar?: string;
};

const WEEKDAYS = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];
const MONTHS_ES = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
];

function getMonthGrid(date: Date) {
  const year = date.getFullYear();
  const month = date.getMonth();
  const firstDay = (new Date(year, month, 1).getDay() + 6) % 7;
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const days: { date: Date; current: boolean }[] = [];
  for (let i = 0; i < firstDay; i++)
    days.push({ date: new Date(year, month, i - firstDay + 1), current: false });
  for (let d = 1; d <= daysInMonth; d++)
    days.push({ date: new Date(year, month, d), current: true });
  while (days.length < 42)
    days.push({ date: new Date(year, month + 1, days.length - firstDay - daysInMonth + 1), current: false });
  return days;
}

function toKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

export default function CalendarAgenda() {
  // ─── All hooks at top ────────────────────────────────────────────────────
  const { isAdvisor, isAdmin, user } = useCurrentSession();
  const { globalSelectedAgentId } = useDashboardMode();
  const [today, setToday] = useState(() => new Date());
  const [viewDate, setViewDate] = useState(() => new Date(`${toArgentinaDateTimeInputValue().slice(0, 10)}T12:00:00`));
  const [selectedDate, setSelectedDate] = useState(() => new Date(`${toArgentinaDateTimeInputValue().slice(0, 10)}T12:00:00`));
  const [items, setItems] = useState<AgendaItem[]>([]);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [activeFilter, setActiveFilter] = useState<"all" | "scheduled" | "completed" | "cancelled">("all");
  const [showNewVisitModal, setShowNewVisitModal] = useState(false);
  const [view, setView] = useState<"day" | "week" | "month">("week");
  const [isDeleting, setIsDeleting] = useState(false);
  const deleting = useRef(false);

  const [loadError, setLoadError] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const loadItems = useCallback(async () => {
    setToday(new Date());
    if (!isMockDataMode) {
      try {
        const visits = await loadEverpropVisits();
        setItems(isAdmin && globalSelectedAgentId !== "all" ? visits.filter(v => v.agentId === globalSelectedAgentId) : visits);
        setLoadError("");
      } catch {
        setLoadError("No pudimos actualizar la agenda. Reintentaremos automáticamente.");
      } finally { setIsLoading(false); }
      return;
    }
    seedMockAgenda();
    let leads = loadLeadList(sampleLeads, "c1");
    const properties = loadPropertyList(sampleProperties, "c1");

    const effectiveAgentId = isAdvisor ? user?.id : globalSelectedAgentId;
    if (effectiveAgentId && effectiveAgentId !== "all") {
      leads = leads.filter((l) => l.agentId === effectiveAgentId);
    }

    const fromLeads = leads.flatMap((lead) =>
      (lead.visits ?? []).map((v) => {
        const prop = properties.find((p) => p.id === v.propertyId);
        const agent = getAdvisor(v.agentId);
        return {
          ...v,
          leadName: v.leadName || lead.name,
          propertyTitle: v.propertyTitle || prop?.title,
          propertyType: prop?.propertyType,
          phone: v.phone || lead.phone,
          email: v.email || lead.email,
          agentName: agent?.name,
          agentAvatar: agent?.avatar,
        };
      })
    );

    const fromProperties = properties.flatMap((prop) =>
      (prop.visits ?? []).map((v) => {
        const agent = getAdvisor(v.agentId);
        return {
          ...v,
          leadName: v.leadName || "Visitante",
          propertyTitle: v.propertyTitle || prop.title,
          propertyType: prop.propertyType,
          phone: v.phone,
          email: v.email,
          agentName: agent?.name,
          agentAvatar: agent?.avatar,
        };
      })
    );

    const followUps = loadLeadFollowUpList([], "c1");
    const fromFollowUps: AgendaItem[] = followUps
      .filter((fu) => Boolean(fu.nextContactAt))
      .map((fu) => {
        const lead = leads.find((l) => l.id === fu.leadId);
        const agent = getAdvisor(fu.agentId);
        return {
          id: `followup-${fu.id}`,
          scheduledAt: fu.nextContactAt!,
          status: "scheduled" as const,
          leadId: fu.leadId,
          leadName: lead?.name || "Lead",
          propertyTitle: "Seguimiento comercial",
          notes: fu.nextAction || `Próximo contacto · ${fu.type}`,
          phone: lead?.phone,
          email: lead?.email,
          agentId: fu.agentId,
          agentName: agent?.name,
          agentAvatar: agent?.avatar,
        };
      });

    const map = new Map<string, AgendaItem>();
    [...fromLeads, ...fromProperties, ...fromFollowUps].forEach((it) => {
      if (!map.has(it.id)) map.set(it.id, it);
    });

    let merged = Array.from(map.values());
    if (isAdvisor) {
      merged = merged.filter((v) => v.agentId === user?.id);
    } else if (isAdmin && globalSelectedAgentId !== "all") {
      merged = merged.filter((v) => v.agentId === globalSelectedAgentId);
    }

    setItems(merged);
    setIsLoading(false);
  }, [isAdvisor, isAdmin, user, globalSelectedAgentId]);

  useEffect(() => {
    deferEffectUpdate(loadItems);
    const handleUpdated = () => deferEffectUpdate(loadItems);
    window.addEventListener("everprop_leads_updated", handleUpdated);
    const refresh = () => { if (document.visibilityState === "visible") void loadItems(); };
    const timer = window.setInterval(refresh, 30000);
    window.addEventListener("focus", refresh);
    const channel = new BroadcastChannel("everprop_leads");
    channel.onmessage = refresh;
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("focus", refresh);
      channel.close();
      window.removeEventListener("everprop_leads_updated", handleUpdated);
    };
  }, [loadItems]);

  // ─── Derived data ────────────────────────────────────────────────────────
  const grid = useMemo(() => getMonthGrid(viewDate), [viewDate]);

  const eventsByDay = useMemo(() => {
    const map = new Map<string, AgendaItem[]>();
    items.forEach((it) => {
      const k = toArgentinaDateTimeInputValue(new Date(it.scheduledAt)).slice(0, 10);
      map.set(k, [...(map.get(k) ?? []), it]);
    });
    return map;
  }, [items]);

  const selectedDayKey = useMemo(() => toKey(selectedDate), [selectedDate]);
  const selectedDayItems = useMemo(() => {
    const dayItems = eventsByDay.get(selectedDayKey) ?? [];
    return dayItems.filter(it => activeFilter === "all" || it.status === activeFilter)
      .sort((a, b) => Date.parse(a.scheduledAt) - Date.parse(b.scheduledAt));
  }, [eventsByDay, selectedDayKey, activeFilter]);
  const nextToday = items.filter(it => it.status === "scheduled" && Date.parse(it.scheduledAt) >= today.getTime()
    && toArgentinaDateTimeInputValue(new Date(it.scheduledAt)).slice(0, 10) === toArgentinaDateTimeInputValue(today).slice(0, 10))
    .sort((a, b) => Date.parse(a.scheduledAt) - Date.parse(b.scheduledAt))[0];
  const weekStart = new Date(viewDate.getFullYear(), viewDate.getMonth(), viewDate.getDate() - (viewDate.getDay() + 6) % 7);
  const visibleDays = view === "month" ? grid : Array.from({ length: 7 }, (_, i) => ({ date: new Date(weekStart.getFullYear(), weekStart.getMonth(), weekStart.getDate() + i), current: true }));
  const nextPhone = nextToday?.phone?.replace(/[^0-9]/g, "");
  const whatsappPhone = nextPhone && !nextPhone.startsWith("54") ? `549${nextPhone}` : nextPhone;
  const cancelledItem = items.find(item => item.id === deletingId);
  function selectDay(date: Date) { setSelectedDate(date); setViewDate(date); }
  function moveDate(direction: number) {
    selectDay(view === "month" ? new Date(viewDate.getFullYear(), viewDate.getMonth() + direction, 1)
      : new Date(viewDate.getFullYear(), viewDate.getMonth(), viewDate.getDate() + direction * (view === "week" ? 7 : 1)));
  }
  const time = (value: string) => new Date(value).toLocaleTimeString("es-AR", { timeZone: ARGENTINA_TIME_ZONE, hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
  const dayLabel = (date: Date) => formatArgentinaDateTime(`${toKey(date)}T12:00:00-03:00`).split(",")[0];
  const statusLabel = (status: string) => status === "completed" ? "Realizada" : status === "cancelled" ? "Cancelada" : "Programada";

  const handleDelete = useCallback(async (id: string) => {
    if (deleting.current || id.startsWith("followup-")) return;
    deleting.current = true;
    setIsDeleting(true);
    try {
    if (!isMockDataMode) {
      try {
        await cancelEverpropVisit(id);
        await loadItems();
        setDeletingId(null);
        window.dispatchEvent(new Event("everprop_leads_updated"));
        const channel = new BroadcastChannel("everprop_leads");
        channel.postMessage({ type: "LEADS_UPDATED" });
        channel.close();
        toast.success("Cita cancelada");
      } catch { toast.error("No se pudo cancelar la cita. Los datos se conservaron."); }
      return;
    }
    removeVisitById(id, sampleLeads, sampleProperties);
    setItems((prev) => prev.filter((it) => it.id !== id));
    setDeletingId(null);
    toast.success("Visita eliminada");
    } finally { deleting.current = false; setIsDeleting(false); }
  }, [loadItems]);

  return (
    <div className="mi-agenda">
      <header className="agenda-heading">
        <div><h1>Mi Agenda</h1><p>Organizá tus visitas y próximos contactos.</p></div>
        <Button className="agenda-primary" onClick={() => setShowNewVisitModal(true)}><Plus />Agendar cita</Button>
      </header>
      {loadError && <div role="alert" className="agenda-notice">{loadError}<Button variant="outline" onClick={loadItems}>Reintentar</Button></div>}
      {isLoading ? <p role="status">Cargando agenda…</p> : !loadError && <section className="agenda-focus" aria-labelledby="agenda-next">
        <h2 id="agenda-next">{nextToday ? "Lo próximo de hoy" : "Sin actividades próximas hoy"}</h2>
        {nextToday ? <><p className="agenda-focus-time">{time(nextToday.scheduledAt)}</p><h3>{nextToday.leadName}</h3><p>{nextToday.propertyTitle || "Sin unidad vinculada"}</p><p>{formatArgentinaDateTime(nextToday.scheduledAt)}</p>{nextToday.notes && <p>{nextToday.notes}</p>}<div className="agenda-actions">{nextToday.leadId && <Link href={`/admin/leads/${nextToday.leadId}`}>Abrir ficha</Link>}{whatsappPhone && <a href={`https://wa.me/${whatsappPhone}`} target="_blank" rel="noopener noreferrer"><MessageCircle />WhatsApp</a>}<Button onClick={() => selectDay(new Date(`${toArgentinaDateTimeInputValue(new Date(nextToday.scheduledAt)).slice(0, 10)}T12:00:00`))}>Ver el día</Button></div></>
          : <p>Elegí una fecha para consultar tu agenda o agendá una nueva cita.</p>}
      </section>}
      <nav className="agenda-toolbar" aria-label="Período de agenda">
        <div className="agenda-tabs">{([['day', 'Día'], ['week', 'Semana'], ['month', 'Mes']] as const).map(([key, label]) => <button key={key} aria-pressed={view === key} onClick={() => setView(key)}>{label}</button>)}</div>
        <div className="agenda-actions"><button onClick={() => moveDate(-1)}><ChevronLeft />Anterior</button><button onClick={() => selectDay(new Date(`${toArgentinaDateTimeInputValue(today).slice(0, 10)}T12:00:00`))}>Hoy</button><button onClick={() => moveDate(1)}>Siguiente<ChevronRight /></button></div>
      </nav>
      <div className="agenda-layout">
        {view !== "day" && <section className="agenda-calendar" aria-label="Calendario">
          <h2>{MONTHS_ES[viewDate.getMonth()]} {viewDate.getFullYear()}</h2>
          <div className={`agenda-days agenda-days-${view}`}>
            {visibleDays.map(({ date, current }, index) => {
              const key = toKey(date), count = (eventsByDay.get(key) ?? []).length, month = view === "month";
              return <button key={key} className={cn(!current && "agenda-other-month")} aria-pressed={selectedDayKey === key} aria-label={`${dayLabel(date)}, ${count} ${count === 1 ? "actividad" : "actividades"}`} onClick={() => selectDay(date)}>
                {(!month || index < 7) && <span>{WEEKDAYS[date.getDay()]}</span>}<strong>{date.getDate()}</strong><span>{count > 0 ? `${count} ${count === 1 ? "cita" : "citas"}` : month ? "" : "—"}</span>
              </button>;
            })}
          </div>
        </section>}
        <section className="agenda-day" aria-labelledby="agenda-selected-day">
          <div className="agenda-day-heading"><CalendarDays /><h2 id="agenda-selected-day">{dayLabel(selectedDate)}</h2></div>
          <div className="agenda-tabs" aria-label="Estado de las actividades">{([['all', 'Todas'], ['scheduled', 'Pendientes'], ['completed', 'Realizadas'], ['cancelled', 'Canceladas']] as const).map(([key, label]) => <button key={key} aria-pressed={activeFilter === key} onClick={() => setActiveFilter(key)}>{label}</button>)}</div>
          {!isLoading && !loadError && <p>{selectedDayItems.length} {selectedDayItems.length === 1 ? "actividad" : "actividades"}</p>}
          {!isLoading && !loadError && selectedDayItems.length === 0 && <p className="agenda-empty">No hay actividades para este día y estado.</p>}
          <div className="agenda-list">{selectedDayItems.map(ev => {
            const followUp = ev.id.startsWith("followup-");
            let phone = ev.phone?.replace(/[^0-9]/g, "");
            if (phone && !phone.startsWith("54")) phone = `549${phone}`;
            return <article key={ev.id} className="agenda-event">
              <div className="agenda-time"><Clock /><strong>{time(ev.scheduledAt)}</strong></div>
              <div className="agenda-event-content"><div className="agenda-event-title"><h3>{ev.leadName}</h3><span className="agenda-status">{followUp ? "Seguimiento" : statusLabel(ev.status)}</span></div>
                <p><Building2 />{ev.propertyTitle || "Sin unidad vinculada"}</p><p>{formatArgentinaDateTime(ev.scheduledAt)}</p>
                {ev.agentName && <p>Asesor: {ev.agentName}</p>}{ev.phone && <p>{ev.phone}</p>}{ev.email && <p>{ev.email}</p>}{ev.notes && <p>{ev.notes}</p>}
                <div className="agenda-actions">{ev.leadId && <Link href={`/admin/leads/${ev.leadId}`}>Ver cliente</Link>}
                  {phone && <a href={`https://wa.me/${phone}?text=${encodeURIComponent(`Hola ${ev.leadName}, te contacto por ${ev.propertyTitle || "nuestra cita"} (${formatArgentinaDateTime(ev.scheduledAt)}).`)}`} target="_blank" rel="noopener noreferrer"><MessageCircle />WhatsApp</a>}
                  {!followUp && ev.status === "scheduled" && <button onClick={() => setDeletingId(ev.id)}>Cancelar cita</button>}
                </div>
              </div>
            </article>;
          })}</div>
        </section>
      </div>
      <Dialog open={!!deletingId} onOpenChange={open => { if (!open && !deleting.current) setDeletingId(null); }}>
        <DialogContent className="admin-workspace mi-agenda agenda-dialog">
          <DialogHeader><DialogTitle>Cancelar cita</DialogTitle><DialogDescription>{isMockDataMode ? "Se eliminará esta cita de las muestras guardadas." : "La cita dejará de estar pendiente y se conservará en el historial."}</DialogDescription></DialogHeader>
          {cancelledItem && <dl className="agenda-review"><dt>Cliente</dt><dd>{cancelledItem.leadName}</dd><dt>Unidad</dt><dd>{cancelledItem.propertyTitle || "Sin unidad vinculada"}</dd><dt>Fecha y hora</dt><dd>{formatArgentinaDateTime(cancelledItem.scheduledAt)}</dd><dt>Asesor</dt><dd>{cancelledItem.agentName || "Sin informar"}</dd><dt>Contacto</dt><dd>{cancelledItem.phone || "Sin teléfono"} · {cancelledItem.email || "Sin correo"}</dd><dt>Notas</dt><dd>{cancelledItem.notes || "Sin notas"}</dd></dl>}
          <DialogFooter><Button variant="outline" disabled={isDeleting} onClick={() => setDeletingId(null)}>Conservar cita</Button><Button className="agenda-primary" disabled={isDeleting || !cancelledItem} onClick={() => deletingId && handleDelete(deletingId)}>{isDeleting ? "Cancelando…" : "Confirmar cancelación"}</Button></DialogFooter>
        </DialogContent>
      </Dialog>
      <NewVisitModal open={showNewVisitModal} onOpenChange={setShowNewVisitModal} onVisitCreated={loadItems} />
    </div>
  );
}
