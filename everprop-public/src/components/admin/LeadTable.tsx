"use client";

import { useState } from "react";
import { 
  MessageCircle, 
  Eye,
  Phone,
  ClipboardCheck,
  Loader2,
} from "lucide-react";
import { properties as sampleProperties, type Lead, type LeadFollowUp } from "@/data/admin-sample";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import { LeadFollowUpStatus } from "@/components/admin/LeadFollowUpStatus";

export const STAGE_OPTIONS: { id: Lead["stage"]; label: string; class: string }[] = [
  { id: "new", label: "Nuevo", class: "bg-slate-100 text-slate-700 border-slate-300 dark:bg-slate-800 dark:text-slate-200 dark:border-slate-700" },
  { id: "contacted", label: "Contactado", class: "bg-blue-100 text-blue-800 border-blue-300 dark:bg-blue-950/80 dark:text-blue-200 dark:border-blue-800" },
  { id: "visiting", label: "Visita Agendada", class: "bg-purple-100 text-purple-800 border-purple-300 dark:bg-purple-950/80 dark:text-purple-200 dark:border-purple-800" },
  { id: "negotiation", label: "Negociación", class: "bg-amber-100 text-amber-800 border-amber-300 dark:bg-amber-950/80 dark:text-amber-200 dark:border-amber-800" },
  { id: "closing", label: "Cerrado / Ganado", class: "bg-emerald-100 text-emerald-800 border-emerald-300 dark:bg-emerald-950/80 dark:text-emerald-200 dark:border-emerald-800" },
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
          className="h-9 w-9 text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-950/50 hover:text-emerald-700 dark:hover:text-emerald-300"
          onClick={() => {
            const propTitle = lead.interests?.[0]?.propertyTitle;
            const message = encodeURIComponent(
              `Hola ${lead.name}, te escribo de Bellomo Inmobiliaria respecto a tu consulta${
                propTitle ? ` sobre ${propTitle}` : ""
              }. ¿Cómo estás?`
            );
            window.open(`https://wa.me/${whatsappNumber}?text=${message}`, "_blank");
          }}
          aria-label={`Enviar WhatsApp a ${lead.name}`}
          title="Contactar por WhatsApp"
        >
          <MessageCircle className="h-4 w-4" aria-hidden="true" />
        </Button>
      )}
      {lead.phone && (
        <a
          href={`tel:${lead.phone}`}
          className="flex h-9 w-9 items-center justify-center rounded-md text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-slate-100"
          aria-label={`Llamar a ${lead.name}`}
          title="Llamar"
        >
          <Phone className="h-4 w-4" aria-hidden="true" />
        </a>
      )}
      {onFollowUp && (
        <Button
          variant="ghost"
          size="icon"
          className="h-9 w-9 text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-950/50 hover:text-blue-700 dark:hover:text-blue-300"
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
        className="h-9 w-9 text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-slate-100"
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
  onStageChange?: (leadId: string, stage: Lead["stage"]) => Promise<void> | void;
  onFollowUp?: (lead: Lead) => void;
};

export default function LeadTable({ leads, followUps, onStageChange, onFollowUp }: LeadTableProps) {
  const router = useRouter();
  const [updatingStageLeadId, setUpdatingStageLeadId] = useState<string | null>(null);

  const getInitials = (name: string) => name.split(" ").map(n => n[0]).join("").toUpperCase();

  const handleStageSelect = async (leadId: string, newStage: Lead["stage"]) => {
    if (updatingStageLeadId) return;
    try {
      setUpdatingStageLeadId(leadId);
      await onStageChange?.(leadId, newStage);
    } finally {
      setUpdatingStageLeadId(null);
    }
  };

  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-card shadow-sm">
      {/* Vista Mobile / Tablet */}
      <div className="divide-y divide-slate-100 dark:divide-slate-800 xl:hidden">
        {leads.map((lead) => {
          const property = sampleProperties.find((item) => item.id === lead.propertyIds[0]);
          const currentStage = STAGE_OPTIONS.find((s) => s.id === lead.stage) || STAGE_OPTIONS[0];

          return (
            <article
              key={lead.id}
              onClick={(e) => {
                if ((e.target as HTMLElement).closest("button, a, select, input, label")) return;
                router.push(`/admin/leads/${lead.id}`);
              }}
              className="p-3.5 sm:p-4 cursor-pointer hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition-colors"
            >
              {/* Row 1: Avatar + Name + Origin dot + Stage selector */}
              <div className="flex items-center gap-2.5">
                <Avatar className="size-9 shrink-0 border border-slate-100 dark:border-slate-800">
                  <AvatarFallback className="bg-slate-100 dark:bg-slate-800 text-[10px] font-bold text-slate-600 dark:text-slate-300">
                    {getInitials(lead.name)}
                  </AvatarFallback>
                </Avatar>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-bold text-slate-900 dark:text-slate-100 leading-tight">{lead.name}</p>
                  <p className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                    <span className="size-1.5 rounded-full bg-slate-300 dark:bg-slate-600 shrink-0" />
                    <span className="truncate">{lead.origin}</span>
                  </p>
                </div>
                <div className="relative inline-flex items-center shrink-0">
                  {updatingStageLeadId === lead.id && (
                    <span className="absolute left-1.5 top-1/2 -translate-y-1/2 flex items-center z-10 pointer-events-none">
                      <Loader2 className="size-3 animate-spin text-blue-600 dark:text-blue-400" />
                    </span>
                  )}
                  <select
                    aria-label={`Cambiar estado de ${lead.name}`}
                    disabled={updatingStageLeadId === lead.id}
                    value={lead.stage}
                    onChange={(e) => handleStageSelect(lead.id, e.target.value as Lead["stage"])}
                    className={cn(
                      "cursor-pointer shrink-0 rounded-lg border px-2 py-1 text-[11px] font-bold focus:outline-none focus:ring-2 focus:ring-blue-400 disabled:opacity-60 disabled:cursor-not-allowed",
                      updatingStageLeadId === lead.id && "pl-5",
                      currentStage.class
                    )}
                  >
                    {STAGE_OPTIONS.map((opt) => (
                      <option key={opt.id} value={opt.id} className="bg-white text-slate-800 dark:bg-slate-900 dark:text-slate-100 font-medium">
                        {opt.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Row 2: Property interest + price + follow-up status */}
              <div className="mt-2.5 flex items-center justify-between gap-2 rounded-lg bg-slate-50 dark:bg-slate-900/60 px-3 py-2 border border-slate-100 dark:border-slate-800">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs font-semibold text-slate-800 dark:text-slate-200">{property?.title || "Sin propiedad"}</p>
                  <p className="text-xs font-bold text-blue-600 dark:text-blue-400">
                    {property ? `${property.currency} ${property.price.toLocaleString()}` : "Pendiente"}
                  </p>
                </div>
                <div className="shrink-0">
                  <LeadFollowUpStatus leadId={lead.id} companyId={lead.companyId} followUps={followUps} legacyUpdatedAt={lead.followUpUpdatedAt} compact />
                </div>
              </div>

              {/* Row 3: Quick action buttons */}
              <div className="mt-2.5 flex items-center justify-end gap-1">
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
            <tr className="border-b border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50">
              <th className="px-4 py-4 text-[11px] font-bold uppercase tracking-widest text-slate-400 dark:text-slate-500">Interesado</th>
              <th className="px-4 py-4 text-[11px] font-bold uppercase tracking-widest text-slate-400 dark:text-slate-500">Propiedad / Precio</th>
              <th className="px-4 py-4 text-[11px] font-bold uppercase tracking-widest text-slate-400 dark:text-slate-500">Estado (1 Clic)</th>
              <th className="px-4 py-4 text-[11px] font-bold uppercase tracking-widest text-slate-400 dark:text-slate-500">Origen</th>
              <th className="px-4 py-4 text-[11px] font-bold uppercase tracking-widest text-slate-400 dark:text-slate-500">Seguimiento</th>
              <th className="px-4 py-4 text-right text-[11px] font-bold uppercase tracking-widest text-slate-400 dark:text-slate-500">Acciones</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50 dark:divide-slate-800/60">
            {leads.map((lead) => {
              const props = sampleProperties.find(p => p.id === lead.propertyIds[0]);
              const currentStage = STAGE_OPTIONS.find((s) => s.id === lead.stage) || STAGE_OPTIONS[0];

              return (
                <tr
                  key={lead.id}
                  onClick={(e) => {
                    if ((e.target as HTMLElement).closest("button, a, select, input, label")) return;
                    router.push(`/admin/leads/${lead.id}`);
                  }}
                  className="group hover:bg-slate-50/70 dark:hover:bg-slate-800/60 transition-colors cursor-pointer"
                >
                  {/* Columna: Interesado */}
                  <td className="px-4 py-4">
                    <div className="flex items-center gap-3">
                      <Avatar className="h-9 w-9 border border-slate-100 dark:border-slate-800">
                        <AvatarFallback className="bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 text-[10px] font-bold">
                          {getInitials(lead.name)}
                        </AvatarFallback>
                      </Avatar>
                      <div className="flex flex-col min-w-0">
                        <span 
                          onClick={() => router.push(`/admin/leads/${lead.id}`)}
                          className="text-sm font-semibold text-slate-900 dark:text-slate-100 leading-tight hover:text-blue-600 dark:hover:text-blue-400 cursor-pointer transition-colors"
                        >
                          {lead.name}
                        </span>
                        <span className="text-xs text-slate-500 dark:text-slate-400 truncate">{lead.email || lead.phone || "Sin contacto"}</span>
                      </div>
                    </div>
                  </td>

                  {/* Columna: Propiedad */}
                  <td className="px-4 py-4">
                    <div className="flex flex-col">
                      <span className="text-sm text-slate-700 dark:text-slate-300 truncate max-w-[220px] font-medium">
                        {props?.title || "Sin propiedad"}
                      </span>
                      <span className="text-xs font-bold text-blue-600 dark:text-blue-400">
                        {props ? `${props.currency} ${props.price.toLocaleString()}` : "-"}
                      </span>
                    </div>
                  </td>

                  {/* Columna: Estado con Dropdown Inline */}
                  <td className="px-4 py-4">
                    <div className="relative inline-flex items-center">
                      {updatingStageLeadId === lead.id && (
                        <span className="absolute left-2 top-1/2 -translate-y-1/2 flex items-center z-10 pointer-events-none">
                          <Loader2 className="size-3 animate-spin text-blue-600 dark:text-blue-400" />
                        </span>
                      )}
                      <select
                        aria-label={`Cambiar estado de ${lead.name}`}
                        disabled={updatingStageLeadId === lead.id}
                        value={lead.stage}
                        onChange={(e) => handleStageSelect(lead.id, e.target.value as Lead["stage"])}
                        className={cn(
                          "cursor-pointer rounded-lg border px-2.5 py-1 text-xs font-bold shadow-sm transition-all focus:outline-none focus:ring-2 focus:ring-blue-400 disabled:opacity-60 disabled:cursor-not-allowed",
                          updatingStageLeadId === lead.id && "pl-6",
                          currentStage.class
                        )}
                      >
                        {STAGE_OPTIONS.map((opt) => (
                          <option key={opt.id} value={opt.id} className="bg-white text-slate-800 dark:bg-slate-900 dark:text-slate-100 font-medium">
                            {opt.label}
                          </option>
                        ))}
                      </select>
                    </div>
                  </td>

                  {/* Columna: Origen */}
                  <td className="px-4 py-4">
                    <span className="text-xs text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
                      <div className="h-1.5 w-1.5 rounded-full bg-slate-300 dark:bg-slate-600" />
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
