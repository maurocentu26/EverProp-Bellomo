"use client";

import { 
  MessageCircle, 
  Eye,
} from "lucide-react";
import { properties as sampleProperties, type Lead, type LeadFollowUp } from "@/data/admin-sample";
import  Badge  from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import { LeadFollowUpStatus } from "@/components/admin/LeadFollowUpStatus";

// Mapa de colores para los estados (Consistente con el Kanban)
const STAGE_LABELS: Record<string, { label: string; class: string }> = {
  new: { label: "Nuevo", class: "bg-slate-100 text-slate-700" },
  contacted: { label: "Contactado", class: "bg-blue-100 text-blue-700" },
  visiting: { label: "Visitando", class: "bg-amber-100 text-amber-700" },
  closing: { label: "Cerrando", class: "bg-emerald-100 text-emerald-700" },
};

type LeadActionsProps = {
  lead: Lead;
  onView: () => void;
};

function LeadActions({ lead, onView }: LeadActionsProps) {
  const whatsappNumber = lead.phone?.replace(/\D/g, "");

  return (
    <div className="flex shrink-0 items-center justify-end gap-1">
      {whatsappNumber && (
        <Button
          variant="ghost"
          size="icon"
          className="h-11 w-11 text-emerald-600 hover:bg-emerald-50"
          onClick={() => window.open(`https://wa.me/${whatsappNumber}`, "_blank", "noopener,noreferrer")}
          aria-label={`Contactar a ${lead.name} por WhatsApp`}
          title="Contactar por WhatsApp"
        >
          <MessageCircle className="h-5 w-5" aria-hidden="true" />
        </Button>
      )}
      <Button
        variant="ghost"
        size="icon"
        className="h-11 w-11 text-blue-600 hover:bg-blue-50"
        onClick={onView}
        aria-label={`Abrir ficha de ${lead.name}`}
        title="Abrir ficha del lead"
      >
        <Eye className="h-5 w-5" aria-hidden="true" />
      </Button>
    </div>
  );
}

export default function LeadTable({ leads, followUps }: { leads: Lead[]; followUps: LeadFollowUp[] }) {
  const router = useRouter();

  const getInitials = (name: string) => name.split(" ").map(n => n[0]).join("").toUpperCase();

  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="divide-y divide-slate-100 xl:hidden">
        {leads.map((lead) => {
          const property = sampleProperties.find((item) => item.id === lead.propertyIds[0]);
          const stage = STAGE_LABELS[lead.stage] || { label: lead.stage, class: "" };

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
                <Badge className={cn("shrink-0 rounded-full border-none px-2 py-1 text-[10px] font-bold uppercase shadow-none", stage.class)}>
                  {stage.label}
                </Badge>
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
                <span className="text-sm font-medium text-slate-500">Ver o contactar</span>
                <LeadActions lead={lead} onView={() => router.push(`/admin/leads/${lead.id}`)} />
              </div>
            </article>
          );
        })}
      </div>

      <div className="hidden xl:block">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="border-b border-slate-100 bg-slate-50/50">
              <th className="px-4 py-4 text-[11px] font-bold uppercase tracking-widest text-slate-400">Interesado</th>
              <th className="px-4 py-4 text-[11px] font-bold uppercase tracking-widest text-slate-400">Propiedad / Precio</th>
              <th className="px-4 py-4 text-[11px] font-bold uppercase tracking-widest text-slate-400">Estado</th>
              <th className="px-4 py-4 text-[11px] font-bold uppercase tracking-widest text-slate-400">Origen</th>
              <th className="px-4 py-4 text-[11px] font-bold uppercase tracking-widest text-slate-400">Seguimiento</th>
              <th className="px-4 py-4 text-right text-[11px] font-bold uppercase tracking-widest text-slate-400">Acciones</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50">
            {leads.map((lead) => {
              const props = sampleProperties.find(p => p.id === lead.propertyIds[0]);
              const stage = STAGE_LABELS[lead.stage] || { label: lead.stage, class: "" };

              return (
                <tr key={lead.id} className="group hover:bg-slate-50/50 transition-colors">
                  {/* Columna: Interesado */}
                  <td className="px-4 py-4">
                    <div className="flex items-center gap-3">
                      <Avatar className="h-9 w-9 border border-slate-100">
                        <AvatarFallback className="bg-slate-100 text-slate-600 text-[10px] font-bold">
                          {getInitials(lead.name)}
                        </AvatarFallback>
                      </Avatar>
                      <div className="flex flex-col">
                        <span className="text-sm font-semibold text-slate-900 leading-tight">{lead.name}</span>
                        <span className="text-xs text-slate-500">{lead.email || "Sin email"}</span>
                      </div>
                    </div>
                  </td>

                  {/* Columna: Propiedad */}
                  <td className="px-4 py-4">
                    <div className="flex flex-col">
                      <span className="text-sm text-slate-700 truncate max-w-[200px] font-medium">
                        {props?.title || "Sin propiedad"}
                      </span>
                      <span className="text-xs font-bold text-blue-600">
                        {props ? `${props.currency} ${props.price.toLocaleString()}` : "-"}
                      </span>
                    </div>
                  </td>

                  {/* Columna: Estado */}
                  <td className="px-4 py-4">
                    <Badge className={cn("px-2 py-0.5 rounded-full border-none shadow-none text-[10px] font-bold uppercase", stage.class)}>
                      {stage.label}
                    </Badge>
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

                  {/* Columna: Acciones */}
                  <td className="px-4 py-4 text-right">
                    <div className="flex items-center justify-end gap-1 opacity-100 transition-opacity md:opacity-0 md:group-focus-within:opacity-100 md:group-hover:opacity-100">
                      <LeadActions lead={lead} onView={() => router.push(`/admin/leads/${lead.id}`)} />
                    </div>
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
