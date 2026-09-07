"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  ArrowUpRight,
  BarChart3,
  Building2,
  CalendarCheck,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  DollarSign,
  MessageCircle,
  Phone,
  Search,
  TrendingUp,
  Users,
} from "lucide-react";
import { type Lead, type LeadFollowUp, type Project, type Property } from "@/data/admin-sample";
import { formatArgentinaDateTime } from "@/lib/lead-follow-up";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

interface AdminMonthBalanceWidgetProps {
  leads: Lead[];
  followUps: LeadFollowUp[];
  properties: Property[];
  projects: Project[];
}

export function AdminMonthBalanceWidget({
  leads,
  followUps,
  properties,
  projects,
}: AdminMonthBalanceWidgetProps) {
  const [isOpen, setIsOpen] = useState(true);
  const [tableSearch, setTableSearch] = useState("");
  const [stageFilter, setStageFilter] = useState<string>("all");

  const now = new Date();
  const currentMonthName = new Intl.DateTimeFormat("es-AR", {
    month: "long",
    year: "numeric",
  }).format(now);

  // Metricas de Balance del Mes
  const metrics = useMemo(() => {
    const currentMonthPrefix = now.toISOString().slice(0, 7); // YYYY-MM

    // Leads del mes o activos
    const totalLeads = leads.length;
    const newLeads = leads.filter((l) => l.stage === "new").length;
    const activePipeline = leads.filter((l) =>
      ["contacted", "visiting", "negotiation"].includes(l.stage)
    );
    const closedLeads = leads.filter((l) => l.stage === "closing");

    const conversionRate =
      totalLeads > 0 ? ((closedLeads.length / totalLeads) * 100).toFixed(1) : "0";

    // Calcular valores económicos
    let pipelineVolumeUSD = 0;
    let closedVolumeUSD = 0;

    for (const lead of activePipeline) {
      const candidateId =
        lead.propertyIds?.[0] || lead.interests?.[0]?.propertyId || lead.interests?.[0]?.unitId;
      const prop = properties.find((p) => p.id === candidateId);
      const price = prop?.price || lead.interests?.[0]?.price || 0;
      pipelineVolumeUSD += price;
    }

    for (const lead of closedLeads) {
      const candidateId =
        lead.propertyIds?.[0] || lead.interests?.[0]?.propertyId || lead.interests?.[0]?.unitId;
      const prop = properties.find((p) => p.id === candidateId);
      const price = prop?.price || lead.interests?.[0]?.price || 0;
      closedVolumeUSD += price;
    }

    return {
      totalLeads,
      newLeads,
      activePipelineCount: activePipeline.length,
      closedLeadsCount: closedLeads.length,
      conversionRate,
      pipelineVolumeUSD,
      closedVolumeUSD,
    };
  }, [leads, properties]);

  // Lista detallada de numeros y datos por lead
  const enrichedLeadList = useMemo(() => {
    return leads.map((lead) => {
      const leadFollowUps = followUps.filter((f) => f.leadId === lead.id);
      const followUpCount = leadFollowUps.length;
      const lastFollowUp =
        leadFollowUps.length > 0
          ? leadFollowUps[0]
          : null;

      // Propiedad resuelta
      const candidateId =
        lead.propertyIds?.[0] || lead.interests?.[0]?.propertyId || lead.interests?.[0]?.unitId;
      const matchedProperty = properties.find((p) => p.id === candidateId);
      const matchedInterest = lead.interests?.find(
        (i) => i.propertyId === candidateId || i.unitId === candidateId
      );
      const propTitle =
        matchedProperty?.title || matchedInterest?.propertyTitle || "Sin propiedad";
      const propPrice =
        matchedProperty?.price || matchedInterest?.price || null;
      const propCurrency =
        matchedProperty?.currency || matchedInterest?.currency || "USD";

      return {
        lead,
        followUpCount,
        lastFollowUp,
        propTitle,
        propPrice,
        propCurrency,
      };
    });
  }, [leads, followUps, properties]);

  // Filtrado de la tabla de numeros
  const filteredLeadList = useMemo(() => {
    let result = enrichedLeadList;

    if (stageFilter !== "all") {
      result = result.filter((item) => item.lead.stage === stageFilter);
    }

    if (tableSearch.trim()) {
      const q = tableSearch.toLowerCase().trim();
      result = result.filter(
        ({ lead, propTitle }) =>
          lead.name.toLowerCase().includes(q) ||
          (lead.phone && lead.phone.includes(q)) ||
          (lead.email && lead.email.toLowerCase().includes(q)) ||
          (lead.agentName && lead.agentName.toLowerCase().includes(q)) ||
          propTitle.toLowerCase().includes(q)
      );
    }

    return result;
  }, [enrichedLeadList, stageFilter, tableSearch]);

  const STAGE_LABELS: Record<string, { label: string; color: string }> = {
    new: { label: "Nuevo", color: "bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300" },
    contacted: { label: "Contactado", color: "bg-purple-100 text-purple-800 dark:bg-purple-950 dark:text-purple-300" },
    visiting: { label: "En Visita", color: "bg-indigo-100 text-indigo-800 dark:bg-indigo-950 dark:text-indigo-300" },
    negotiation: { label: "Negociación", color: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300" },
    closing: { label: "Cierre / Ganado", color: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300" },
    lost: { label: "Descartado", color: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300" },
  };

  return (
    <div className="rounded-2xl border border-slate-200 bg-white shadow-xs dark:border-slate-800 dark:bg-card overflow-hidden">
      {/* Header colapsable */}
      <div
        className="flex items-center justify-between px-5 py-4 cursor-pointer hover:bg-slate-50/50 dark:hover:bg-slate-900/40 border-b border-slate-100 dark:border-slate-800 transition-colors"
        onClick={() => setIsOpen(!isOpen)}
      >
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-700 dark:bg-blue-950/70 dark:text-blue-400">
            <BarChart3 className="size-4" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-base font-bold text-slate-900 dark:text-slate-100">
                Balance del Mes & Números de Leads
              </h2>
              <span className="text-[11px] font-semibold capitalize px-2 py-0.5 rounded-md bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300">
                {currentMonthName}
              </span>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Métricas consolidadas de rendimiento comercial y auditoría de contactos de la empresa.
            </p>
          </div>
        </div>

        <button
          type="button"
          className="p-1 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
          aria-label={isOpen ? "Contraer sección" : "Expandir sección"}
        >
          {isOpen ? <ChevronUp className="size-5" /> : <ChevronDown className="size-5" />}
        </button>
      </div>

      {isOpen && (
        <div className="p-5 space-y-6">
          {/* 4 Métricas de Balance Mensual */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {/* Total Leads & Nuevos */}
            <div className="rounded-xl border border-slate-100 bg-slate-50/60 p-4 dark:border-slate-800 dark:bg-slate-900/40">
              <div className="flex items-center justify-between text-slate-500 dark:text-slate-400">
                <span className="text-xs font-semibold">Leads Totales</span>
                <Users className="size-4 text-blue-600" />
              </div>
              <div className="mt-2 flex items-baseline gap-2">
                <span className="text-2xl font-black text-slate-900 dark:text-slate-100">
                  {metrics.totalLeads}
                </span>
                <span className="text-xs font-medium text-slate-500">
                  ({metrics.newLeads} nuevos sin contactar)
                </span>
              </div>
              <p className="mt-1 text-[11px] text-slate-500">Registrados en la cartera</p>
            </div>

            {/* Embudo Activo */}
            <div className="rounded-xl border border-slate-100 bg-slate-50/60 p-4 dark:border-slate-800 dark:bg-slate-900/40">
              <div className="flex items-center justify-between text-slate-500 dark:text-slate-400">
                <span className="text-xs font-semibold">En Gestión Activa</span>
                <TrendingUp className="size-4 text-purple-600" />
              </div>
              <div className="mt-2 flex items-baseline gap-2">
                <span className="text-2xl font-black text-purple-900 dark:text-purple-300">
                  {metrics.activePipelineCount}
                </span>
                <span className="text-xs font-medium text-purple-600">contactados / visitas</span>
              </div>
              <p className="mt-1 text-[11px] text-slate-500">Prospección y negociación en curso</p>
            </div>

            {/* Cierres & Conversión */}
            <div className="rounded-xl border border-slate-100 bg-slate-50/60 p-4 dark:border-slate-800 dark:bg-slate-900/40">
              <div className="flex items-center justify-between text-slate-500 dark:text-slate-400">
                <span className="text-xs font-semibold">Cierres del Mes</span>
                <CheckCircle2 className="size-4 text-emerald-600" />
              </div>
              <div className="mt-2 flex items-baseline gap-2">
                <span className="text-2xl font-black text-emerald-900 dark:text-emerald-300">
                  {metrics.closedLeadsCount}
                </span>
                <span className="text-xs font-bold text-emerald-700 bg-emerald-100 dark:bg-emerald-950 dark:text-emerald-300 px-1.5 py-0.5 rounded">
                  {metrics.conversionRate}% conv.
                </span>
              </div>
              <p className="mt-1 text-[11px] text-slate-500">Operaciones en etapa de cierre</p>
            </div>

            {/* Volumen Económico Proyectado */}
            <div className="rounded-xl border border-slate-100 bg-slate-50/60 p-4 dark:border-slate-800 dark:bg-slate-900/40">
              <div className="flex items-center justify-between text-slate-500 dark:text-slate-400">
                <span className="text-xs font-semibold">Volumen en Pipeline</span>
                <DollarSign className="size-4 text-amber-600" />
              </div>
              <div className="mt-2 flex items-baseline gap-2">
                <span className="text-2xl font-black text-slate-900 dark:text-slate-100">
                  USD {metrics.pipelineVolumeUSD.toLocaleString()}
                </span>
              </div>
              <p className="mt-1 text-[11px] text-slate-500">
                Cerrado: USD {metrics.closedVolumeUSD.toLocaleString()}
              </p>
            </div>
          </div>

          {/* Buscador y Filtros para la Tabla de Números de Leads */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 pt-2">
            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-slate-400" />
              <input
                type="text"
                value={tableSearch}
                onChange={(e) => setTableSearch(e.target.value)}
                placeholder="Buscar por nombre, teléfono, asesor o propiedad..."
                className="h-9 w-full rounded-xl border border-slate-200 bg-slate-50/70 pl-9 pr-3 text-xs text-slate-900 placeholder:text-slate-400 focus:border-blue-500 focus:bg-white focus:outline-none dark:border-slate-800 dark:bg-slate-900/50 dark:text-slate-100"
              />
            </div>

            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">Etapa:</span>
              <select
                value={stageFilter}
                onChange={(e) => setStageFilter(e.target.value)}
                className="h-9 rounded-xl border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-800 focus:border-blue-500 focus:outline-none dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200"
              >
                <option value="all">Todas las etapas</option>
                <option value="new">Nuevos</option>
                <option value="contacted">Contactados</option>
                <option value="visiting">En Visita</option>
                <option value="negotiation">En Negociación</option>
                <option value="closing">Cierre / Ganado</option>
              </select>
            </div>
          </div>

          {/* Tabla de Números y Datos por Lead */}
          <div className="rounded-xl border border-slate-200 dark:border-slate-800 overflow-x-auto">
            <table className="w-full text-left text-xs text-slate-700 dark:text-slate-300">
              <thead className="border-b border-slate-200 bg-slate-50/80 text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:border-slate-800 dark:bg-slate-900/60 dark:text-slate-400">
                <tr>
                  <th className="px-4 py-3">Lead</th>
                  <th className="px-4 py-3">Teléfono / WhatsApp</th>
                  <th className="px-4 py-3">Asesor</th>
                  <th className="px-4 py-3">Propiedad / Cotización</th>
                  <th className="px-4 py-3">Etapa</th>
                  <th className="px-4 py-3">Seguimientos</th>
                  <th className="px-4 py-3 text-right">Acción</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {filteredLeadList.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-4 py-8 text-center text-slate-400">
                      No se encontraron leads con los filtros seleccionados.
                    </td>
                  </tr>
                ) : (
                  filteredLeadList.map(({ lead, followUpCount, lastFollowUp, propTitle, propPrice, propCurrency }) => {
                    const stageBadge = STAGE_LABELS[lead.stage] || { label: lead.stage, color: "bg-slate-100 text-slate-700" };
                    const cleanPhone = lead.phone?.replace(/[^0-9]/g, "");

                    return (
                      <tr key={lead.id} className="hover:bg-slate-50/60 dark:hover:bg-slate-900/40 transition-colors">
                        <td className="px-4 py-3">
                          <p className="font-bold text-slate-900 dark:text-slate-100">{lead.name}</p>
                          {lead.origin && (
                            <span className="text-[10px] text-slate-400">Origen: {lead.origin}</span>
                          )}
                        </td>

                        <td className="px-4 py-3 whitespace-nowrap">
                          {lead.phone ? (
                            <div className="flex items-center gap-2">
                              <span className="font-mono text-xs font-semibold text-slate-800 dark:text-slate-200">
                                {lead.phone}
                              </span>
                              <div className="flex items-center gap-1">
                                <a
                                  href={`tel:${cleanPhone}`}
                                  className="p-1 text-slate-400 hover:text-blue-600 rounded transition-colors"
                                  title="Llamar por teléfono"
                                >
                                  <Phone className="size-3.5" />
                                </a>
                                <a
                                  href={`https://wa.me/${cleanPhone}`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="p-1 text-slate-400 hover:text-emerald-600 rounded transition-colors"
                                  title="Abrir WhatsApp"
                                >
                                  <MessageCircle className="size-3.5" />
                                </a>
                              </div>
                            </div>
                          ) : (
                            <span className="text-slate-400 italic">Sin teléfono</span>
                          )}
                        </td>

                        <td className="px-4 py-3 whitespace-nowrap">
                          <span className="font-medium text-slate-800 dark:text-slate-200">
                            {lead.agentName || "Sin asignar"}
                          </span>
                        </td>

                        <td className="px-4 py-3">
                          <p className="font-semibold text-slate-900 dark:text-slate-100 truncate max-w-[200px]" title={propTitle}>
                            {propTitle}
                          </p>
                          {propPrice ? (
                            <span className="text-[11px] font-bold text-blue-600 dark:text-blue-400">
                              {propCurrency} {propPrice.toLocaleString()}
                            </span>
                          ) : null}
                        </td>

                        <td className="px-4 py-3 whitespace-nowrap">
                          <span className={cn("text-[10px] font-bold px-2 py-0.5 rounded-md", stageBadge.color)}>
                            {stageBadge.label}
                          </span>
                        </td>

                        <td className="px-4 py-3 whitespace-nowrap">
                          <div className="flex items-center gap-1.5">
                            <span className="font-bold text-slate-800 dark:text-slate-200">
                              {followUpCount} {followUpCount === 1 ? "contacto" : "contactos"}
                            </span>
                          </div>
                          {lastFollowUp ? (
                            <p className="text-[10px] text-slate-400">
                              {formatArgentinaDateTime(lastFollowUp.occurredAt)}
                            </p>
                          ) : (
                            <span className="text-[10px] text-rose-500 font-medium">Sin contacto previo</span>
                          )}
                        </td>

                        <td className="px-4 py-3 text-right whitespace-nowrap">
                          <Link href={`/admin/leads/${lead.id}`}>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-8 gap-1 text-xs font-semibold text-blue-600 hover:text-blue-700 hover:bg-blue-50 dark:text-blue-400 dark:hover:bg-blue-950/60"
                            >
                              Ver ficha
                              <ArrowUpRight className="size-3.5" />
                            </Button>
                          </Link>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
