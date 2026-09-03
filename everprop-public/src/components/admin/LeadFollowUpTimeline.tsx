import {
  CalendarClock,
  FileText,
  Mail,
  MapPinCheck,
  MessageCircle,
  Phone,
  Users,
} from "lucide-react";

import type { LeadFollowUp, LeadFollowUpType } from "@/data/admin-sample";
import { MOCK_USERS } from "@/data/auth-sample";
import { formatArgentinaDateTime, getLeadFollowUps } from "@/lib/lead-follow-up";

const TYPE_META: Record<LeadFollowUpType, { label: string; icon: typeof Phone }> = {
  call: { label: "Llamada", icon: Phone },
  whatsapp: { label: "WhatsApp", icon: MessageCircle },
  email: { label: "Email", icon: Mail },
  meeting: { label: "Reunión", icon: Users },
  visit: { label: "Visita", icon: MapPinCheck },
  note: { label: "Nota interna", icon: FileText },
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
  const items = getLeadFollowUps(followUps, leadId, companyId);
  const hasLegacyOnly = Boolean(legacyUpdatedAt) && !items.some((item) => item.occurredAt === legacyUpdatedAt);

  if (items.length === 0 && !hasLegacyOnly) {
    return (
      <div className="flex min-h-48 flex-col items-center justify-center rounded-3xl border-2 border-dashed border-slate-300 bg-slate-50 p-6 text-center">
        <CalendarClock className="size-10 text-slate-400" aria-hidden="true" />
        <p className="mt-4 text-xl font-bold text-slate-900">Sin actividad comercial registrada</p>
        <p className="mt-2 max-w-xl text-base leading-7 text-slate-600">El primer seguimiento aparecerá aquí con su fecha, asesor, resumen y resultado.</p>
      </div>
    );
  }

  return (
    <ol className="relative space-y-4 before:absolute before:bottom-6 before:left-6 before:top-6 before:w-px before:bg-slate-200 sm:before:left-7">
      {items.map((item) => {
        const meta = TYPE_META[item.type];
        const Icon = meta.icon;
        const advisor = MOCK_USERS.find((user) => user.id === item.agentId);

        return (
          <li key={item.id} className="relative rounded-3xl border border-slate-200 bg-white p-5 pl-16 shadow-sm sm:p-6 sm:pl-20">
            <span className="absolute left-3 top-5 z-10 flex size-12 items-center justify-center rounded-2xl border-4 border-white bg-blue-600 text-white sm:left-3 sm:top-6 sm:size-14">
              <Icon className="size-5" aria-hidden="true" />
            </span>
            <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
              <div>
                <p className="text-sm font-bold uppercase tracking-[0.12em] text-blue-700">{meta.label}</p>
                <p className="mt-1 text-xl font-bold text-slate-950">{item.summary}</p>
              </div>
              <div className="shrink-0 text-base text-slate-600 lg:text-right">
                <p className="font-semibold text-slate-900">{formatArgentinaDateTime(item.occurredAt)}</p>
                <p className="mt-1">{advisor?.name ?? "Asesor no disponible"}</p>
              </div>
            </div>
            <div className="mt-4 rounded-2xl bg-slate-50 p-4">
              <p className="text-sm font-bold text-slate-500">Resultado</p>
              <p className="mt-1 whitespace-pre-wrap text-base leading-7 text-slate-800">{item.result}</p>
            </div>
            {(item.nextAction || item.nextContactAt) && (
              <div className="mt-4 grid gap-3 border-t border-slate-200 pt-4 md:grid-cols-2">
                {item.nextAction && <p className="text-base text-slate-700"><span className="font-bold text-slate-950">Próxima acción:</span> {item.nextAction}</p>}
                {item.nextContactAt && <p className="text-base text-slate-700"><span className="font-bold text-slate-950">Próximo contacto:</span> {formatArgentinaDateTime(item.nextContactAt)}</p>}
              </div>
            )}
            {item.type === "note" && <p className="mt-4 text-sm font-semibold text-slate-500">Esta nota no modifica el plazo del último contacto comercial.</p>}
          </li>
        );
      })}

      {hasLegacyOnly && legacyUpdatedAt && (
        <li className="relative rounded-3xl border border-dashed border-slate-300 bg-slate-50 p-5 pl-16 sm:p-6 sm:pl-20">
          <span className="absolute left-3 top-5 z-10 flex size-12 items-center justify-center rounded-2xl border-4 border-slate-50 bg-slate-600 text-white sm:left-3 sm:top-6 sm:size-14">
            <CalendarClock className="size-5" aria-hidden="true" />
          </span>
          <p className="text-sm font-bold uppercase tracking-[0.12em] text-slate-600">Registro anterior compatible</p>
          <p className="mt-2 text-lg font-bold text-slate-900">Seguimiento sin detalle histórico</p>
          <p className="mt-2 text-base leading-7 text-slate-600">{formatArgentinaDateTime(legacyUpdatedAt)} · Se conserva la fecha previa, pero no se inventan tipo, resumen ni resultado.</p>
        </li>
      )}
    </ol>
  );
}
