"use client";

import { useEffect, useMemo, useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  ChevronLeft, ChevronRight, CalendarDays, Clock, MapPin,
  User, Phone, Mail, Trash2, MessageCircle, CheckCircle2,
  AlertCircle, Building2, Users
} from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { toast } from "sonner";
import type { Visit } from "@/data/admin-sample";
import { loadLeadList, loadPropertyList, removeVisitById } from "@/lib/admin-storage";
import { Button } from "@/components/ui/button";
import { useCurrentSession } from "@/hooks/use-current-session";
import { useDashboardMode } from "@/lib/dashboard-context";
import { leads as sampleLeads, properties as sampleProperties } from "@/data/admin-sample";
import { MOCK_USERS } from "@/data/auth-sample";
import { cn } from "@/lib/utils";
import { deferEffectUpdate } from "@/lib/deferred-effect";

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
  const firstDay = new Date(year, month, 1).getDay();
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
  return date.toISOString().slice(0, 10);
}

function StatusBadge({ status }: { status: string }) {
  if (status === "completed")
    return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-black bg-emerald-100 text-emerald-700"><CheckCircle2 className="h-2.5 w-2.5" />Realizada</span>;
  if (status === "cancelled")
    return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-black bg-rose-100 text-rose-600"><AlertCircle className="h-2.5 w-2.5" />Cancelada</span>;
  return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-black bg-blue-100 text-blue-700"><Clock className="h-2.5 w-2.5" />Programada</span>;
}

function PropertyTypeIcon({ type }: { type?: string }) {
  const t = type?.toLowerCase() ?? "";
  if (t.includes("lote")) return <MapPin className="h-3.5 w-3.5 text-emerald-600" />;
  if (t.includes("local")) return <Building2 className="h-3.5 w-3.5 text-indigo-600" />;
  if (t.includes("cochera")) return <Building2 className="h-3.5 w-3.5 text-blue-600" />;
  return <Building2 className="h-3.5 w-3.5 text-slate-500" />;
}

export default function CalendarAgenda() {
  // ─── All hooks at top ────────────────────────────────────────────────────
  const { isAdvisor, isAdmin, user } = useCurrentSession();
  const { globalSelectedAgentId } = useDashboardMode();
  const [today] = useState(() => new Date());
  const [viewDate, setViewDate] = useState(() => new Date());
  const [selectedDate, setSelectedDate] = useState(() => new Date());
  const [items, setItems] = useState<AgendaItem[]>([]);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [activeFilter, setActiveFilter] = useState<"all" | "scheduled" | "completed">("all");

  const loadItems = useCallback(() => {
    let leads = loadLeadList(sampleLeads, "c1");
    const properties = loadPropertyList(sampleProperties, "c1");

    const effectiveAgentId = isAdvisor ? user?.id : globalSelectedAgentId;
    if (effectiveAgentId && effectiveAgentId !== "all") {
      leads = leads.filter((l) => l.agentId === effectiveAgentId);
    }

    const fromLeads = leads.flatMap((lead) =>
      (lead.visits ?? []).map((v) => {
        const prop = properties.find((p) => p.id === v.propertyId);
        const agent = MOCK_USERS.find((u) => u.id === v.agentId);
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
        const agent = MOCK_USERS.find((u) => u.id === v.agentId);
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

    const map = new Map<string, AgendaItem>();
    [...fromLeads, ...fromProperties].forEach((it) => {
      if (!map.has(it.id)) map.set(it.id, it);
    });

    let merged = Array.from(map.values());
    if (isAdvisor) {
      merged = merged.filter((v) => v.agentId === user?.id);
    } else if (isAdmin && globalSelectedAgentId !== "all") {
      merged = merged.filter((v) => v.agentId === globalSelectedAgentId);
    }

    setItems(merged);
  }, [isAdvisor, isAdmin, user, globalSelectedAgentId]);

  useEffect(() => deferEffectUpdate(loadItems), [loadItems]);

  // ─── Derived data ────────────────────────────────────────────────────────
  const grid = useMemo(() => getMonthGrid(viewDate), [viewDate]);

  const eventsByDay = useMemo(() => {
    const map = new Map<string, AgendaItem[]>();
    items.forEach((it) => {
      const k = new Date(it.scheduledAt).toISOString().slice(0, 10);
      map.set(k, [...(map.get(k) ?? []), it]);
    });
    return map;
  }, [items]);

  const selectedDayKey = useMemo(() => toKey(selectedDate), [selectedDate]);
  const selectedDayItems = useMemo(() => {
    const dayItems = eventsByDay.get(selectedDayKey) ?? [];
    if (activeFilter === "all") return dayItems;
    return dayItems.filter((it) => it.status === activeFilter);
  }, [eventsByDay, selectedDayKey, activeFilter]);

  const upcomingItems = useMemo(() => {
    const now = today.getTime();
    return items
      .filter((it) => it.status === "scheduled" && new Date(it.scheduledAt).getTime() > now)
      .sort((a, b) => new Date(a.scheduledAt).getTime() - new Date(b.scheduledAt).getTime())
      .slice(0, 8);
  }, [items, today]);

  const monthStats = useMemo(() => {
    const month = viewDate.getMonth();
    const year = viewDate.getFullYear();
    const monthItems = items.filter((it) => {
      const d = new Date(it.scheduledAt);
      return d.getMonth() === month && d.getFullYear() === year;
    });
    return {
      total: monthItems.length,
      completed: monthItems.filter((it) => it.status === "completed").length,
      scheduled: monthItems.filter((it) => it.status === "scheduled").length,
    };
  }, [items, viewDate]);

  const handleDelete = useCallback((id: string) => {
    removeVisitById(id, sampleLeads, sampleProperties);
    setItems((prev) => prev.filter((it) => it.id !== id));
    setDeletingId(null);
    toast.success("Visita eliminada");
  }, []);

  return (
    <div className="space-y-6">
      {/* ── Page Header ── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-black text-slate-900 tracking-tight">Agenda</h1>
          <p className="text-sm text-slate-500 mt-1">
            {MONTHS_ES[viewDate.getMonth()]} {viewDate.getFullYear()} —{" "}
            <span className="font-semibold text-slate-700">{monthStats.total} visitas</span>
          </p>
        </div>

        {/* Month stats pills */}
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5 bg-blue-50 border border-blue-100 px-3 py-1.5 rounded-full">
            <Clock className="h-3.5 w-3.5 text-blue-600" />
            <span className="text-xs font-bold text-blue-700">{monthStats.scheduled} pendientes</span>
          </div>
          <div className="flex items-center gap-1.5 bg-emerald-50 border border-emerald-100 px-3 py-1.5 rounded-full">
            <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
            <span className="text-xs font-bold text-emerald-700">{monthStats.completed} realizadas</span>
          </div>
        </div>
      </div>

      {/* ── 3-column layout ── */}
      <div className="grid grid-cols-1 xl:grid-cols-[1fr_360px_300px] gap-6">

        {/* ── Col 1: Calendar ── */}
        <div className="rounded-[2.5rem] border border-slate-200 bg-white shadow-sm overflow-hidden">
          {/* Calendar header */}
          <div className="px-6 py-5 border-b border-slate-100 flex items-center justify-between">
            <button
              onClick={() => setViewDate(new Date(viewDate.getFullYear(), viewDate.getMonth() - 1, 1))}
              className="h-9 w-9 rounded-xl border border-slate-200 flex items-center justify-center hover:bg-slate-50 transition-colors"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <h2 className="text-base font-bold text-slate-900 capitalize">
              {MONTHS_ES[viewDate.getMonth()]} {viewDate.getFullYear()}
            </h2>
            <button
              onClick={() => setViewDate(new Date(viewDate.getFullYear(), viewDate.getMonth() + 1, 1))}
              className="h-9 w-9 rounded-xl border border-slate-200 flex items-center justify-center hover:bg-slate-50 transition-colors"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>

          <div className="p-4">
            {/* Weekday labels */}
            <div className="grid grid-cols-7 mb-2">
              {WEEKDAYS.map((d) => (
                <div key={d} className="py-2 text-center text-[10px] font-black uppercase tracking-widest text-slate-400">
                  {d}
                </div>
              ))}
            </div>

            {/* Day grid */}
            <div className="grid grid-cols-7 gap-1">
              {grid.map((cell, i) => {
                const key = toKey(cell.date);
                const dayEvents = eventsByDay.get(key) ?? [];
                const isSelected = key === selectedDayKey;
                const isToday = key === toKey(today);
                const hasCompleted = dayEvents.some((e) => e.status === "completed");
                const hasScheduled = dayEvents.some((e) => e.status === "scheduled");

                return (
                  <button
                    key={`${key}-${i}`}
                    onClick={() => {
                      setSelectedDate(cell.date);
                      setViewDate(cell.date);
                    }}
                    className={cn(
                      "relative flex flex-col items-center justify-start pt-2 pb-1.5 rounded-xl min-h-[56px] transition-all border text-sm font-semibold",
                      cell.current ? "text-slate-800" : "text-slate-300",
                      isSelected
                        ? "bg-blue-600 text-white border-blue-600 shadow-md shadow-blue-200"
                        : isToday
                        ? "border-blue-300 bg-blue-50 text-blue-700"
                        : "border-transparent hover:bg-slate-50",
                    )}
                  >
                    <span>{cell.date.getDate()}</span>
                    {dayEvents.length > 0 && (
                      <div className="flex gap-0.5 mt-1">
                        {hasScheduled && (
                          <span className={cn("h-1.5 w-1.5 rounded-full", isSelected ? "bg-white/80" : "bg-blue-500")} />
                        )}
                        {hasCompleted && (
                          <span className={cn("h-1.5 w-1.5 rounded-full", isSelected ? "bg-white/60" : "bg-emerald-500")} />
                        )}
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Legend */}
          <div className="px-6 pb-5 flex items-center gap-4 text-[10px] text-slate-400 font-semibold">
            <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-blue-500" />Programada</span>
            <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-emerald-500" />Realizada</span>
          </div>
        </div>

        {/* ── Col 2: Selected Day Panel ── */}
        <div className="rounded-[2.5rem] border border-slate-200 bg-white shadow-sm overflow-hidden flex flex-col">
          {/* Day header */}
          <div className="px-6 py-5 border-b border-slate-100">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-black text-slate-400 uppercase tracking-widest">
                  {WEEKDAYS[selectedDate.getDay()]}
                </p>
                <h3 className="text-2xl font-black text-slate-900 leading-none mt-1">
                  {selectedDate.getDate()} de {MONTHS_ES[selectedDate.getMonth()]}
                </h3>
              </div>
              <div className={cn(
                "h-12 w-12 rounded-2xl flex items-center justify-center text-xl font-black",
                toKey(selectedDate) === toKey(today) ? "bg-blue-600 text-white" : "bg-slate-100 text-slate-600"
              )}>
                {selectedDate.getDate()}
              </div>
            </div>

            {/* Filter tabs */}
            <div className="flex gap-1.5 mt-4">
              {(["all", "scheduled", "completed"] as const).map((f) => (
                <button
                  key={f}
                  onClick={() => setActiveFilter(f)}
                  className={cn(
                    "px-3 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all",
                    activeFilter === f
                      ? f === "completed" ? "bg-emerald-600 text-white" : f === "scheduled" ? "bg-blue-600 text-white" : "bg-slate-800 text-white"
                      : "bg-slate-100 text-slate-500 hover:bg-slate-200"
                  )}
                >
                  {f === "all" ? "Todas" : f === "scheduled" ? "Pendientes" : "Realizadas"}
                </button>
              ))}
            </div>
          </div>

          {/* Events list */}
          <div className="flex-1 overflow-y-auto p-4 space-y-3">
            <AnimatePresence mode="wait">
              {selectedDayItems.length === 0 ? (
                <motion.div
                  key="empty"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="flex flex-col items-center justify-center py-16 text-center"
                >
                  <CalendarDays className="h-10 w-10 text-slate-200 mb-3" />
                  <p className="text-sm font-semibold text-slate-400">Sin visitas este día</p>
                </motion.div>
              ) : (
                <motion.div
                  key={selectedDayKey + activeFilter}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  className="space-y-3"
                >
                  {selectedDayItems.map((ev) => {
                    const time = new Date(ev.scheduledAt).toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" });
                    const wa = ev.phone
                      ? `https://wa.me/${ev.phone.replace(/[^0-9]/g, "")}?text=Hola%20${encodeURIComponent(ev.leadName)}%2C%20recordamos%20tu%20visita%20de%20hoy.`
                      : null;

                    return (
                      <div
                        key={ev.id}
                        className={cn(
                          "rounded-2xl border p-4 space-y-3 transition-all hover:shadow-sm",
                          ev.status === "completed"
                            ? "border-l-4 border-l-emerald-500 border-slate-100"
                            : ev.status === "cancelled"
                            ? "border-l-4 border-l-rose-400 border-slate-100 opacity-60"
                            : "border-l-4 border-l-blue-500 border-slate-100"
                        )}
                      >
                        {/* Time + status */}
                        <div className="flex items-center justify-between">
                          <span className={cn(
                            "px-2.5 py-1 rounded-lg text-xs font-black",
                            ev.status === "completed" ? "bg-emerald-50 text-emerald-700" : "bg-blue-50 text-blue-700"
                          )}>
                            {time}hs
                          </span>
                          <StatusBadge status={ev.status} />
                        </div>

                        {/* Lead info */}
                        <div>
                          <p className="font-bold text-slate-900 text-sm">{ev.leadName}</p>
                          {ev.phone && <p className="text-xs text-slate-500 mt-0.5 flex items-center gap-1"><Phone className="h-3 w-3" />{ev.phone}</p>}
                          {ev.email && <p className="text-xs text-slate-500 flex items-center gap-1"><Mail className="h-3 w-3" />{ev.email}</p>}
                        </div>

                        {/* Property */}
                        {ev.propertyTitle && (
                          <div className="flex items-center gap-1.5 bg-slate-50 rounded-xl px-2.5 py-1.5 border border-slate-100">
                            <PropertyTypeIcon type={ev.propertyType} />
                            <span className="text-xs font-semibold text-slate-700 truncate">{ev.propertyTitle}</span>
                          </div>
                        )}

                        {/* Advisor info — always visible (key feature) */}
                        {ev.agentName && (
                          <div className="flex items-center gap-2 pt-1 border-t border-slate-100">
                            <div className="h-6 w-6 rounded-full bg-blue-600 flex items-center justify-center text-[9px] font-black text-white shrink-0">
                              {ev.agentAvatar || ev.agentName[0]}
                            </div>
                            <span className="text-[11px] font-semibold text-slate-500">Asesor: <span className="text-slate-800">{ev.agentName}</span></span>
                          </div>
                        )}

                        {/* Actions */}
                        <div className="flex items-center gap-2 pt-1">
                          {wa && (
                            <a href={wa} target="_blank" rel="noopener noreferrer" className="flex-1">
                              <button className="w-full flex items-center justify-center gap-1.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold transition-colors">
                                <MessageCircle className="h-3.5 w-3.5 fill-current" /> WhatsApp
                              </button>
                            </a>
                          )}
                          <button
                            onClick={() => setDeletingId(ev.id)}
                            className="h-9 w-9 rounded-xl border border-slate-200 flex items-center justify-center text-slate-400 hover:text-rose-600 hover:border-rose-200 hover:bg-rose-50 transition-colors shrink-0"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>

        {/* ── Col 3: Upcoming Visits ── */}
        <div className="rounded-[2.5rem] border border-slate-200 bg-white shadow-sm overflow-hidden flex flex-col">
          <div className="px-6 py-5 border-b border-slate-100 flex items-center gap-3">
            <span className="p-2 rounded-xl bg-indigo-600 text-white">
              <Users className="h-4 w-4" />
            </span>
            <div>
              <h3 className="text-sm font-bold text-slate-900">Próximas Visitas</h3>
              <p className="text-[10px] text-slate-400 font-medium">Las más cercanas en el tiempo</p>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-4 space-y-2">
            {upcomingItems.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <Clock className="h-8 w-8 text-slate-200 mb-2" />
                <p className="text-xs font-semibold text-slate-400">No hay visitas próximas</p>
              </div>
            ) : (
              upcomingItems.map((ev) => {
                const d = new Date(ev.scheduledAt);
                const time = d.toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" });
                const dateStr = d.toLocaleDateString("es-AR", { weekday: "short", day: "numeric", month: "short" });

                return (
                  <button
                    key={ev.id}
                    onClick={() => {
                      setSelectedDate(d);
                      setViewDate(d);
                    }}
                    className="w-full text-left p-3 rounded-2xl border border-slate-100 hover:border-blue-200 hover:bg-blue-50/50 transition-all group"
                  >
                    <div className="flex items-start gap-3">
                      <div className="bg-blue-50 group-hover:bg-blue-100 rounded-xl px-2 py-1.5 text-center shrink-0 transition-colors">
                        <p className="text-[9px] font-bold uppercase text-blue-500 leading-none">{dateStr.split(" ")[0]}</p>
                        <p className="text-sm font-black text-blue-700 leading-none mt-0.5">{d.getDate()}</p>
                        <p className="text-[9px] font-bold text-blue-500 leading-none">{time}h</p>
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-bold text-slate-900 truncate">{ev.leadName}</p>
                        {ev.propertyTitle && (
                          <p className="text-[10px] text-slate-500 truncate mt-0.5 flex items-center gap-1">
                            <PropertyTypeIcon type={ev.propertyType} />{ev.propertyTitle}
                          </p>
                        )}
                        {/* Advisor chip */}
                        {ev.agentName && (
                          <div className="flex items-center gap-1 mt-1.5">
                            <div className="h-4 w-4 rounded-full bg-indigo-600 flex items-center justify-center text-[7px] font-black text-white shrink-0">
                              {ev.agentAvatar || ev.agentName[0]}
                            </div>
                            <span className="text-[9px] text-slate-500 font-semibold truncate">{ev.agentName}</span>
                          </div>
                        )}
                      </div>
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </div>
      </div>

      {/* ── Delete Confirmation Modal ── */}
      <Dialog open={!!deletingId} onOpenChange={(open) => { if (!open) setDeletingId(null); }}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Eliminar visita</DialogTitle>
            <DialogDescription>¿Querés eliminar esta visita? Esta acción no se puede deshacer.</DialogDescription>
          </DialogHeader>
          <DialogFooter className="mt-4 gap-2">
            <Button variant="outline" onClick={() => setDeletingId(null)}>Cancelar</Button>
            <Button
              className="bg-rose-600 text-white hover:bg-rose-700"
              onClick={() => deletingId && handleDelete(deletingId)}
            >
              Eliminar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
