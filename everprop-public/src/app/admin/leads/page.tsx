"use client";

import { useState, useMemo, useEffect } from "react";
import LeadTable from "@/components/admin/LeadTable";
import { Button } from "@/components/ui/button";
import { Download, Plus, Filter, Search } from "lucide-react";
import Link from "next/link";
import { type Lead, type LeadFollowUp, leads as sampleLeads, properties as sampleProperties } from "@/data/admin-sample";
import { loadLeadFollowUpList, loadLeadList } from "@/lib/admin-storage";
import { getLeadFollowUpState } from "@/lib/lead-follow-up";
import { deferEffectUpdate } from "@/lib/deferred-effect";
import { InputGroup, InputGroupInput, InputGroupAddon } from "@/components/ui/input-group";
import { isMockDataMode } from "@/lib/data-mode";
import { loadEverpropLeads } from "@/lib/everprop-api";
import { cn } from "@/lib/utils";

import { useDashboardMode } from "@/lib/dashboard-context";
import { RotateCcw, AlertTriangle } from "lucide-react";
import { useCurrentSession } from "@/hooks/use-current-session";

type LeadStageFilter = "all" | "new" | "process" | "closed";
type AssetTypeFilter = "all" | "lote" | "departamento" | "comercial" | "tradicional";
type FollowUpFilter = "all" | "dueSoon" | "overdue";

const LEAD_STAGE_FILTERS: { id: LeadStageFilter; label: string }[] = [
  { id: "all", label: "Todos" },
  { id: "new", label: "Nuevos" },
  { id: "process", label: "En proceso" },
  { id: "closed", label: "Cerrados" },
];

const FOLLOW_UP_FILTERS: { id: FollowUpFilter; label: string }[] = [
  { id: "all", label: "Todos" },
  { id: "dueSoon", label: "Próximos a vencer" },
  { id: "overdue", label: "Vencidos" },
];

export default function AllLeadsPage() {
  const { mode: dashboardMode } = useDashboardMode();
  const { isEngineer, isAdvisor, user } = useCurrentSession();
  
  const [allLeads, setAllLeads] = useState<Lead[]>([]);
  const [followUps, setFollowUps] = useState<LeadFollowUp[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [activeStage, setActiveStage] = useState<LeadStageFilter>("all");
  const [assetType, setAssetType] = useState<AssetTypeFilter>("all");
  const [followUpFilter, setFollowUpFilter] = useState<FollowUpFilter>("all");
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    let active = true;
    async function fetchLeads() {
      if (!isMockDataMode) {
        try {
          const apiLeads = await loadEverpropLeads();
          if (!active) return;
          setAllLeads(apiLeads);
          setFollowUps(loadLeadFollowUpList([], "c1"));
          setIsLoaded(true);
          return;
        } catch (e) {
          console.error("Error loading leads from API, falling back:", e);
        }
      }
      if (!active) return;
      setAllLeads(loadLeadList(sampleLeads, "c1"));
      setFollowUps(loadLeadFollowUpList([], "c1"));
      setIsLoaded(true);
    }
    void fetchLeads();
    return () => {
      active = false;
    };
  }, []);

  // Reset filters when switching workspace modes (Task 3 Bug Fix)
  useEffect(() => {
    return deferEffectUpdate(() => {
      if (dashboardMode === "agency") {
        setAssetType("all");
        setActiveStage("all");
        setFollowUpFilter("all");
        setSearchQuery("");
      }
    });
  }, [dashboardMode]);

  const hasActiveFilters = searchQuery !== "" || activeStage !== "all" || assetType !== "all" || followUpFilter !== "all";

  const handleClearFilters = () => {
    setSearchQuery("");
    setActiveStage("all");
    setAssetType("all");
    setFollowUpFilter("all");
  };

  const filteredLeads = useMemo(() => {
    let filtered = allLeads;
    const query = searchQuery.toLowerCase().trim();

    // 1. Search Query
    if (query) {
      filtered = filtered.filter(l => {
        const matchesName = l.name.toLowerCase().includes(query);
        const matchesEmail = l.email?.toLowerCase().includes(query);
        const matchesPhone = l.phone?.includes(query);
        const linkedProps = l.propertyIds.map(pid => sampleProperties.find(p => p.id === pid)?.title.toLowerCase() || "");
        const matchesProp = linkedProps.some(title => title.includes(query));
        
        return matchesName || matchesEmail || matchesPhone || matchesProp;
      });
    }

    // 2. Stage Filter
    if (activeStage !== "all") {
      filtered = filtered.filter(l => {
        if (activeStage === "new") return l.stage === "new";
        if (activeStage === "process") return ["contacted", "visiting", "negotiation"].includes(l.stage);
        if (activeStage === "closed") return l.stage === "closing";
        return true;
      });
    }

    // 3. Asset Type Filter
    if (assetType !== "all") {
      filtered = filtered.filter(l => {
        const leadProps = l.propertyIds.map(pid => sampleProperties.find(p => p.id === pid));
        if (assetType === "lote") return leadProps.some(p => p?.propertyType === "Lote");
        if (assetType === "departamento") return leadProps.some(p => p?.propertyType === "Departamento");
        if (assetType === "comercial") return leadProps.some(p => p?.propertyType === "Local" || p?.propertyType === "Cochera");
        if (assetType === "tradicional") return leadProps.some(p => p?.propertyType === "Casa" || (p?.propertyType === "Departamento" && !p.projectId));
        return false;
      });
    }

    // 4. Follow-up deadline filter. The state is always derived from persisted data.
    if (followUpFilter !== "all") {
      const now = new Date();
      filtered = filtered.filter((lead) => (
        getLeadFollowUpState(
          followUps,
          lead.id,
          lead.followUpUpdatedAt,
          now,
          lead.companyId,
        ).kind === followUpFilter
      ));
    }

    // 5. Auth Filter
    if (isAdvisor) {
      filtered = filtered.filter(l => l.agentId === user?.id);
      const now = new Date();
      const priority = { overdue: 0, dueSoon: 1, none: 2, current: 3 } as const;
      filtered = [...filtered].sort((a, b) => {
        const stateA = getLeadFollowUpState(followUps, a.id, a.followUpUpdatedAt, now, a.companyId);
        const stateB = getLeadFollowUpState(followUps, b.id, b.followUpUpdatedAt, now, b.companyId);
        return priority[stateA.kind] - priority[stateB.kind];
      });
    }

    return filtered;
  }, [allLeads, searchQuery, activeStage, assetType, followUpFilter, followUps, isAdvisor, user]);

  if (isEngineer) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh]">
        <AlertTriangle className="h-16 w-16 text-red-600 mb-4" />
        <h2 className="text-2xl font-black text-slate-900">Access Denied</h2>
        <p className="text-slate-500 mt-2">Los ingenieros no tienen acceso a la base de contactos comerciales.</p>
      </div>
    );
  }

  if (!isLoaded) return <div className="h-96 animate-pulse bg-slate-100 rounded-3xl" />;

  return (
    <div className="mx-auto max-w-[1400px] space-y-6 pb-10 sm:space-y-8">
      {/* Header */}
      <div className="flex flex-col justify-between gap-5 xl:flex-row xl:items-center">
        <div className="min-w-0">
          <h1 className="text-3xl font-bold text-slate-900 tracking-tight">Leads</h1>
          <p className="mt-1 max-w-xl text-base leading-6 text-slate-500">Gestioná y analizá todos los interesados de la comercializadora.</p>
        </div>
        
        <div className="flex w-full flex-col gap-3 sm:flex-row sm:items-center xl:w-auto">
          <InputGroup className="w-full rounded-xl border-slate-200 bg-white shadow-sm sm:min-w-72 xl:w-72">
            <InputGroupAddon><Search className="h-4 w-4 text-slate-400" /></InputGroupAddon>
            <InputGroupInput 
              placeholder="Buscar lead, teléfono o lote..." 
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="border-none focus-visible:ring-0 text-sm"
            />
          </InputGroup>
          
          <div className="flex w-full gap-2 sm:w-auto">
            <Link href="/admin/leads/new" className="flex-1 sm:flex-none">
              <Button className="min-h-11 w-full gap-2 bg-blue-600 text-white hover:bg-blue-700">
                  <Plus className="h-4 w-4" />
                  Nuevo Lead
              </Button>
            </Link>
          </div>
        </div>
      </div>

      <div className="flex flex-col justify-between gap-4 pb-2 xl:flex-row xl:items-center">
        {/* Status Tabs */}
        <div className="grid w-full grid-cols-2 gap-2 rounded-2xl bg-slate-100 p-1 sm:grid-cols-4 xl:w-auto">
          {LEAD_STAGE_FILTERS.map(tab => (
            <button 
              key={tab.id}
              type="button"
              onClick={() => setActiveStage(tab.id)}
              className={cn(
                "min-h-11 whitespace-nowrap rounded-xl px-4 py-2 text-sm font-semibold transition-all",
                activeStage === tab.id ? "bg-white text-blue-700 shadow-sm" : "text-slate-500 hover:text-slate-700"
              )}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Asset Type Filter & Clear Filters */}
        <div className="flex w-full flex-col items-stretch gap-3 sm:flex-row sm:items-center xl:w-auto">
          <div className="flex min-w-0 flex-1 items-center gap-2 xl:flex-none">
            <span className="text-xs font-bold text-slate-400 uppercase tracking-wider hidden md:inline-block">Interés en:</span>
            <select 
              aria-label="Filtrar por tipo de interés"
              className="min-h-11 min-w-0 flex-1 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 xl:min-w-64"
              value={assetType}
              onChange={(e) => setAssetType(e.target.value as AssetTypeFilter)}
            >
              <option value="all">Todos los activos</option>
              <option value="lote">Loteos</option>
              <option value="departamento">Edificios (Pozo)</option>
              <option value="comercial">Comercial (Locales/Cocheras)</option>
              <option value="tradicional">Inmobiliaria Tradicional</option>
            </select>
          </div>

          {hasActiveFilters && (
            <Button
              variant="ghost"
              size="sm"
              onClick={handleClearFilters}
              className="min-h-11 gap-1.5 text-sm font-semibold text-rose-600 hover:bg-rose-50 hover:text-rose-700"
            >
              <RotateCcw className="h-3.5 w-3.5" /> Limpiar filtros
            </Button>
          )}
        </div>
      </div>

      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5" aria-labelledby="follow-up-filter-title">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h2 id="follow-up-filter-title" className="text-base font-bold text-slate-900">Plazo de seguimiento</h2>
            <p className="mt-1 text-sm leading-6 text-slate-500">Priorizá los contactos que vencen dentro de dos días o ya superaron el límite de 10 días.</p>
          </div>
          <div className="grid w-full grid-cols-1 gap-2 sm:grid-cols-3 lg:w-auto">
            {FOLLOW_UP_FILTERS.map((filter) => (
              <button
                key={filter.id}
                type="button"
                onClick={() => setFollowUpFilter(filter.id)}
                className={cn(
                  "min-h-12 rounded-xl border px-5 py-2 text-base font-semibold transition-colors",
                  followUpFilter === filter.id
                    ? filter.id === "overdue"
                      ? "border-rose-600 bg-rose-600 text-white"
                      : filter.id === "dueSoon"
                        ? "border-amber-500 bg-amber-500 text-slate-950"
                        : "border-blue-600 bg-blue-600 text-white"
                    : "border-slate-200 bg-white text-slate-700 hover:border-blue-300 hover:bg-blue-50",
                )}
              >
                {filter.label}
              </button>
            ))}
          </div>
        </div>
      </section>

      {/* Table */}
      <div className="min-h-[500px]">
        {filteredLeads.length > 0 ? (
          <LeadTable leads={filteredLeads} followUps={followUps} />
        ) : (
          <div className="h-64 flex flex-col items-center justify-center border-2 border-dashed border-slate-200 rounded-3xl bg-slate-50">
            <Filter className="h-8 w-8 text-slate-300 mb-3" />
            <p className="text-slate-500 font-medium">No se encontraron leads con esos filtros.</p>
          </div>
        )}
      </div>
    </div>
  );
}
