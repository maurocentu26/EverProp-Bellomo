"use client";

import { 
  MessageCircle, 
  Eye,
  Phone,
  ClipboardCheck,
} from "lucide-react";
import { properties as sampleProperties, type Lead, type LeadFollowUp } from "@/data/admin-sample";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import { LeadFollowUpStatus } from "@/components/admin/LeadFollowUpStatus";

export const STAGE_OPTIONS: { id: Lead["stage"]; label: string; class: string }[] = [
  { id: "new", label: "Nuevo", class: "bg-slate-100 text-slate-700 border-slate-300" },
  { id: "contacted", label: "Contactado", class: "bg-blue-100 text-blue-700 border-blue-300" },
  { id: "visiting", label: "Visita Agendada", class: "bg-purple-100 text-purple-700 border-purple-300" },
  { id: "negotiation", label: "Negociación", class: "bg-amber-100 text-amber-700 border-amber-300" },
  { id: "closing", label: "Cerrado / Ganado", class: "bg-emerald-100 text-emerald-700 border-emerald-300" },
];

export const STAGE_LABELS: Record<string, { label: string; class: string }> = Object.fromEntries(
  STAGE_OPTIONS.map((opt) => [opt.id, { label: opt.label, class: opt.class }])
);

type LeadActionsProps = {
  lead: Lead;
  onView: () => void;
  onFollowUp?: () => void;
};

function LeadActions({ lead, onView, onFollowUp }: LeadActionsProps) {
  const whatsappNumber = lead.phone?.replace(/\D/g, "");

  return (
    <div className="flex shrink-0 items-center justify-end gap-1">
      {whatsappNumber && (
        <Button
          variant="ghost"
          size="icon"
          className="h-9 w-9 text-emerald-600 hover:bg-emerald-50 hover:text-emerald-700"
          onClick={() => window.open(`https://wa.me/${whatsappNumber}`, "_blank", "noopener,noreferrer")}
          aria-label={`Contactar a ${lead.name} por WhatsApp`}
          title="Contactar por WhatsApp"
        >
          <MessageCircle className="h-4 w-4" aria-hidden="true" />
        </Button>
      )}
      {lead.phone && (
        <a
          href={`tel:${lead.phone}`}
          className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-800 transition-colors"
          aria-label={`Llamar a ${lead.name}`}
          title="Llamar por teléfono"
        >
          <Phone className="h-4 w-4" aria-hidden="true" />
        </a>
      )}
      {onFollowUp && (
        <Button
          variant="ghost"
          size="icon"
          className="h-9 w-9 text-blue-600 hover:bg-blue-50 hover:text-blue-700"
          onClick={onFollowUp}
          aria-label={`Registrar seguimiento de ${lead.name}`}
          title="Registrar seguimiento"
        >
          <ClipboardCheck className="h-4 w-4" aria-hidden="true" />
        </Button>
      )}
      <Button
        variant="ghost"
        size="icon"
        className="h-9 w-9 text-slate-500 hover:bg-slate-100 hover:text-slate-900"
        onClick={onView}
        aria-label={`Abrir ficha de ${lead.name}`}
        title="Abrir ficha del lead"
      >
        <Eye className="h-4 w-4" aria-hidden="true" />
      </Button>
    </div>
  );
}

export type LeadTableProps = {
  leads: Lead[];
  followUps: LeadFollowUp[];
  onStageChange?: (leadId: string, stage: Lead["stage"]) => void;
  onFollowUp?: (lead: Lead) => void;
};

export default function LeadTable({ leads, followUps, onStageChange, onFollowUp }: LeadTableProps) {
  const router = useRouter();

  const getInitials = (name: string) => name.split(" ").map(n => n[0]).join("").toUpperCase();

  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      {/* Vista Mobile / Tablet */}
      <div className="divide-y divide-slate-100 xl:hidden">
        {leads.map((lead) => {
          const property = sampleProperties.find((item) => item.id === lead.propertyIds[0]);
          const currentStage = STAGE_OPTIONS.find((s) => s.id === lead.stage) || STAGE_OPTIONS[0];

          return (
            <article key={lead.id} className="p-4 sm:p-5">
              <div className="flex min-w-0 items-start gap-3">
                <Avatar className="h-10 w-10 shrink-0 border border-slate-100">
                  <AvatarFallback className="bg-slate-100 text-xs font-bold text-slate-600">
                    {getInitials(lead.name)}
                  </AvatarFallback>
                </Avatar>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-base font-semibold leading-6 text-slate-900">{lead.name}</p>
                  <p className="truncate text-sm text-slate-500">{lead.email || lead.phone || "Sin datos de contacto"}</p>
                </div>
                {/* Selector de estado inline en mobile */}
                <select
                  aria-label={`Cambiar estado de ${lead.name}`}
                  value={lead.stage}
                  onChange={(e) => onStageChange?.(lead.id, e.target.value as Lead["stage"])}
                  className={cn(
                    "cursor-pointer shrink-0 rounded-lg border px-2 py-1 text-xs font-bold focus:outline-none focus:ring-2 focus:ring-blue-400",
                    currentStage.class
                  )}
                >
                  {STAGE_OPTIONS.map((opt) => (
                    <option key={opt.id} value={opt.id} className="bg-white text-slate-800 font-medium">
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>

              <dl className="mt-4 grid gap-4 rounded-xl bg-slate-50 p-4 sm:grid-cols-3">
                <div className="min-w-0">
                  <dt className="text-xs font-bold uppercase tracking-wider text-slate-400">Interés</dt>
                  <dd className="mt-1 truncate text-sm font-semibold text-slate-800">{property?.title || "Sin propiedad"}</dd>
                  <dd className="mt-0.5 text-sm font-bold text-blue-600">
                    {property ? `${property.currency} ${property.price.toLocaleString()}` : "Pendiente"}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs font-bold uppercase tracking-wider text-slate-400">Origen</dt>
                  <dd className="mt-1 text-sm font-medium text-slate-700">{lead.origin}</dd>
                </div>
                <div>
                  <dt className="text-xs font-bold uppercase tracking-wider text-slate-400">Seguimiento</dt>
                  <dd className="mt-1"><LeadFollowUpStatus leadId={lead.id} companyId={lead.companyId} followUps={followUps} legacyUpdatedAt={lead.followUpUpdatedAt} compact /></dd>
                </div>
              </dl>

              <div className="mt-3 flex items-center justify-between gap-3 border-t border-slate-100 pt-3">
                <span className="text-xs font-medium text-slate-500">Acciones rápidas</span>
                <LeadActions 
                  lead={lead} 
                  onView={() => router.push(`/admin/leads/${lead.id}`)}
                  onFollowUp={() => onFollowUp?.(lead)} 
                />
              </div>
            </article>
          );
        })}
      </div>

      {/* Vista Desktop (Tabla Pro) */}
      <div className="hidden xl:block overflow-x-auto">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="border-b border-slate-100 bg-slate-50/50">
              <th className="px-4 py-4 text-[11px] font-bold uppercase tracking-widest text-slate-400">Interesado</th>
              <th className="px-4 py-4 text-[11px] font-bold uppercase tracking-widest text-slate-400">Propiedad / Precio</th>
              <th className="px-4 py-4 text-[11px] font-bold uppercase tracking-widest text-slate-400">Estado (1 Clic)</th>
              <th className="px-4 py-4 text-[11px] font-bold uppercase tracking-widest text-slate-400">Origen</th>
              <th className="px-4 py-4 text-[11px] font-bold uppercase tracking-widest text-slate-400">Seguimiento</th>
              <th className="px-4 py-4 text-right text-[11px] font-bold uppercase tracking-widest text-slate-400">Acciones</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50">
            {leads.map((lead) => {
              const props = sampleProperties.find(p => p.id === lead.propertyIds[0]);
              const currentStage = STAGE_OPTIONS.find((s) => s.id === lead.stage) || STAGE_OPTIONS[0];

              return (
                <tr key={lead.id} className="group hover:bg-slate-50/60 transition-colors">
                  {/* Columna: Interesado */}
                  <td className="px-4 py-4">
                    <div className="flex items-center gap-3">
                      <Avatar className="h-9 w-9 border border-slate-100">
                        <AvatarFallback className="bg-slate-100 text-slate-600 text-[10px] font-bold">
                          {getInitials(lead.name)}
                        </AvatarFallback>
                      </Avatar>
                      <div className="flex flex-col min-w-0">
                        <span 
                          onClick={() => router.push(`/admin/leads/${lead.id}`)}
                          className="text-sm font-semibold text-slate-900 leading-tight hover:text-blue-600 cursor-pointer"
                        >
                          {lead.name}
                        </span>
                        <span className="text-xs text-slate-500 truncate">{lead.email || lead.phone || "Sin contacto"}</span>
                      </div>
                    </div>
                  </td>

                  {/* Columna: Propiedad */}
                  <td className="px-4 py-4">
                    <div className="flex flex-col">
                      <span className="text-sm text-slate-700 truncate max-w-[220px] font-medium">
                        {props?.title || "Sin propiedad"}
                      </span>
                      <span className="text-xs font-bold text-blue-600">
                        {props ? `${props.currency} ${props.price.toLocaleString()}` : "-"}
                      </span>
                    </div>
                  </td>

                  {/* Columna: Estado con Dropdown Inline */}
                  <td className="px-4 py-4">
                    <select
                      aria-label={`Cambiar estado de ${lead.name}`}
                      value={lead.stage}
                      onChange={(e) => onStageChange?.(lead.id, e.target.value as Lead["stage"])}
                      className={cn(
                        "cursor-pointer rounded-lg border px-2.5 py-1 text-xs font-bold shadow-sm transition-all focus:outline-none focus:ring-2 focus:ring-blue-400",
                        currentStage.class
                      )}
                    >
                      {STAGE_OPTIONS.map((opt) => (
                        <option key={opt.id} value={opt.id} className="bg-white text-slate-800 font-medium">
                          {opt.label}
                        </option>
                      ))}
                    </select>
                  </td>

                  {/* Columna: Origen */}
                  <td className="px-4 py-4">
                    <span className="text-xs text-slate-500 flex items-center gap-1.5">
                      <div className="h-1.5 w-1.5 rounded-full bg-slate-300" />
                      {lead.origin}
                    </span>
                  </td>

                  {/* Columna: Seguimiento */}
                  <td className="px-4 py-4">
                    <LeadFollowUpStatus leadId={lead.id} companyId={lead.companyId} followUps={followUps} legacyUpdatedAt={lead.followUpUpdatedAt} compact />
                  </td>

                  {/* Columna: Acciones Rápidas */}
                  <td className="px-4 py-4 text-right">
                    <LeadActions 
                      lead={lead} 
                      onView={() => router.push(`/admin/leads/${lead.id}`)}
                      onFollowUp={() => onFollowUp?.(lead)} 
                    />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
