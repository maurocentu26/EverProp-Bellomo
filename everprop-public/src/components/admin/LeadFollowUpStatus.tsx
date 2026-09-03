import { CircleAlert, CircleCheck, Clock3, TimerReset } from "lucide-react";

import type { LeadFollowUp } from "@/data/admin-sample";
import { getLeadFollowUpState } from "@/lib/lead-follow-up";
import { cn } from "@/lib/utils";

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
  const Icon = overdue ? CircleAlert : dueSoon ? TimerReset : empty ? Clock3 : CircleCheck;

  if (compact) {
    return (
      <div className={cn("min-w-0", className)} role="status">
        <span
          className={cn(
            "inline-flex min-h-8 items-center gap-1.5 rounded-full border px-3 py-1 text-sm font-bold",
            overdue && "border-rose-200 bg-rose-50 text-rose-700",
            dueSoon && "border-amber-200 bg-amber-50 text-amber-800",
            empty && "border-slate-200 bg-slate-100 text-slate-700",
            state.kind === "current" && "border-emerald-200 bg-emerald-50 text-emerald-700",
          )}
        >
          <Icon className="size-4 shrink-0" aria-hidden="true" />
          {state.title}
        </span>
        {!empty && (
          <>
            <span className={cn("mt-1 block text-sm", overdue ? "font-semibold text-rose-700" : dueSoon ? "font-semibold text-amber-800" : "text-slate-600")}>
              {state.detail}
            </span>
            <span className="mt-0.5 block text-sm text-slate-500">{state.formattedDate}</span>
          </>
        )}
      </div>
    );
  }

  return (
    <div
      className={cn(
        "flex items-start gap-3 rounded-2xl border p-4",
        overdue && "border-rose-200 bg-rose-50 text-rose-950",
        dueSoon && "border-amber-200 bg-amber-50 text-amber-950",
        empty && "border-slate-200 bg-slate-100 text-slate-900",
        state.kind === "current" && "border-emerald-200 bg-emerald-50 text-emerald-950",
        className,
      )}
      role="status"
    >
      <Icon
        className={cn(
          "mt-0.5 size-6 shrink-0",
          overdue && "text-rose-700",
          dueSoon && "text-amber-700",
          empty && "text-slate-600",
          state.kind === "current" && "text-emerald-700",
        )}
        aria-hidden="true"
      />
      <div className="min-w-0">
        <p className="text-base font-bold">{state.title}</p>
        <p className="mt-1 text-base leading-7 opacity-85">{state.detail}</p>
        {state.formattedDate && (
          <p className="mt-1 text-sm font-semibold opacity-75">Último contacto real: {state.formattedDate}</p>
        )}
        {state.formattedDeadline && (
          <p className="mt-1 text-sm font-semibold opacity-75">Límite de 10 días: {state.formattedDeadline}</p>
        )}
      </div>
    </div>
  );
}
