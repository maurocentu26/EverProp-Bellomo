"use client";
import { hasRecordedContact } from "@/lib/commercial-queue";
import { isCommercialContact } from "@/lib/lead-follow-up";

import { useState, useMemo, useEffect } from "react";
import LeadTable, { STAGE_LABELS } from "@/components/admin/LeadTable";
import { Button } from "@/components/ui/button";
import { Plus, Filter, Search, RotateCcw, AlertTriangle } from "lucide-react";
import Link from "next/link";
import {
  type Lead,
  type Property,
  type LeadFollowUp,
  leads as sampleLeads,
  properties as sampleProperties
} from "@/data/admin-sample";
import {
  loadLeadFollowUpList,
  loadLeadList,
  appendLeadFollowUpToStorage,
  saveLeadList
} from "@/lib/admin-storage";
import { getLeadFollowUpState } from "@/lib/lead-follow-up";
import { deferEffectUpdate } from "@/lib/deferred-effect";
import { InputGroup, InputGroupInput, InputGroupAddon } from "@/components/ui/input-group";
import { isMockDataMode } from "@/lib/data-mode";
import { loadEverpropCatalog, loadEverpropLeads, updateEverpropLead, createEverpropLeadFollowUp, loadEverpropAllFollowUps } from "@/lib/everprop-api";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { useDashboardMode } from "@/lib/dashboard-context";
import { useCurrentSession } from "@/hooks/use-current-session";
import { LeadFollowUpEditor } from "@/components/admin/LeadFollowUpEditor";
import { LeadStageUpdateModal } from "@/components/admin/LeadStageUpdateModal";

type LeadStageFilter = "all" | "new" | "contacted" | "visiting" | "negotiation" | "closing" | "discarded";
type AssetTypeFilter = "all" | "lote" | "departamento" | "comercial" | "tradicional";
type FollowUpFilter = "all" | "dueSoon" | "overdue";

const LEAD_STAGE_FILTERS: { id: LeadStageFilter; label: string }[] = [
  { id: "all", label: "Todos" },
  { id: "new", label: "Nuevos" },
  { id: "contacted", label: "Contactados" },
  { id: "visiting", label: "Visitas" },
  { id: "negotiation", label: "Negociación" },
  { id: "closing", label: "Cerrados" },
  { id: "discarded", label: "Descartados" },
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
  const [catalogProperties, setCatalogProperties] = useState<Property[]>(isMockDataMode ? sampleProperties : []);
  const [originFilter, setOriginFilter] = useState("all");
  const [advisorFilter, setAdvisorFilter] = useState("all");
  const [followUps, setFollowUps] = useState<LeadFollowUp[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [activeStage, setActiveStage] = useState<LeadStageFilter>("all");
  const [assetType, setAssetType] = useState<AssetTypeFilter>("all");
  const [followUpFilter, setFollowUpFilter] = useState<FollowUpFilter>("all");
  const [loadError, setLoadError] = useState("");
  const [isLoaded, setIsLoaded] = useState(false);
  const [followUpLead, setFollowUpLead] = useState<Lead | null>(null);
  const [stageUpdateLead, setStageUpdateLead] = useState<Lead | null>(null);

  useEffect(() => {
    let active = true;
    async function fetchLeads() {
      if (!isMockDataMode) {
        try {
          const [apiLeads, apiFollowUps, catalog] = await Promise.all([
            loadEverpropLeads(),
            loadEverpropAllFollowUps(),
            loadEverpropCatalog(),
          ]);
          if (!active) return;
          setAllLeads(apiLeads);
          setCatalogProperties(catalog.properties);
          setLoadError("");
          setFollowUps(apiFollowUps);
          setIsLoaded(true);
          return;
        } catch (e) {
          console.error("Error loading leads from API:", e);
          if (active) { setLoadError("No se pudieron cargar los leads. Volvé a cargar la página para reintentar."); setIsLoaded(true); }
          return;
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

  // Reset filters when switching workspace modes
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

  const hasActiveFilters = originFilter !== "all" || advisorFilter !== "all" || searchQuery !== "" || activeStage !== "all" || assetType !== "all" || followUpFilter !== "all";

  const handleClearFilters = () => {
    setOriginFilter("all");
    setAdvisorFilter("all");
    setSearchQuery("");
    setActiveStage("all");
    setAssetType("all");
    setFollowUpFilter("all");
  };

  // Conteo dinámico para los tabs de etapas
  const stageCounts = useMemo(() => {
    const base = isAdvisor && isMockDataMode
      ? allLeads.filter((l) => l.agentId === user?.id)
      : allLeads;

    return {
      all: base.length,
      new: base.filter((l) => l.stage === "new").length,
      contacted: base.filter((l) => l.stage === "contacted").length,
      visiting: base.filter((l) => l.stage === "visiting").length,
      negotiation: base.filter((l) => l.stage === "negotiation").length,
      discarded: base.filter((l) => l.stage === "discarded").length,
      closing: base.filter((l) => l.stage === "closing").length,
    };
  }, [allLeads, isAdvisor, user]);

  const filteredLeads = useMemo(() => {
    let filtered = allLeads;
    const query = searchQuery.toLowerCase().trim();

    // 1. Search Query
    if (query) {
      filtered = filtered.filter(l => {
        const matchesName = l.name.toLowerCase().includes(query);
        const matchesEmail = l.email?.toLowerCase().includes(query);
        const matchesPhone = l.phone?.includes(query);
        const linkedProps = l.propertyIds.map(pid => catalogProperties.find(p => p.id === pid)?.title.toLowerCase() || "");
        const matchesProp = linkedProps.some(title => title.includes(query));

        return matchesName || matchesEmail || matchesPhone || matchesProp;
      });
    }

    if (originFilter !== "all") filtered = filtered.filter((lead) => lead.origin === originFilter);
    if (advisorFilter !== "all") filtered = filtered.filter((lead) => (lead.agentId || "unassigned") === advisorFilter);

    // 2. Stage Filter
    if (activeStage !== "all") {
      filtered = filtered.filter(l => l.stage === activeStage);
    }

    // 3. Asset Type Filter
    if (assetType !== "all") {
      filtered = filtered.filter(l => {
        const leadProps = l.propertyIds.map(pid => catalogProperties.find(p => p.id === pid));
        if (assetType === "lote") return leadProps.some(p => p?.propertyType === "Lote");
        if (assetType === "departamento") return leadProps.some(p => p?.propertyType === "Departamento");
        if (assetType === "comercial") return leadProps.some(p => p?.propertyType === "Local" || p?.propertyType === "Cochera");
        if (assetType === "tradicional") return leadProps.some(p => p?.propertyType === "Casa" || (p?.propertyType === "Departamento" && !p.projectId));
        return false;
      });
    }

    // 4. Follow-up deadline filter
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

    // 5. Auth Filter (API mode enforces this at query level; mock mode filters client-side)
    if (isAdvisor && isMockDataMode) {
      filtered = filtered.filter(l => l.agentId === user?.id);
    }
    if (isAdvisor) {
      const now = new Date();
      const priority = { overdue: 0, dueSoon: 1, none: 2, current: 3 } as const;
      filtered = [...filtered].sort((a, b) => {
        const stateA = getLeadFollowUpState(followUps, a.id, a.followUpUpdatedAt, now, a.companyId);
        const stateB = getLeadFollowUpState(followUps, b.id, b.followUpUpdatedAt, now, b.companyId);
        return priority[stateA.kind] - priority[stateB.kind];
      });
    }

    return filtered;
  }, [allLeads, catalogProperties, originFilter, advisorFilter, searchQuery, activeStage, assetType, followUpFilter, followUps, isAdvisor, user]);

  // Actualización de estado en 1 clic
  async function handleStageChange(leadId: string, newStage: Lead["stage"]) {
    const prevLeads = [...allLeads];
    const targetLead = allLeads.find((l) => l.id === leadId);
    if (!targetLead) return;

    // Validación comercial: No se puede cambiar de etapa sin haber realizado al menos un seguimiento previo
    const hasFollowUp = hasRecordedContact(followUps, targetLead);
    if (!hasFollowUp && ["contacted", "visiting", "negotiation"].includes(newStage)) {
      toast.error("Es obligatorio registrar un seguimiento comercial antes de cambiar la etapa del lead.");
      setFollowUpLead(targetLead);
      return;
    }

    const stageMap: Record<Lead["stage"], string> = {
      new: "NEW",
      contacted: "CONTACTED",
      visiting: "VISIT_SCHEDULED",
      negotiation: "NEGOTIATION",
      closing: "WON",
      discarded: "LOST",
    };

    const stageLabel = STAGE_LABELS[newStage]?.label || newStage;

    if (!isMockDataMode) {
      try {
        await updateEverpropLead(leadId, { stage: stageMap[newStage] || "NEW" });
        const updated = allLeads.map((l) => (l.id === leadId ? { ...l, stage: newStage } : l));
        setAllLeads(updated);
        saveLeadList(updated, "c1");
        toast.success(`Etapa cambiada a "${stageLabel}"`);
      } catch (err) {
        console.error("Error updating lead stage in backend:", err);
        toast.error("No se pudo actualizar la etapa en el servidor.");
        throw err;
      }
    } else {
      const updated = allLeads.map((l) => (l.id === leadId ? { ...l, stage: newStage } : l));
      setAllLeads(updated);
      saveLeadList(updated, "c1");
      toast.success(`Etapa cambiada a "${stageLabel}"`);
    }
  }

  // Guardar seguimiento
  async function handleConfirmFollowUp(followUp: LeadFollowUp) {
    if (!followUpLead) return;

    // Confirm persistence before mutating the UI. Errors stay in the editor for retry.
    const recorded = isMockDataMode ? followUp : await createEverpropLeadFollowUp(followUpLead.id, {
      type: followUp.type, occurredAt: followUp.occurredAt, summary: followUp.summary,
      result: followUp.result, nextAction: followUp.nextAction,
      nextContactAt: followUp.nextContactAt, agentId: followUp.agentId,
    });
    setFollowUps(isMockDataMode
      ? appendLeadFollowUpToStorage(recorded, followUps, followUpLead.companyId)
      : [recorded, ...followUps]);
    setAllLeads((prev) => prev.map((item) => item.id === followUpLead.id ? {
      ...item,
      followUpUpdatedAt: isCommercialContact(recorded) && (!item.followUpUpdatedAt || recorded.occurredAt > item.followUpUpdatedAt)
        ? recorded.occurredAt : item.followUpUpdatedAt,
      lastActivity: recorded.occurredAt,
    } : item));

    toast.success("Seguimiento registrado con éxito.");
    const recordedLead = followUpLead;
    setFollowUpLead(null);
    if (isCommercialContact(recorded)) setStageUpdateLead(recordedLead);
  }

  async function handleConfirmStageUpdate(newStage: Exclude<Lead["stage"], "new">) {
    if (!stageUpdateLead) return;
    await handleStageChange(stageUpdateLead.id, newStage);
    setStageUpdateLead(null);
  }

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
          <h1 className="text-3xl font-bold text-slate-900 tracking-tight">Leads Comerciales</h1>
          <p className="mt-1 max-w-xl text-base leading-6 text-slate-500">
            Gestioná tus clientes y próximos contactos.
          </p>
        </div>

        <div className="flex w-full flex-col gap-3 sm:flex-row sm:items-center xl:w-auto">
          <InputGroup className="w-full rounded-xl border-slate-200 bg-white shadow-sm sm:min-w-72 xl:w-72">
            <InputGroupAddon><Search className="h-4 w-4 text-slate-400" /></InputGroupAddon>
            <InputGroupInput
              aria-label="Buscar leads por nombre, teléfono o lote"
              placeholder="Buscar cliente…"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="border-none focus-visible:ring-0 text-sm"
            />
          </InputGroup>

          {!isEngineer && (
            <div className="flex w-full gap-2 sm:w-auto">
              <Button nativeButton={false} role="link" render={<Link href="/admin/leads/new" />} className="min-h-11 flex-1 sm:flex-none w-full gap-2 bg-blue-600 text-white hover:bg-blue-700 font-bold shadow-sm">
                  <Plus className="h-4 w-4" />
                  Nuevo Lead
                </Button>
            </div>
          )}
        </div>
      </div>

      {/* Compact Filter Bar */}
      <div className="lead-filters grid grid-cols-1 min-[380px]:grid-cols-2 sm:flex sm:flex-wrap sm:items-end gap-3">
        <label className="min-[380px]:col-span-2 flex min-w-0 flex-col gap-1.5 text-xs font-semibold text-muted-foreground sm:hidden">
          Etapa comercial
          <select aria-label="Filtrar por etapa comercial" value={activeStage}
            onChange={event => setActiveStage(event.target.value as typeof activeStage)}
            className="min-h-11 w-full rounded-xl border border-border bg-card px-3 text-sm text-card-foreground">
            {LEAD_STAGE_FILTERS.map(tab => <option key={tab.id} value={tab.id}>{tab.label} ({stageCounts[tab.id]})</option>)}
          </select>
        </label>
        {/* Stage chip-tabs: compact pills */}
        <div role="group" aria-label="Filtrar por etapa comercial" className="hidden sm:flex max-w-full flex-wrap items-center gap-1 rounded-xl bg-slate-100 dark:bg-slate-900 p-1">
          {LEAD_STAGE_FILTERS.map(tab => {
            const count = stageCounts[tab.id];
            const isActive = activeStage === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveStage(tab.id)}
                aria-pressed={isActive}
                className={cn(
                  "min-h-10 rounded-lg px-3 py-2 text-xs font-semibold transition-colors flex items-center gap-2 whitespace-nowrap",
                  isActive
                    ? "bg-white text-blue-700 shadow-sm dark:bg-slate-800 dark:text-blue-300"
                    : "text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
                )}
              >
                <span>{tab.label}</span>
                <span className={cn(
                  "rounded-full px-1.5 py-0.5 text-[9px] font-extrabold leading-none",
                  isActive ? "bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300" : "bg-slate-200 text-slate-500 dark:bg-slate-800 dark:text-slate-400"
                )}>
                  {count}
                </span>
              </button>
            );
          })}
        </div>

        {/* Divider */}
        <div className="hidden sm:block w-px h-6 bg-slate-200 dark:bg-slate-800" />

        {/* Asset type chip */}
        <label className="flex min-w-0 flex-col gap-1.5 text-xs font-semibold text-muted-foreground">Tipo de interés
<select
          aria-label="Filtrar por tipo de interés"
          className="min-h-11 w-full min-w-0 rounded-xl border border-slate-200 bg-white px-2.5 text-xs font-semibold text-slate-700 shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-slate-900 dark:border-slate-800 dark:text-slate-300 cursor-pointer"
          value={assetType}
          onChange={(e) => setAssetType(e.target.value as AssetTypeFilter)}
        >
          <option value="all">Todos</option>
          <option value="lote">Loteos</option>
          <option value="departamento">Edificios</option>
          <option value="comercial">Comercial</option>
          <option value="tradicional">Tradicional</option>
        </select>
</label>

        {/* Follow-up urgency chip */}
        <label className="flex min-w-0 flex-col gap-1.5 text-xs font-semibold text-muted-foreground">Seguimiento
<select
          aria-label="Filtrar por urgencia de seguimiento"
          className="min-h-11 w-full min-w-0 rounded-xl border border-slate-200 bg-white px-2.5 text-xs font-semibold text-slate-700 shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-slate-900 dark:border-slate-800 dark:text-slate-300 cursor-pointer"
          value={followUpFilter}
          onChange={(e) => setFollowUpFilter(e.target.value as FollowUpFilter)}
        >
          <option value="all">Todos</option>
          <option value="dueSoon">Próximos a vencer</option>
          <option value="overdue">Vencidos</option>
        </select>
</label>

        <label className="flex min-w-0 flex-col gap-1.5 text-xs font-semibold text-muted-foreground">Origen
<select aria-label="Filtrar por origen" value={originFilter} onChange={(event) => setOriginFilter(event.target.value)} className="min-h-11 w-full min-w-0 max-w-full rounded-lg border border-border bg-card px-3 text-xs text-card-foreground">
          <option value="all">Todos</option>
          {[...new Set(allLeads.map((lead) => lead.origin))].sort().map((origin) => <option key={origin} value={origin}>{origin}</option>)}
        </select>
</label>
        {!isAdvisor && <label className="flex min-w-0 flex-col gap-1.5 text-xs font-semibold text-muted-foreground">Asesor
<select aria-label="Filtrar por asesor" value={advisorFilter} onChange={(event) => setAdvisorFilter(event.target.value)} className="min-h-11 w-full min-w-0 max-w-full rounded-lg border border-border bg-card px-3 text-xs text-card-foreground">
          <option value="all">Todos</option>
          <option value="unassigned">Sin asignar</option>
          {[...new Map(allLeads.filter((lead) => lead.agentId).map((lead) => [lead.agentId!, lead.agentName || "Asesor asignado"])).entries()].map(([id, name]) => <option key={id} value={id}>{name}</option>)}
        </select>
</label>}
        {/* Clear filters */}
        {hasActiveFilters && (
          <Button
            variant="ghost"
            size="sm"
            onClick={handleClearFilters}
            className="h-8 gap-1.5 text-xs font-semibold text-rose-600 hover:bg-rose-50 hover:text-rose-700 dark:text-rose-400 dark:hover:bg-rose-950/30"
          >
            <RotateCcw className="size-3.5" /> Limpiar
          </Button>
        )}
      </div>

      {/* Tabla Pro de Leads */}
      <div className="min-h-[500px]">
        {loadError ? <p role="alert" className="rounded-xl border border-amber-500/40 p-4 text-sm">{loadError}</p> : filteredLeads.length > 0 ? (
          <LeadTable
            properties={catalogProperties}
            leads={filteredLeads}
            followUps={followUps}
            onStageChange={handleStageChange}
            onFollowUp={(lead) => setFollowUpLead(lead)}
          />
        ) : (
          <div className="h-64 flex flex-col items-center justify-center border-2 border-dashed border-slate-200 rounded-3xl bg-slate-50">
            <Filter className="h-8 w-8 text-slate-300 mb-3" />
            <p className="text-slate-500 font-medium">No se encontraron leads con esos filtros.</p>
          </div>
        )}
      </div>

      {/* Modal de Registro de Seguimiento In-situ */}
      {followUpLead && (
        <LeadFollowUpEditor
          lead={followUpLead}
          onClose={() => setFollowUpLead(null)}
          onConfirm={handleConfirmFollowUp}
        />
      )}

      {/* Modal de Actualización de Etapa Post-Seguimiento */}
      {stageUpdateLead && (
        <LeadStageUpdateModal
          open={Boolean(stageUpdateLead)}
          leadName={stageUpdateLead.name}
          currentStage={stageUpdateLead.stage}
          onClose={() => setStageUpdateLead(null)}
          onConfirm={handleConfirmStageUpdate}
        />
      )}
    </div>
  );
}
