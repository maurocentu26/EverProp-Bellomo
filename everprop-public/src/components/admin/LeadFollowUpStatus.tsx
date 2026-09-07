import { 
  CircleAlert, 
  CircleCheck, 
  Clock3, 
  TimerReset, 
  CalendarClock, 
  Hourglass,
  MessageCircle,
  Phone,
  Mail,
  Users,
  MapPinCheck,
  FileText,
  CalendarCheck,
  ArrowRight
} from "lucide-react";

import type { LeadFollowUp, LeadFollowUpType } from "@/data/admin-sample";
import { getLeadFollowUpState, getLeadFollowUps } from "@/lib/lead-follow-up";
import { cn } from "@/lib/utils";

const TYPE_ICONS: Record<LeadFollowUpType, typeof Phone> = {
  call: Phone,
  whatsapp: MessageCircle,
  email: Mail,
  meeting: Users,
  visit: MapPinCheck,
  note: FileText,
};

const TYPE_NAMES: Record<LeadFollowUpType, string> = {
  call: "Llamada",
  whatsapp: "WhatsApp",
  email: "Correo",
  meeting: "Reunión",
  visit: "Visita",
  note: "Nota",
};

type LeadFollowUpStatusProps = {
  leadId: string;
  followUps?: LeadFollowUp[];
  legacyUpdatedAt?: string;
  companyId?: string;
  compact?: boolean;
  className?: string;
};

export function LeadFollowUpStatus({
  leadId,
  followUps = [],
  legacyUpdatedAt,
  companyId,
  compact = false,
  className,
}: LeadFollowUpStatusProps) {
  const state = getLeadFollowUpState(followUps, leadId, legacyUpdatedAt, new Date(), companyId);
  const overdue = state.kind === "overdue";
  const dueSoon = state.kind === "dueSoon";
  const empty = state.kind === "none";
  const isCurrent = state.kind === "current";

  const StatusIcon = overdue ? CircleAlert : dueSoon ? TimerReset : empty ? Clock3 : CircleCheck;

  // Obtener el seguimiento más reciente para extraer canal y próxima acción
  const leadFollowUps = getLeadFollowUps(followUps, leadId, companyId);
  const latestFollowUp = leadFollowUps[0];
  const ChannelIcon = latestFollowUp ? TYPE_ICONS[latestFollowUp.type] || Phone : null;

  if (compact) {
    return (
      <div className={cn("min-w-0 space-y-1", className)} role="status">
        <span
          className={cn(
            "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-bold",
            overdue && "border-rose-200 bg-rose-50 text-rose-700",
            dueSoon && "border-amber-200 bg-amber-50 text-amber-800",
            empty && "border-slate-200 bg-slate-100 text-slate-700",
            isCurrent && "border-emerald-200 bg-emerald-50 text-emerald-700",
          )}
        >
          <StatusIcon className="size-3.5 shrink-0" aria-hidden="true" />
          {state.title}
        </span>
        {!empty && (
          <div className="flex items-center gap-1 text-xs text-slate-500">
            <Clock3 className="size-3 text-slate-400 shrink-0" />
            <span className={cn(overdue ? "font-semibold text-rose-700" : dueSoon ? "font-semibold text-amber-800" : "text-slate-600")}>
              {state.detail}
            </span>
          </div>
        )}
      </div>
    );
  }

  return (
    <div
      className={cn(
        "rounded-2xl border p-4 space-y-3.5",
        overdue && "border-rose-200 bg-rose-50/60",
        dueSoon && "border-amber-200 bg-amber-50/60",
        empty && "border-slate-200 bg-slate-50",
        isCurrent && "border-emerald-200 bg-emerald-50/60",
        className,
      )}
      role="status"
    >
      {/* Cabecera del estado con badge */}
      <div className="flex items-center justify-between gap-2 border-b border-slate-200/60 pb-3">
        <div className="flex items-center gap-2">
          <span
            className={cn(
              "flex size-8 shrink-0 items-center justify-center rounded-xl",
              overdue && "bg-rose-100 text-rose-700",
              dueSoon && "bg-amber-100 text-amber-800",
              empty && "bg-slate-200 text-slate-700",
              isCurrent && "bg-emerald-100 text-emerald-700",
            )}
          >
            <StatusIcon className="size-4" aria-hidden="true" />
          </span>
          <div>
            <p className={cn(
              "text-sm font-bold",
              overdue && "text-rose-950",
              dueSoon && "text-amber-950",
              empty && "text-slate-900",
              isCurrent && "text-emerald-950",
            )}>
              {state.title}
            </p>
            <p className="text-xs text-slate-600 leading-tight">
              {state.detail}
            </p>
          </div>
        </div>
      </div>

      {/* Grid de Metadatos con Iconos Distribuidos */}
      <div className="grid grid-cols-1 gap-2 pt-0.5">
        {/* Último contacto */}
        <div className="flex items-center gap-2.5 rounded-xl bg-white/80 p-2.5 border border-slate-100 shadow-2xs">
          <span className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-600">
            <CalendarClock className="size-3.5" aria-hidden="true" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Último contacto</p>
            <p className="truncate text-xs font-semibold text-slate-800">
              {state.formattedDate || "Sin actividad previa"}
            </p>
          </div>
        </div>

        {/* Plazo límite de 10 días */}
        {state.formattedDeadline && (
          <div className="flex items-center gap-2.5 rounded-xl bg-white/80 p-2.5 border border-slate-100 shadow-2xs">
            <span className={cn(
              "flex size-7 shrink-0 items-center justify-center rounded-lg",
              overdue ? "bg-rose-100 text-rose-700" : dueSoon ? "bg-amber-100 text-amber-700" : "bg-slate-100 text-slate-600"
            )}>
              <Hourglass className="size-3.5" aria-hidden="true" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Vencimiento (10 días)</p>
              <p className={cn(
                "truncate text-xs font-semibold",
                overdue ? "text-rose-800 font-bold" : "text-slate-800"
              )}>
                {state.formattedDeadline}
              </p>
            </div>
          </div>
        )}

        {/* Canal del último contacto */}
        {latestFollowUp && ChannelIcon && (
          <div className="flex items-center gap-2.5 rounded-xl bg-white/80 p-2.5 border border-slate-100 shadow-2xs">
            <span className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-blue-700">
              <ChannelIcon className="size-3.5" aria-hidden="true" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Último canal</p>
              <p className="truncate text-xs font-semibold text-slate-800">
                {TYPE_NAMES[latestFollowUp.type]} · {latestFollowUp.summary || "Contacto registrado"}
              </p>
            </div>
          </div>
        )}

        {/* Próximo contacto agendado (si existe) */}
        {latestFollowUp?.nextContactAt && (
          <div className="flex items-center gap-2.5 rounded-xl bg-white/80 p-2.5 border border-blue-100 shadow-2xs">
            <span className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-blue-100 text-blue-700">
              <CalendarCheck className="size-3.5" aria-hidden="true" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-[10px] font-bold uppercase tracking-wider text-blue-600">Próximo contacto</p>
              <p className="truncate text-xs font-bold text-slate-900">
                {latestFollowUp.nextContactAt}
              </p>
            </div>
          </div>
        )}

        {/* Próxima acción comprometida (si existe) */}
        {latestFollowUp?.nextAction && (
          <div className="flex items-center gap-2.5 rounded-xl bg-white/80 p-2.5 border border-slate-100 shadow-2xs">
            <span className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-emerald-50 text-emerald-700">
              <ArrowRight className="size-3.5" aria-hidden="true" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Próxima acción</p>
              <p className="truncate text-xs font-semibold text-slate-800">
                {latestFollowUp.nextAction}
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
