"use client";
import { hasRecordedContact } from "@/lib/commercial-queue";
import { isCommercialContact } from "@/lib/lead-follow-up";

import { useState, useMemo, useEffect } from "react";
import { RotatorLeadQueue } from "@/components/admin/RotatorLeadQueue";
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
import { getLeadFollowUpState, needsFollowUp, type LeadFollowUpState } from "@/lib/lead-follow-up";
import { deferEffectUpdate } from "@/lib/deferred-effect";
import { InputGroup, InputGroupInput, InputGroupAddon } from "@/components/ui/input-group";
import { isMockDataMode } from "@/lib/data-mode";
import { loadEverpropCatalog, loadEverpropLeads, loadEverpropLeadsPage, updateEverpropLead, createEverpropLeadFollowUp, loadEverpropAllFollowUps } from "@/lib/everprop-api";
import { toast } from "sonner";
import { useDashboardMode } from "@/lib/dashboard-context";
import { useCurrentSession } from "@/hooks/use-current-session";
import { LeadFollowUpEditor } from "@/components/admin/LeadFollowUpEditor";
import { LeadStageUpdateModal } from "@/components/admin/LeadStageUpdateModal";

type LeadStageFilter = "all" | "new" | "contacted" | "visiting" | "negotiation" | "closing" | "discarded";
type AssetTypeFilter = "all" | "lote" | "departamento" | "comercial" | "tradicional";
type FollowUpFilter = "all" | "attention" | "dueSoon" | "overdue";

const LEAD_STAGE_FILTERS: { id: LeadStageFilter; label: string }[] = [
  { id: "all", label: "Todos" },
  { id: "new", label: "Nuevos" },
  { id: "contacted", label: "Contactados" },
  { id: "visiting", label: "Visitas" },
  { id: "negotiation", label: "Negociación" },
  { id: "closing", label: "Cerrados" },
  { id: "discarded", label: "Descartados" },
];

// EVP-50: "attention" is what the follow-up alerts point at (/admin/leads?seguimiento=1).
function followUpMatches(state: LeadFollowUpState, filter: FollowUpFilter) {
  return filter === "attention" ? needsFollowUp(state) : state.kind === filter;
}

const FOLLOW_UP_FILTERS: { id: FollowUpFilter; label: string }[] = [
  { id: "all", label: "Todos" },
  { id: "attention", label: "Necesitan seguimiento" },
  { id: "dueSoon", label: "Próximos a vencer" },
  { id: "overdue", label: "Vencidos" },
];

export default function LeadsPage() {
  const { user } = useCurrentSession();
  return user?.role === "ROTATOR" ? <RotatorLeadQueue /> : <AllLeadsPage />;
}

function AllLeadsPage() {
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
  const [page, setPage] = useState(1);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
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

  // EVP-50: follow-up notifications link here with ?seguimiento=1.
  useEffect(() => deferEffectUpdate(() => {
    if (new URLSearchParams(window.location.search).has("seguimiento")) setFollowUpFilter("attention");
  }), []);

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
        followUpMatches(getLeadFollowUpState(followUps, lead.id, lead.followUpUpdatedAt, now, lead.companyId), followUpFilter)
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

  const handleLoadMore = async () => {
    if (isLoadingMore) return;
    setIsLoadingMore(true);
    try {
      const nextPage = page + 1;
      const newLeads = await loadEverpropLeadsPage(nextPage);
      if (newLeads.length === 0) return;
      setAllLeads(prev => [...prev, ...newLeads]);
      setPage(nextPage);
    } catch (e) {
      console.error(e);
    } finally {
      setIsLoadingMore(false);
    }
  };

  if (!isLoaded) return <div className="h-96 animate-pulse bg-slate-100 rounded-3xl" />;

  const nextLead = filteredLeads.find(lead => lead.stage !== "closing" && lead.stage !== "discarded" && needsFollowUp(getLeadFollowUpState(followUps, lead.id, lead.followUpUpdatedAt, new Date(), lead.companyId)));

  return (
    <div className="mi-day leads-workspace leads-list mx-auto max-w-[1500px] space-y-6 pb-10">
      {/* Header */}
      <div className="flex flex-col justify-between gap-5 xl:flex-row xl:items-center">
        <div className="min-w-0">
          <h1 className="text-3xl font-bold text-slate-900 tracking-tight">Mis Leads</h1>
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
                  Nuevo lead
                </Button>
            </div>
          )}
        </div>
      </div>

      {!loadError && <section className="leads-focus" aria-labelledby="leads-next-title">
        <div><h2 id="leads-next-title">Tu próximo paso</h2>
          <p>{nextLead ? `Revisá el seguimiento de ${nextLead.name} antes de volver a contactarlo.` : "No hay contactos pendientes con estos filtros."}</p>
          <p>{filteredLeads.length === stageCounts.all ? `${stageCounts.all} ${stageCounts.all === 1 ? "cliente" : "clientes"} en total` : `Ves ${filteredLeads.length} de ${stageCounts.all} clientes`}</p>
        </div>
        {nextLead && <Link className="leads-white-action" href={`/admin/leads/${nextLead.id}`}>Abrir ficha de {nextLead.name}</Link>}
      </section>}

      <div className="leads-filter-line" aria-label="Filtros de clientes">
        <div role="group" aria-label="Tipo de interés" className="leads-tabs">
          {([['all', 'Todos'], ['lote', 'Loteos'], ['departamento', 'Edificios'], ['tradicional', 'Tradicional'], ['comercial', 'Comercial']] as const).map(([id, label]) =>
            <button key={id} type="button" aria-pressed={assetType === id} onClick={() => setAssetType(id)}>{label}</button>)}
        </div>
        <label>Etapa<select aria-label="Filtrar por etapa comercial" value={activeStage} onChange={e => setActiveStage(e.target.value as LeadStageFilter)}>
          {LEAD_STAGE_FILTERS.map(tab => <option key={tab.id} value={tab.id}>{tab.label} ({stageCounts[tab.id]})</option>)}
        </select></label>
        <label>Origen<select aria-label="Filtrar por origen" value={originFilter} onChange={e => setOriginFilter(e.target.value)}>
          <option value="all">Todos</option>{[...new Set(allLeads.map(lead => lead.origin))].sort().map(origin => <option key={origin}>{origin}</option>)}
        </select></label>
        <label>Seguimiento<select aria-label="Filtrar por seguimiento" value={followUpFilter} onChange={e => setFollowUpFilter(e.target.value as FollowUpFilter)}>
          {FOLLOW_UP_FILTERS.map(filter => <option key={filter.id} value={filter.id}>{filter.label}</option>)}
        </select></label>
        {!isAdvisor && <label>Asesor<select aria-label="Filtrar por asesor" value={advisorFilter} onChange={e => setAdvisorFilter(e.target.value)}>
          <option value="all">Todos</option><option value="unassigned">Sin asignar</option>
          {[...new Map(allLeads.filter(lead => lead.agentId).map(lead => [lead.agentId!, lead.agentName || "Asesor asignado"])).entries()].map(([id, name]) => <option key={id} value={id}>{name}</option>)}
        </select></label>}
        {hasActiveFilters && <Button variant="outline" onClick={handleClearFilters}><RotateCcw aria-hidden="true" /> Limpiar filtros</Button>}
      </div>
      <div className="leads-stage-counts" aria-label="Clientes cargados por etapa">
        {LEAD_STAGE_FILTERS.filter(stage => stage.id !== "all").map(stage => <button type="button" key={stage.id} aria-pressed={activeStage === stage.id} onClick={() => setActiveStage(stage.id)}><span>{stage.label}</span><strong>{stageCounts[stage.id]}</strong></button>)}
      </div>

      {/* Tabla Pro de Leads */}
      <div className="min-h-[500px]">
        {loadError ? <p role="alert" className="rounded-xl border border-amber-500/40 p-4 text-sm">{loadError}</p> : filteredLeads.length > 0 ? (
            <>
              <LeadTable
                properties={catalogProperties}
                leads={filteredLeads}
                followUps={followUps}
                onStageChange={handleStageChange}
                onFollowUp={(lead) => setFollowUpLead(lead)}
              />
              {!isMockDataMode && <div className="pt-8 pb-4 flex justify-center">
                <Button 
                  variant="outline" 
                  onClick={handleLoadMore} 
                  disabled={isLoadingMore}
                  className="w-full max-w-sm rounded-xl font-semibold border-slate-300 text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
                >
                  {isLoadingMore ? "Cargando..." : "Cargar más leads"}
                </Button>
              </div>}
            </>
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
          className="mi-day leads-workspace"
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
