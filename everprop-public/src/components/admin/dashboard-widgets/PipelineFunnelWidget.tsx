"use client";

import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { leads as sampleLeads } from "@/data/admin-sample";
import { loadLeadList } from "@/lib/admin-storage";
import { useCurrentSession } from "@/hooks/use-current-session";
import { useDashboardMode } from "@/lib/dashboard-context";
import { cn } from "@/lib/utils";
import { TrendingUp, ArrowRight } from "lucide-react";
import Link from "next/link";
import { deferEffectUpdate } from "@/lib/deferred-effect";

type Stage = {
  key: "new" | "contacted" | "visiting" | "negotiation" | "closing";
  label: string;
  color: string;
  bg: string;
  textColor: string;
};

const STAGES: Stage[] = [
  { key: "new",         label: "Nuevo",      color: "bg-slate-400",   bg: "bg-slate-50",   textColor: "text-slate-600" },
  { key: "contacted",   label: "Contactado", color: "bg-blue-400",    bg: "bg-blue-50",    textColor: "text-blue-700"  },
  { key: "visiting",    label: "Visita",     color: "bg-indigo-500",  bg: "bg-indigo-50",  textColor: "text-indigo-700" },
  { key: "negotiation", label: "Negocia",    color: "bg-amber-500",   bg: "bg-amber-50",   textColor: "text-amber-700" },
  { key: "closing",     label: "Cierre",     color: "bg-emerald-500", bg: "bg-emerald-50", textColor: "text-emerald-700" },
];

export default function PipelineFunnelWidget() {
  const { isAdvisor, user } = useCurrentSession();
  const { globalSelectedAgentId } = useDashboardMode();
  const [allLeads, setAllLeads] = useState<ReturnType<typeof loadLeadList>>([]);

  useEffect(() => {
    return deferEffectUpdate(() => {
      let leads = loadLeadList(sampleLeads, "c1");
      const effectiveAgentId = isAdvisor ? user?.id : globalSelectedAgentId;
      if (effectiveAgentId && effectiveAgentId !== "all") {
        leads = leads.filter((l) => l.agentId === effectiveAgentId);
      }
      setAllLeads(leads);
    });
  }, [isAdvisor, user, globalSelectedAgentId]);

  const stageCounts = useMemo(() => {
    return STAGES.map((s) => ({
      ...s,
      count: allLeads.filter((l) => l.stage === s.key).length,
    }));
  }, [allLeads]);

  const maxCount = useMemo(
    () => Math.max(1, ...stageCounts.map((s) => s.count)),
    [stageCounts]
  );

  const total = allLeads.length;
  const closingCount = stageCounts.find((s) => s.key === "closing")?.count ?? 0;
  const conversionRate = total > 0 ? Math.round((closingCount / total) * 100) : 0;

  return (
    <div className="rounded-[2.5rem] border border-slate-200 bg-white shadow-sm overflow-hidden">
      <div className="px-7 pt-7 pb-5 border-b border-slate-100 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="p-2.5 rounded-2xl bg-indigo-600 text-white shadow-sm shadow-indigo-200">
            <TrendingUp className="h-5 w-5" />
          </span>
          <div>
            <h3 className="text-lg font-bold text-slate-900 leading-tight">Embudo de Ventas</h3>
            <p className="text-xs text-slate-500 font-medium mt-0.5">{total} leads en pipeline</p>
          </div>
        </div>
        <div className="text-right">
          <p className="text-2xl font-black text-emerald-600">{conversionRate}%</p>
          <p className="text-[10px] text-slate-400 uppercase font-bold tracking-widest">Conversión</p>
        </div>
      </div>

      <div className="px-7 py-6 space-y-3">
        {stageCounts.map((stage, i) => {
          const widthPct = (stage.count / maxCount) * 100;
          return (
            <div key={stage.key} className="group">
              <div className="flex items-center justify-between mb-1">
                <div className="flex items-center gap-2">
                  <span className={cn("h-2 w-2 rounded-full", stage.color)} />
                  <span className={cn("text-xs font-bold", stage.textColor)}>{stage.label}</span>
                </div>
                <span className="text-xs font-black text-slate-700">{stage.count}</span>
              </div>
              <div className="h-3 w-full rounded-full bg-slate-100 overflow-hidden">
                <motion.div
                  className={cn("h-full rounded-full", stage.color)}
                  initial={{ width: 0 }}
                  animate={{ width: `${widthPct}%` }}
                  transition={{ duration: 0.6, delay: i * 0.08, ease: "easeOut" }}
                />
              </div>
            </div>
          );
        })}
      </div>

      <div className="px-7 pb-6 flex items-center justify-between">
        <div className="flex gap-4">
          {stageCounts.slice(3).map(s => (
            <div key={s.key} className={cn("px-3 py-2 rounded-xl", s.bg)}>
              <p className={cn("text-base font-black", s.textColor)}>{s.count}</p>
              <p className="text-[10px] text-slate-500 uppercase font-bold tracking-tighter">{s.label}</p>
            </div>
          ))}
        </div>
        <Link href="/admin/leads" className="inline-flex items-center gap-1 text-xs font-bold text-blue-600 hover:text-blue-700">
          Ver pipeline <ArrowRight className="h-3.5 w-3.5" />
        </Link>
      </div>
    </div>
  );
}
