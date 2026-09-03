"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { AlertTriangle, ArrowRight, Clock3 } from "lucide-react";

import { leads as sampleLeads, type Lead, type LeadFollowUp } from "@/data/admin-sample";
import { loadLeadFollowUpList, loadLeadList } from "@/lib/admin-storage";
import { getLeadFollowUpState } from "@/lib/lead-follow-up";
import { useAuth } from "@/lib/auth-context";
import { deferEffectUpdate } from "@/lib/deferred-effect";

export function AdvisorFollowUpPriority({ companyId = "c1" }: { companyId?: string }) {
  const { currentUser } = useAuth();
  const [leads, setLeads] = useState<Lead[]>([]);
  const [followUps, setFollowUps] = useState<LeadFollowUp[]>([]);

  useEffect(() => {
    return deferEffectUpdate(() => {
      setLeads(loadLeadList(sampleLeads, companyId));
      setFollowUps(loadLeadFollowUpList([], companyId));
    });
  }, [companyId]);

  const overdueLeads = useMemo(() => {
    if (currentUser?.role !== "ADVISOR") return [];
    const now = new Date();

    return leads
      .filter((lead) => lead.agentId === currentUser.id)
      .map((lead) => ({
        lead,
        state: getLeadFollowUpState(
          followUps,
          lead.id,
          lead.followUpUpdatedAt,
          now,
          lead.companyId,
        ),
      }))
      .filter((item) => item.state.kind === "overdue")
      .sort((a, b) => (b.state.elapsedDays ?? 0) - (a.state.elapsedDays ?? 0));
  }, [currentUser, followUps, leads]);

  if (currentUser?.role !== "ADVISOR" || overdueLeads.length === 0) return null;

  return (
    <section className="rounded-3xl border border-rose-200 bg-rose-50 p-5 shadow-sm sm:p-7" aria-labelledby="advisor-overdue-title">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="flex items-start gap-4">
          <span className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-rose-600 text-white">
            <AlertTriangle className="size-6" aria-hidden="true" />
          </span>
          <div>
            <p className="text-sm font-bold uppercase tracking-[0.12em] text-rose-700">Prioridad comercial</p>
            <h2 id="advisor-overdue-title" className="mt-1 text-2xl font-bold text-rose-950">{overdueLeads.length} {overdueLeads.length === 1 ? "seguimiento vencido" : "seguimientos vencidos"}</h2>
            <p className="mt-2 text-base leading-7 text-rose-800">Estos leads superaron los 10 días desde el último contacto real.</p>
          </div>
        </div>
        <Link href="/admin/leads" className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-rose-600 px-5 text-base font-bold text-white hover:bg-rose-700">
          Ver seguimientos <ArrowRight className="size-5" aria-hidden="true" />
        </Link>
      </div>

      <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {overdueLeads.slice(0, 6).map(({ lead, state }) => (
          <Link key={lead.id} href={`/admin/leads/${lead.id}`} className="rounded-2xl border border-rose-200 bg-white p-4 transition-colors hover:border-rose-400 hover:bg-rose-50">
            <p className="text-lg font-bold text-slate-950">{lead.name}</p>
            <p className="mt-2 flex items-center gap-2 text-base font-semibold text-rose-700"><Clock3 className="size-4" aria-hidden="true" /> {state.detail}</p>
            <p className="mt-1 text-sm text-slate-600">Último contacto: {state.formattedDate}</p>
          </Link>
        ))}
      </div>
    </section>
  );
}
