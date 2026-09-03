"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { loadLeadList, loadPropertyList } from "@/lib/admin-storage";
import { leads as sampleLeads, properties as sampleProperties, type Visit } from "@/data/admin-sample";
import { Button } from "@/components/ui/button";
import {
  CalendarDays, Clock, MapPin, Store, Car, Building2, MessageCircle, ChevronRight,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useCurrentSession } from "@/hooks/use-current-session";
import { useDashboardMode } from "@/lib/dashboard-context";
import { deferEffectUpdate } from "@/lib/deferred-effect";

type TimelineVisit = Visit & {
  leadName: string;
  propertyTitle?: string;
  propertyType?: string;
  unitNumber?: string;
  phone?: string;
};

type TabKey = "TODOS" | "Loteos" | "Locales" | "Cocheras";

const TABS: { key: TabKey; label: string; icon: React.ReactNode; color: string }[] = [
  { key: "TODOS",    label: "Todos",    icon: <CalendarDays className="h-3.5 w-3.5" />, color: "bg-slate-100 text-slate-700 border-slate-200" },
  { key: "Loteos",   label: "Loteos",   icon: <MapPin       className="h-3.5 w-3.5" />, color: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  { key: "Locales",  label: "Locales",  icon: <Store        className="h-3.5 w-3.5" />, color: "bg-indigo-50 text-indigo-700 border-indigo-200" },
  { key: "Cocheras", label: "Cocheras", icon: <Car          className="h-3.5 w-3.5" />, color: "bg-blue-50 text-blue-700 border-blue-200" },
];

/** Animated number counter */
function AnimatedCount({ value }: { value: number }) {
  return (
    <AnimatePresence mode="wait">
      <motion.span
        key={value}
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 10 }}
        transition={{ duration: 0.2 }}
        className="tabular-nums"
      >
        {value}
      </motion.span>
    </AnimatePresence>
  );
}

export default function MonthlyAgendaSummary() {
  // ─── ALL hooks at the top — no early returns before this block ────────────
  const { isAdvisor, isAdmin, user } = useCurrentSession();
  const { globalSelectedAgentId } = useDashboardMode();
  const [currentDate, setCurrentDate] = useState(() => new Date());
  const [visits, setVisits] = useState<TimelineVisit[]>([]);
  const [activeTab, setActiveTab] = useState<TabKey>("TODOS");

  const month = useMemo(() => currentDate.getMonth(), [currentDate]);
  const year  = useMemo(() => currentDate.getFullYear(), [currentDate]);

  useEffect(() => {
    return deferEffectUpdate(() => {
      let leads = loadLeadList(sampleLeads, "c1");

    const effectiveAgentId = isAdvisor ? user?.id : globalSelectedAgentId;
    if (effectiveAgentId && effectiveAgentId !== "all") {
      leads = leads.filter((l) => l.agentId === effectiveAgentId);
    }

    const properties = loadPropertyList(sampleProperties, "c1");

    const fromLeads = leads.flatMap((lead) =>
      (lead.visits ?? []).map((v) => {
        const prop = properties.find((p) => p.id === v.propertyId);
        return {
          ...v,
          leadName: v.leadName || lead.name,
          propertyTitle: v.propertyTitle || prop?.title,
          propertyType: prop?.propertyType,
          unitNumber: prop?.unitNumber || prop?.title.slice(0, 8),
          phone: v.phone || lead.phone,
        };
      })
    );

    const fromProps = properties.flatMap((prop) =>
      (prop.visits ?? []).map((v) => ({
        ...v,
        leadName: v.leadName || "Visitante",
        propertyTitle: v.propertyTitle || prop.title,
        propertyType: prop.propertyType,
        unitNumber: prop.unitNumber || prop.title.slice(0, 8),
        phone: v.phone,
      }))
    );

    const map = new Map<string, TimelineVisit>();
    [...fromLeads, ...fromProps].forEach((it) => {
      if (!map.has(it.id)) map.set(it.id, it);
    });

    let items = Array.from(map.values());

    if (isAdvisor) {
      items = items.filter((v) => v.agentId === user?.id);
    } else if (isAdmin && globalSelectedAgentId !== "all") {
      items = items.filter((v) => v.agentId === globalSelectedAgentId);
    }

    items.sort((a, b) => new Date(a.scheduledAt).getTime() - new Date(b.scheduledAt).getTime());
      setVisits(items);
    });
  }, [isAdvisor, isAdmin, user, globalSelectedAgentId]);

  // ─── Derived data (after all hooks) ─────────────────────────────────────
  const monthVisits = useMemo(() => {
    return visits.filter((v) => {
      const d = new Date(v.scheduledAt);
      return d.getMonth() === month && d.getFullYear() === year;
    });
  }, [visits, month, year]);

  const filteredVisits = useMemo(() => {
    if (activeTab === "TODOS") return monthVisits;
    const kw = activeTab.toLowerCase().slice(0, 5); // "loteo" | "local" | "coche"
    return monthVisits.filter((v) => v.propertyType?.toLowerCase().includes(kw));
  }, [monthVisits, activeTab]);

  const tabCounts = useMemo(() => {
    const count = (kw: string) =>
      kw === "todos"
        ? monthVisits.length
        : monthVisits.filter((v) => v.propertyType?.toLowerCase().includes(kw.slice(0, 5))).length;
    return {
      TODOS:    monthVisits.length,
      Loteos:   count("loteos"),
      Locales:  count("locales"),
      Cocheras: count("cocheras"),
    };
  }, [monthVisits]);

  // ─── Guard — runs AFTER all hooks ────────────────────────────────────────
  if (!isAdvisor && !isAdmin) return null;

  const getAssetIcon = (type?: string) => {
    if (!type) return <Building2 className="h-3.5 w-3.5" />;
    const t = type.toLowerCase();
    if (t.includes("lote"))    return <MapPin    className="h-3.5 w-3.5 text-emerald-600" />;
    if (t.includes("local"))   return <Store     className="h-3.5 w-3.5 text-indigo-600" />;
    if (t.includes("cochera")) return <Car       className="h-3.5 w-3.5 text-blue-600"   />;
    return <Building2 className="h-3.5 w-3.5 text-slate-600" />;
  };

  return (
    <div className="rounded-[2.5rem] border border-slate-200 bg-white shadow-sm overflow-hidden">
      {/* Header */}
      <div className="px-8 pt-8 pb-6 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <span className="p-2.5 rounded-2xl bg-blue-600 text-white shadow-sm shadow-blue-200">
              <CalendarDays className="h-5 w-5" />
            </span>
            <div>
              <h3 className="text-xl font-bold text-slate-900 leading-tight">
                Agenda de Visitas
              </h3>
              <p className="text-xs text-slate-500 font-medium mt-0.5 capitalize">
                {currentDate.toLocaleDateString("es-AR", { month: "long", year: "numeric" })}
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() =>
              setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, 1))
            }
            className="text-xs font-semibold"
          >
            ← Mes anterior
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() =>
              setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 1))
            }
            className="text-xs font-semibold"
          >
            Próximo mes →
          </Button>
          <Link href="/admin/agenda">
            <Button size="sm" className="bg-blue-600 hover:bg-blue-700 text-white font-semibold text-xs rounded-xl">
              Ver completa
            </Button>
          </Link>
        </div>
      </div>

      {/* Tabs */}
      <div className="px-8 pt-5 flex items-center gap-2 flex-wrap">
        {TABS.map((tab) => {
          const isActive = activeTab === tab.key;
          return (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={cn(
                "inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs font-bold border transition-all",
                isActive
                  ? `${tab.color} shadow-sm scale-105`
                  : "bg-white text-slate-500 border-slate-200 hover:border-slate-300 hover:text-slate-700"
              )}
            >
              {tab.icon}
              {tab.label}
              <span className={cn(
                "ml-0.5 px-1.5 py-0.5 rounded-full text-[10px] font-black",
                isActive ? "bg-white/60" : "bg-slate-100 text-slate-500"
              )}>
                <AnimatedCount value={tabCounts[tab.key]} />
              </span>
            </button>
          );
        })}
      </div>

      {/* Timeline */}
      <div className="px-8 py-6">
        <AnimatePresence mode="wait">
          {filteredVisits.length === 0 ? (
            <motion.div
              key="empty"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              className="text-center py-10 text-slate-500 bg-slate-50 rounded-2xl border border-dashed border-slate-200"
            >
              <Clock className="h-8 w-8 text-slate-300 mx-auto mb-2" />
              <p className="text-sm font-medium">No hay visitas agendadas para este período.</p>
            </motion.div>
          ) : (
            <motion.div
              key={activeTab + month + year}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.18 }}
              className="relative pl-6 space-y-4 before:absolute before:left-2.5 before:top-3 before:bottom-3 before:w-0.5 before:bg-slate-200"
            >
              {filteredVisits.slice(0, 6).map((v) => {
                const isCompleted = v.status === "completed";
                const timeFormatted = new Date(v.scheduledAt).toLocaleTimeString("es-AR", {
                  hour: "2-digit",
                  minute: "2-digit",
                });
                const dateFormatted = new Date(v.scheduledAt).toLocaleDateString("es-AR", {
                  weekday: "short",
                  day: "numeric",
                  month: "short",
                });
                const cleanPhone = v.phone ? v.phone.replace(/[^0-9]/g, "") : "";
                const whatsappUrl = cleanPhone
                  ? `https://wa.me/${cleanPhone}?text=Hola%20${encodeURIComponent(v.leadName)},%20te%20recordamos%20tu%20visita%20agendada%20para%20${encodeURIComponent(v.propertyTitle || "la propiedad")}.`
                  : null;

                return (
                  <div key={v.id} className="relative group">
                    {/* Timeline dot */}
                    <div
                      className={cn(
                        "absolute -left-[27px] top-4 h-3.5 w-3.5 rounded-full border-2 bg-white transition-transform group-hover:scale-125 z-10",
                        isCompleted ? "border-emerald-600 bg-emerald-600" : "border-blue-600 bg-blue-600"
                      )}
                    />

                    {/* Visit Card */}
                    <div
                      className={cn(
                        "flex flex-col sm:flex-row sm:items-center justify-between p-4 rounded-2xl border bg-white shadow-sm transition-all hover:shadow-md",
                        isCompleted
                          ? "border-l-4 border-l-emerald-500 border-slate-100 hover:border-emerald-200"
                          : "border-l-4 border-l-blue-500 border-slate-100 hover:border-blue-200"
                      )}
                    >
                      <div className="flex items-start sm:items-center gap-4">
                        {/* Time Block */}
                        <div
                          className={cn(
                            "px-3 py-2 rounded-xl text-center flex flex-col items-center justify-center min-w-[80px] shrink-0",
                            isCompleted ? "bg-emerald-50 text-emerald-800" : "bg-blue-50 text-blue-800"
                          )}
                        >
                          <span className="text-[10px] font-extrabold uppercase tracking-tight leading-none">{dateFormatted}</span>
                          <span className="text-sm font-black tracking-tight mt-0.5">{timeFormatted}</span>
                        </div>

                        {/* Lead Details */}
                        <div>
                          <div className="flex items-center gap-2 flex-wrap">
                            <h4 className="text-sm font-bold text-slate-900">{v.leadName}</h4>
                            <span
                              className={cn(
                                "px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-wider",
                                isCompleted ? "bg-emerald-100 text-emerald-800" : "bg-blue-100 text-blue-800"
                              )}
                            >
                              {isCompleted ? "✓ Realizada" : "Programada"}
                            </span>
                          </div>
                          <div className="flex items-center gap-1.5 mt-1.5">
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-slate-100 text-xs font-semibold text-slate-700 border border-slate-200">
                              {getAssetIcon(v.propertyType)}
                              <span className="truncate max-w-[200px]">{v.propertyTitle || "Sin propiedad de interés"}</span>
                            </span>
                          </div>
                        </div>
                      </div>

                      {/* Right: WhatsApp */}
                      <div className="mt-3 sm:mt-0 flex items-center justify-end gap-2 border-t sm:border-t-0 pt-3 sm:pt-0 border-slate-100 shrink-0">
                        {whatsappUrl ? (
                          <a href={whatsappUrl} target="_blank" rel="noopener noreferrer">
                            <Button
                              variant="outline"
                              size="sm"
                              className="bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-600 hover:text-white font-bold gap-1.5 text-xs transition-colors rounded-xl"
                            >
                              <MessageCircle className="h-3.5 w-3.5 fill-current" />
                              WhatsApp
                            </Button>
                          </a>
                        ) : (
                          <span className="text-xs text-slate-400 px-2">Sin teléfono</span>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Footer */}
      <div className="px-8 pb-6 flex items-center justify-between text-xs text-slate-500 border-t border-slate-100 pt-4">
        <span>Mostrando próximas visitas — <strong className="text-slate-700">{filteredVisits.length}</strong> resultado{filteredVisits.length !== 1 ? "s" : ""}</span>
        <Link href="/admin/agenda" className="text-blue-600 hover:text-blue-700 font-bold flex items-center gap-1">
          Ver todas las citas <ChevronRight className="h-3.5 w-3.5" />
        </Link>
      </div>
    </div>
  );
}
