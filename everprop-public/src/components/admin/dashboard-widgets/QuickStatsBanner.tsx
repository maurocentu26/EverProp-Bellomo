"use client";

import { useEffect, useRef, useState } from "react";
import { motion, useMotionValue, useTransform, animate } from "framer-motion";
import { leads as sampleLeads, properties as sampleProperties } from "@/data/admin-sample";
import { loadLeadList, loadPropertyList } from "@/lib/admin-storage";
import { useCurrentSession } from "@/hooks/use-current-session";
import { useDashboardMode } from "@/lib/dashboard-context";
import { TrendingUp, Users, Building2, DollarSign, ArrowUpRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { deferEffectUpdate } from "@/lib/deferred-effect";

function AnimatedNumber({ target, prefix = "", suffix = "" }: { target: number; prefix?: string; suffix?: string }) {
  const count = useMotionValue(0);
  const rounded = useTransform(count, (v) => `${prefix}${Math.round(v).toLocaleString("es-AR")}${suffix}`);
  const ref = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const controls = animate(count, target, { duration: 1.2, ease: "easeOut" });
    return controls.stop;
  }, [target, count]);

  return <motion.span ref={ref}>{rounded}</motion.span>;
}

type Stat = {
  label: string;
  value: number;
  prefix?: string;
  suffix?: string;
  delta: string;
  deltaPositive: boolean;
  icon: React.ReactNode;
  gradient: string;
  iconBg: string;
};

export default function QuickStatsBanner() {
  const { isAdvisor, user } = useCurrentSession();
  const { globalSelectedAgentId } = useDashboardMode();
  const [stats, setStats] = useState<Stat[]>([]);

  useEffect(() => {
    return deferEffectUpdate(() => {
      let leads = loadLeadList(sampleLeads, "c1");
    const properties = loadPropertyList(sampleProperties, "c1");

    const effectiveAgentId = isAdvisor ? user?.id : globalSelectedAgentId;
    if (effectiveAgentId && effectiveAgentId !== "all") {
      leads = leads.filter((l) => l.agentId === effectiveAgentId);
    }

    const closingLeads = leads.filter((l) => l.stage === "closing").length;
    const totalVisits = leads.reduce((acc, l) => acc + (l.visits?.length ?? 0), 0);
    const convRate = leads.length > 0 ? Math.round((closingLeads / leads.length) * 100) : 0;
    const pipelineValue = isAdvisor ? 120 : 412;

      setStats([
      {
        label: isAdvisor ? "Mis Leads" : "Leads Activos",
        value: leads.length,
        delta: "+4 este mes",
        deltaPositive: true,
        icon: <Users className="h-5 w-5" />,
        gradient: "from-blue-500 to-blue-600",
        iconBg: "bg-blue-600",
      },
      {
        label: "Visitas Realizadas",
        value: totalVisits,
        delta: "+2 esta semana",
        deltaPositive: true,
        icon: <Building2 className="h-5 w-5" />,
        gradient: "from-indigo-500 to-indigo-600",
        iconBg: "bg-indigo-600",
      },
      {
        label: "Tasa de Conversión",
        value: convRate,
        suffix: "%",
        delta: "+3% vs mes ant.",
        deltaPositive: true,
        icon: <TrendingUp className="h-5 w-5" />,
        gradient: "from-emerald-500 to-emerald-600",
        iconBg: "bg-emerald-600",
      },
      {
        label: isAdvisor ? "Mis Ingresos" : "Pipeline (USD)",
        value: pipelineValue,
        prefix: "$",
        suffix: "K",
        delta: "+18% vs mes ant.",
        deltaPositive: true,
        icon: <DollarSign className="h-5 w-5" />,
        gradient: "from-amber-500 to-amber-600",
        iconBg: "bg-amber-500",
      },
      ]);
    });
  }, [isAdvisor, user, globalSelectedAgentId]);

  if (stats.length === 0) return null;

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
      {stats.map((stat, i) => (
        <motion.div
          key={stat.label}
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: i * 0.08 }}
          className="relative rounded-[2rem] bg-white border border-slate-200 shadow-sm p-5 overflow-hidden group hover:shadow-md transition-shadow"
        >
          {/* Subtle gradient accent top edge */}
          <div className={cn("absolute top-0 left-0 right-0 h-0.5 bg-gradient-to-r", stat.gradient)} />

          <div className="flex items-start justify-between mb-4">
            <span className={cn("p-2 rounded-xl text-white shadow-sm", stat.iconBg)}>
              {stat.icon}
            </span>
            <span className={cn(
              "flex items-center gap-0.5 text-[10px] font-bold px-2 py-0.5 rounded-full",
              stat.deltaPositive ? "text-emerald-700 bg-emerald-50" : "text-red-600 bg-red-50"
            )}>
              <ArrowUpRight className="h-2.5 w-2.5" />
              {stat.delta}
            </span>
          </div>

          <p className="text-3xl font-black text-slate-900 tracking-tight leading-none">
            <AnimatedNumber target={stat.value} prefix={stat.prefix} suffix={stat.suffix} />
          </p>
          <p className="text-xs font-semibold text-slate-500 mt-1.5 leading-tight">{stat.label}</p>
        </motion.div>
      ))}
    </div>
  );
}
