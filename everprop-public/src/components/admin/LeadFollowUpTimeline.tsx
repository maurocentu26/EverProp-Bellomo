"use client";

import { useState } from "react";
import {
  CalendarClock,
  Calendar,
  Clock3,
  FileText,
  Mail,
  MapPinCheck,
  MessageCircle,
  Phone,
  Users,
  ChevronRight,
  User,
  ArrowRight,
  CalendarCheck,
} from "lucide-react";

import type { LeadFollowUp, LeadFollowUpType } from "@/data/admin-sample";
import { getAdvisor } from "@/data/auth-sample";
import { formatArgentinaDateTime, getLeadFollowUps } from "@/lib/lead-follow-up";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const TYPE_META: Record<
  LeadFollowUpType,
  {
    label: string;
    icon: typeof Phone;
    color: string;
    badgeColor: string;
  }
> = {
  call: {
    label: "Llamada",
    icon: Phone,
    color: "bg-blue-600 text-white",
    badgeColor: "bg-blue-50 text-blue-700 border-blue-200",
  },
  whatsapp: {
    label: "WhatsApp",
    icon: MessageCircle,
    color: "bg-emerald-600 text-white",
    badgeColor: "bg-emerald-50 text-emerald-700 border-emerald-200",
  },
  email: {
    label: "Email",
    icon: Mail,
    color: "bg-indigo-600 text-white",
    badgeColor: "bg-indigo-50 text-indigo-700 border-indigo-200",
  },
  meeting: {
    label: "Reunión",
    icon: Users,
    color: "bg-amber-600 text-white",
    badgeColor: "bg-amber-50 text-amber-800 border-amber-200",
  },
  visit: {
    label: "Visita",
    icon: MapPinCheck,
    color: "bg-purple-600 text-white",
    badgeColor: "bg-purple-50 text-purple-700 border-purple-200",
  },
  note: {
    label: "Nota interna",
    icon: FileText,
    color: "bg-slate-600 text-white",
    badgeColor: "bg-slate-100 text-slate-700 border-slate-200",
  },
};

type LeadFollowUpTimelineProps = {
  leadId: string;
  companyId: string;
  followUps: LeadFollowUp[];
  legacyUpdatedAt?: string;
};

export function LeadFollowUpTimeline({
  leadId,
  companyId,
  followUps,
  legacyUpdatedAt,
}: LeadFollowUpTimelineProps) {
  const [selectedFollowUp, setSelectedFollowUp] = useState<LeadFollowUp | null>(null);

  const items = getLeadFollowUps(followUps, leadId, companyId);
  const hasLegacyOnly =
    Boolean(legacyUpdatedAt) && !items.some((item) => item.occurredAt === legacyUpdatedAt);

  if (items.length === 0 && !hasLegacyOnly) {
    return (
      <div className="flex min-h-40 flex-col items-center justify-center rounded-2xl border-2 border-dashed border-slate-200 bg-slate-50 p-6 text-center">
        <CalendarClock className="size-8 text-slate-400" aria-hidden="true" />
        <p className="mt-3 text-base font-bold text-slate-800">Sin actividad comercial registrada</p>
        <p className="mt-1 text-xs text-slate-500">
          Registrá un nuevo seguimiento para iniciar el historial de este cliente.
        </p>
      </div>
    );
  }

  const activeMeta = selectedFollowUp ? TYPE_META[selectedFollowUp.type] : null;
  const ActiveIcon = activeMeta?.icon ?? Phone;
  const activeAdvisor = selectedFollowUp
    ? selectedFollowUp.agentName
      ? { name: selectedFollowUp.agentName }
      : getAdvisor(selectedFollowUp.agentId)
    : null;

  return (
    <>
      <div className="relative pl-6 sm:pl-8 before:absolute before:bottom-3 before:left-2.5 before:top-3 before:w-0.5 before:bg-slate-200 sm:before:left-3">
        <div className="space-y-3.5">
          {items.map((item) => {
            const meta = TYPE_META[item.type];
            const Icon = meta.icon;
            const advisorName = item.agentName || getAdvisor(item.agentId)?.name || "Asesor";
            const formattedDate = formatArgentinaDateTime(item.occurredAt);

            return (
              <div key={item.id} className="relative">
                {/* Marcador del canal sobre la línea vertical */}
                <span
                  className={cn(
                    "absolute -left-6 top-3 flex size-7 items-center justify-center rounded-lg border-2 border-white shadow-xs sm:-left-8 sm:size-8",
                    meta.color
                  )}
                  aria-hidden="true"
                >
                  <Icon className="size-3.5 sm:size-4" />
                </span>

                {/* Tarjeta interactiva clicable por fecha */}
                <button
                  type="button"
                  onClick={() => setSelectedFollowUp(item)}
                  className="w-full text-left rounded-xl border border-slate-200 bg-white p-3.5 shadow-xs hover:border-blue-400 hover:bg-slate-50/60 transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 group"
                >
                  {/* Fila superior: Fecha destacada + Canal + Asesor */}
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="inline-flex items-center gap-1.5 rounded-lg bg-slate-100 px-2.5 py-1 text-xs font-bold text-slate-900 group-hover:bg-blue-50 group-hover:text-blue-700 transition-colors">
                        <Calendar className="size-3 text-slate-400 group-hover:text-blue-600 transition-colors" />
                        {formattedDate}
                      </span>

                      <span
                        className={cn(
                          "inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-[11px] font-semibold",
                          meta.badgeColor
                        )}
                      >
                        <Icon className="size-3" />
                        {meta.label}
                      </span>
                    </div>

                    <div className="flex items-center gap-1 text-xs font-medium text-slate-500">
                      <User className="size-3 text-slate-400" />
                      <span className="truncate max-w-40">{advisorName}</span>
                    </div>
                  </div>

                  {/* Resumen del seguimiento */}
                  <p className="mt-2 text-sm font-semibold text-slate-900 line-clamp-2">
                    {item.summary}
                  </p>

                  {/* Fila inferior: Próximo contacto / Ver Detalle */}
                  <div className="mt-2.5 flex items-center justify-between gap-2 border-t border-slate-100 pt-2 text-xs text-slate-500">
                    <div className="flex items-center gap-1.5 truncate">
                      {item.nextContactAt ? (
                        <span className="inline-flex items-center gap-1 font-medium text-amber-700 bg-amber-50 border border-amber-200 rounded px-1.5 py-0.5 text-[11px]">
                          <CalendarCheck className="size-3" />
                          Próximo: {formatArgentinaDateTime(item.nextContactAt)}
                        </span>
                      ) : (
                        <span className="truncate text-slate-500 line-clamp-1">
                          {item.result.slice(0, 80)}
                          {item.result.length > 80 ? "..." : ""}
                        </span>
                      )}
                    </div>

                    <span className="inline-flex items-center gap-1 font-bold text-blue-600 shrink-0 group-hover:translate-x-0.5 transition-transform text-[11px]">
                      Ver detalle
                      <ChevronRight className="size-3" />
                    </span>
                  </div>
                </button>
              </div>
            );
          })}

          {hasLegacyOnly && legacyUpdatedAt && (
            <div className="relative">
              <span
                className="absolute -left-6 top-3 flex size-7 items-center justify-center rounded-lg border-2 border-white bg-slate-500 text-white shadow-xs sm:-left-8 sm:size-8"
                aria-hidden="true"
              >
                <CalendarClock className="size-3.5 sm:size-4" />
              </span>

              <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-3.5 text-xs text-slate-600">
                <span className="inline-flex items-center gap-1 rounded bg-slate-200/80 px-2 py-0.5 text-[11px] font-bold text-slate-800">
                  <Calendar className="size-3" />
                  {formatArgentinaDateTime(legacyUpdatedAt)}
                </span>
                <p className="mt-1.5 font-semibold text-slate-800">
                  Registro anterior compatible (sin detalle histórico de canal)
                </p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── MODAL CON LA INFORMACIÓN COMPLETA DEL SEGUIMIENTO ── */}
      <Dialog
        open={Boolean(selectedFollowUp)}
        onOpenChange={(open) => {
          if (!open) setSelectedFollowUp(null);
        }}
      >
        <DialogContent className="sm:max-w-xl max-h-[90vh] overflow-y-auto">
          {selectedFollowUp && activeMeta && (
            <>
              <DialogHeader>
                <div className="flex items-center gap-2">
                  <span
                    className={cn(
                      "flex size-8 items-center justify-center rounded-lg shadow-2xs",
                      activeMeta.color
                    )}
                  >
                    <ActiveIcon className="size-4" />
                  </span>
                  <div>
                    <DialogTitle className="text-lg font-bold text-slate-900">
                      Detalle de Seguimiento
                    </DialogTitle>
                    <DialogDescription className="text-xs text-slate-500">
                      Interacción comercial registrada
                    </DialogDescription>
                  </div>
                </div>
              </DialogHeader>

              <div className="space-y-4 py-2">
                {/* Bloque de Metadatos: Fecha, Canal y Asesor */}
                <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-3 rounded-xl border border-slate-200 bg-slate-50 p-3">
                  <div className="space-y-0.5">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                      Fecha y Hora
                    </span>
                    <p className="text-xs font-bold text-slate-900 flex items-center gap-1">
                      <Clock3 className="size-3 text-slate-400" />
                      {formatArgentinaDateTime(selectedFollowUp.occurredAt)}
                    </p>
                  </div>

                  <div className="space-y-0.5">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                      Canal
                    </span>
                    <p className="text-xs font-bold text-slate-900 flex items-center gap-1">
                      <ActiveIcon className="size-3 text-slate-400" />
                      {activeMeta.label}
                    </p>
                  </div>

                  <div className="space-y-0.5">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                      Asesor Responsable
                    </span>
                    <p className="text-xs font-bold text-slate-900 flex items-center gap-1 truncate">
                      <User className="size-3 text-slate-400 shrink-0" />
                      <span className="truncate">{activeAdvisor?.name ?? "Asesor"}</span>
                    </p>
                  </div>
                </div>

                {/* Resumen / Título del contacto */}
                <div>
                  <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500">
                    Resumen del Contacto
                  </h4>
                  <p className="mt-1 text-sm font-bold text-slate-900">
                    {selectedFollowUp.summary}
                  </p>
                </div>

                {/* Resultado completo */}
                <div>
                  <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500">
                    Resultado de la Gestión
                  </h4>
                  <div className="mt-1 rounded-xl border border-slate-200 bg-slate-50/80 p-3.5 text-sm text-slate-800 leading-relaxed whitespace-pre-wrap">
                    {selectedFollowUp.result}
                  </div>
                </div>

                {/* Compromisos futuros (Próxima acción y Próximo contacto) */}
                {(selectedFollowUp.nextAction || selectedFollowUp.nextContactAt) && (
                  <div className="space-y-2 rounded-xl border border-slate-200 bg-white p-3">
                    <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500">
                      Compromisos y Próximos Pasos
                    </h4>

                    {selectedFollowUp.nextAction && (
                      <div className="flex items-start gap-2 text-xs text-slate-800">
                        <ArrowRight className="size-3.5 text-blue-600 mt-0.5 shrink-0" />
                        <div>
                          <span className="font-bold text-slate-900">Próxima acción: </span>
                          <span>{selectedFollowUp.nextAction}</span>
                        </div>
                      </div>
                    )}

                    {selectedFollowUp.nextContactAt && (
                      <div className="flex items-start gap-2 text-xs text-slate-800">
                        <CalendarCheck className="size-3.5 text-amber-600 mt-0.5 shrink-0" />
                        <div>
                          <span className="font-bold text-slate-900">Próximo contacto agendado: </span>
                          <span className="font-semibold text-amber-800">
                            {formatArgentinaDateTime(selectedFollowUp.nextContactAt)}
                          </span>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>

              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setSelectedFollowUp(null)}
                  className="w-full sm:w-auto h-9 text-xs font-semibold"
                >
                  Cerrar
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
