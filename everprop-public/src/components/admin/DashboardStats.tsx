"use client";

import { useEffect, useState } from "react";
import MetricCard from "@/components/admin/MetricCard";
import { Building2, Users, TrendingUp, DollarSign } from "lucide-react";
import { leads as sampleLeads, properties as sampleProperties } from "@/data/admin-sample";
import { loadLeadList, loadPropertyList } from "@/lib/admin-storage";
import { useAuth } from "@/lib/auth-context";
import { useDashboardMode } from "@/lib/dashboard-context";
import { MOCK_USERS } from "@/data/auth-sample";
import { deferEffectUpdate } from "@/lib/deferred-effect";

type Props = {
  companyId?: string;
};

export default function DashboardStats({ companyId = "c1" }: Props) {
  const { currentUser } = useAuth();
  const { globalSelectedAgentId, setGlobalSelectedAgentId } = useDashboardMode();
  const [counts, setCounts] = useState({
    properties: 0,
    leads: 0,
    closingLeads: 0,
  });

  // Force sales agents to only see their own stats
  const effectiveAgentId = currentUser?.role === "ADVISOR" ? currentUser.id : globalSelectedAgentId;

  useEffect(() => {
    return deferEffectUpdate(() => {
      const currentProperties = loadPropertyList(sampleProperties, companyId);
      let currentLeads = loadLeadList(sampleLeads, companyId);

      if (effectiveAgentId !== "all") {
        currentLeads = currentLeads.filter(l => l.agentId === effectiveAgentId);
        // Optional: Filter properties if they are assigned to an agent, but for now properties aren't assigned.
      }

      setCounts({
        properties: currentProperties.length,
        leads: currentLeads.length,
        closingLeads: currentLeads.filter((lead) => lead.stage === "closing").length,
      });
    });
  }, [companyId, effectiveAgentId]);

  return (
    <div>
      {currentUser?.role === "ADMIN" && (
        <div className="flex items-center justify-end mb-4">
          <div className="flex items-center gap-2 bg-white px-3 py-1.5 rounded-xl border border-slate-200 shadow-sm">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-widest">Ver Resumen de:</span>
            <select
              value={globalSelectedAgentId}
              onChange={(e) => setGlobalSelectedAgentId(e.target.value)}
              className="text-sm font-semibold bg-transparent border-none text-slate-900 focus:outline-none cursor-pointer"
            >
              <option value="all">Toda la Empresa</option>
              {MOCK_USERS.filter(u => u.role === "ADVISOR").map(u => (
                <option key={u.id} value={u.id}>{u.name}</option>
              ))}
            </select>
          </div>
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <MetricCard
        title="Propiedades activas"
        value={counts.properties}
        delta="+12"
        Icon={Building2}
      />
        <MetricCard
          title={effectiveAgentId !== "all" ? "Mis Leads Activos" : "Consultas activas"}
          value={counts.leads}
          delta="+4"
          Icon={Users}
        />
        <MetricCard
          title={effectiveAgentId !== "all" ? "Mis Cierres" : "Cierres del mes"}
          value={counts.closingLeads}
          delta="-2"
          Icon={TrendingUp}
        />
        <MetricCard
          title={effectiveAgentId !== "all" ? "Mis Ingresos" : "Ingresos del mes"}
          value={effectiveAgentId !== "all" ? "$120K" : "$412K"}
          delta="+18%"
          Icon={DollarSign}
        />
      </div>
    </div>
  );
}
