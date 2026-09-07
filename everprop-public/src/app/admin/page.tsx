"use client";

import Link from "next/link";
import DashboardStats from "@/components/admin/DashboardStats";
import EnterpriseDashboard from "@/components/admin/EnterpriseDashboard";
import { properties } from "@/data/admin-sample";
import LeadKanban from "@/components/admin/LeadKanban";
import PropertyList from "@/components/admin/PropertyList";
import MonthlyAgendaSummary from "@/components/admin/MonthlyAgendaSummary";
import QuickStatsBanner from "@/components/admin/dashboard-widgets/QuickStatsBanner";
import PipelineFunnelWidget from "@/components/admin/dashboard-widgets/PipelineFunnelWidget";
import NextVisitCountdown from "@/components/admin/dashboard-widgets/NextVisitCountdown";
import { ArrowRight, Building2, HardHat, ShieldCheck } from "lucide-react";
import { cn } from "@/lib/utils";
import { useDashboardMode } from "@/lib/dashboard-context";
import { useCurrentSession } from "@/hooks/use-current-session";
import { motion, AnimatePresence } from "framer-motion";
import ApiIntegrationStatus from "@/components/admin/ApiIntegrationStatus";
import { isMockDataMode } from "@/lib/data-mode";
import { useState, useEffect } from "react";
import { AdvisorFollowUpPriority } from "@/components/admin/AdvisorFollowUpPriority";
import { loadEverpropCatalog } from "@/lib/everprop-api";
import AdvisorCockpit from "@/components/admin/advisor/AdvisorCockpit";

export default function AdminPage() {
  const { mode: dashboardMode, setMode: setDashboardMode } = useDashboardMode();
  const { isEngineer, isAdmin, isAdvisor } = useCurrentSession();
  const [liveProperties, setLiveProperties] = useState<typeof properties>(properties);

  useEffect(() => {
    let active = true;
    if (!isMockDataMode) {
      loadEverpropCatalog().then((cat) => {
        if (active && cat.properties.length > 0) {
          setLiveProperties(cat.properties);
        }
      }).catch(() => {});
    }
    return () => {
      active = false;
    };
  }, []);

  if (!isEngineer) {
    return <AdvisorCockpit />;
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.5 }}
      className="space-y-10"
    >
      {!isEngineer && <AdvisorFollowUpPriority />}

      {/* ── QUICK STATS BANNER ── */}
      {!isEngineer && (
        <section id="stats-banner">
          <QuickStatsBanner />
        </section>
      )}

      {/* ── DASHBOARD SECTION ── */}
      <section id="dashboard" className="scroll-mt-24">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-semibold text-slate-900">Dashboard</h1>
          </div>

          {/* Dashboard Toggle */}
          {isAdmin && (
            <div className="flex bg-slate-100 p-1 rounded-lg">
              <button
                onClick={() => setDashboardMode("agency")}
                className={cn(
                  "flex items-center gap-2 px-3 py-1.5 text-sm font-semibold rounded-md transition-all",
                  dashboardMode === "agency" ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-700"
                )}
              >
                <Building2 className="h-4 w-4" /> Comercializadora
              </button>
              <button
                onClick={() => setDashboardMode("enterprise")}
                className={cn(
                  "flex items-center gap-2 px-3 py-1.5 text-sm font-semibold rounded-md transition-all",
                  dashboardMode === "enterprise" ? "bg-white text-blue-700 shadow-sm" : "text-slate-500 hover:text-slate-700"
                )}
              >
                <HardHat className="h-4 w-4" /> Desarrolladora
              </button>
            </div>
          )}
        </div>

        <AnimatePresence mode="wait">
          <motion.div
            key={dashboardMode}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.2 }}
          >
            {/* Engineers always see EnterpriseDashboard; Advisors always see DashboardStats (commercial) */}
            {isEngineer || (dashboardMode === "enterprise" && isAdmin) ? (
              <EnterpriseDashboard />
            ) : (
              <DashboardStats />
            )}
          </motion.div>
        </AnimatePresence>
      </section>

      {!isEngineer && (
        <>
          {/* ── PIPELINE FUNNEL + NEXT VISIT (side by side) ── */}
          <section id="pipeline" className="scroll-mt-24">
            <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
              <div className="lg:col-span-3">
                <PipelineFunnelWidget />
              </div>
              <div className="lg:col-span-2">
                <NextVisitCountdown />
              </div>
            </div>
          </section>

          {/* ── LEADS KANBAN ── */}
          <section id="leads" className="scroll-mt-24">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold text-slate-900">Embudos de venta</h2>
                <p className="mt-1 text-sm text-slate-500">Arrastrar para cambiar de estado</p>
              </div>
              <Link href="/admin/leads">
                <button className="text-sm font-medium text-blue-700 hover:text-blue-800">Ver todos los leads</button>
              </Link>
            </div>

            <div className="mt-4">
              <LeadKanban dashboardMode={dashboardMode} />
            </div>
          </section>

          {/* ── PROPERTIES ── */}
          <section id="properties" className="scroll-mt-24">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold text-slate-900">Propiedades</h2>
                <p className="mt-1 text-sm text-slate-500">Inventario y filtros</p>
              </div>
              <Link href="/admin/properties">
                <button className="text-sm font-medium text-blue-700 hover:text-blue-800">Ver todas las propiedades</button>
              </Link>
            </div>

            <div className="mt-4">
              <PropertyList properties={liveProperties.slice(0, 5)} />
              <div className="mt-4 text-center">
                <Link href="/admin/properties">
                  <button className="px-6 py-2 text-sm font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors shadow-sm">
                    Gestionar Inventario Completo
                  </button>
                </Link>
              </div>
            </div>
          </section>

          {/* ── AGENDA ── */}
          <section id="agenda" className="scroll-mt-24">
            <MonthlyAgendaSummary />
          </section>
        </>
      )}
    </motion.div>
  );
}
