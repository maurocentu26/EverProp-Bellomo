"use client";
import { FINAL_DELIVERY_ENABLED } from "@/lib/release-visibility";
import { useCollections } from "@/hooks/use-collections";

import { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import { ArrowRight, AlertCircle, Clock, UserPlus, CalendarDays, ClipboardCheck, HelpCircle, MessageCircle, Phone, Plus, Search } from "lucide-react";
import { toast } from "sonner";
import { 
  type Lead, 
  type LeadFollowUp, 
  type LeadInterest,
  type Property, 
  type Project,
  leads as sampleLeads, 
  properties as sampleProperties,
  projects as sampleProjects,
} from "@/data/admin-sample";
import { 
  loadLeadFollowUpList, 
  loadLeadList, 
  appendLeadFollowUpToStorage,
  saveLeadList,
} from "@/lib/admin-storage";
import { evaluateInstallmentStatus, getTodayDateString } from "@/lib/installment-notifications";
import { isNotificationForUser } from "@/lib/notifications";
import { commercialDay, commercialQueueGroups, hasRecordedContact } from "@/lib/commercial-queue";
import { isCommercialContact } from "@/lib/lead-follow-up";
import { isMockDataMode } from "@/lib/data-mode";
import { 
  loadEverpropLeads, 
  loadEverpropCatalog, 
  updateEverpropLead, 
  updateEverpropLeadProperty,
  createEverpropLeadFollowUp,
  loadEverpropAllFollowUps,
  loadEverpropTodayVisits,
  type TodayVisits,
} from "@/lib/everprop-api";
import { useCurrentSession } from "@/hooks/use-current-session";
import { useDashboardMode } from "@/lib/dashboard-context";
import { useLeadAdvisors } from "@/hooks/use-lead-advisors";
import { LeadConversationLink } from "@/components/admin/LeadConversationLink";
import { LeadFollowUpEditor } from "@/components/admin/LeadFollowUpEditor";
import { LeadStageUpdateModal } from "@/components/admin/LeadStageUpdateModal";
import { AdminMonthBalanceWidget } from "@/components/admin/advisor/AdminMonthBalanceWidget";
import { AdvisorDayGuide } from "@/components/admin/advisor/AdvisorDayGuide";
import { leadInitials } from "@/lib/advisor-day-guide";
import { Button } from "@/components/ui/button";
import { inventoryPriceLabel } from "@/lib/inventory-labels";
import { getLeadFollowUps, parseArgentinaDate } from "@/lib/lead-follow-up";
import { cn } from "@/lib/utils";

const STAGE_OPTIONS: { id: Lead["stage"]; label: string; apiCode: string; color: string }[] = [
  { id: "new", label: "Nuevo", apiCode: "NEW", color: "bg-slate-100 text-slate-800 border-slate-300 dark:bg-slate-800 dark:text-slate-200 dark:border-slate-700" },
  { id: "contacted", label: "Contactado", apiCode: "CONTACTED", color: "bg-blue-100 text-blue-900 border-blue-300 dark:bg-blue-950/80 dark:text-blue-200 dark:border-blue-800" },
  { id: "visiting", label: "Visita Agendada", apiCode: "VISIT_SCHEDULED", color: "bg-purple-100 text-purple-900 border-purple-300 dark:bg-purple-950/80 dark:text-purple-200 dark:border-purple-800" },
  { id: "negotiation", label: "Negociación", apiCode: "NEGOTIATION", color: "bg-amber-100 text-amber-900 border-amber-300 dark:bg-amber-950/80 dark:text-amber-200 dark:border-amber-800" },
  { id: "closing", label: "Cerrado / Ganado", apiCode: "WON", color: "bg-emerald-100 text-emerald-900 border-emerald-300 dark:bg-emerald-950/80 dark:text-emerald-200 dark:border-emerald-800" },
  { id: "discarded", label: "Descartado", apiCode: "LOST", color: "bg-slate-100 text-slate-700 border-slate-300 dark:bg-slate-800 dark:text-slate-200" },
];

function interestParts(property?: Property, interest?: LeadInterest, project?: Project) {
  const unit = (property?.unitNumber || interest?.unitNumber)?.trim();
  const sector = (property?.sectorName || interest?.sectorName)?.trim();
  const unitPrefix = property?.propertyType === "apartment" || interest?.category === "edificio" ? "Departamento" : "Lote";
  return [project?.name || interest?.projectName,
    sector && (/^manzana\b/i.test(sector) ? sector : `Manzana ${sector}`),
    unit ? (/^(lote|departamento)\b/i.test(unit) ? unit : `${unitPrefix} ${unit}`) : property?.title || interest?.propertyTitle,
  ].filter((part): part is string => Boolean(part));
}

function interestLabel(property?: Property, interest?: LeadInterest, project?: Project) {
  return interestParts(property, interest, project).join(" · ") || "Sin inmueble vinculado";
}

function InterestText({ parts }: { parts: string[] }) {
  return parts.length ? <span className="day-parts">{parts.map(part => <span key={part}>{part}</span>)}</span> : <span>Sin inmueble vinculado</span>;
}

export default function AdvisorCockpit() {
  const { user } = useCurrentSession();
  const { globalSelectedAgentId, setGlobalSelectedAgentId } = useDashboardMode();
  const { advisors } = useLeadAdvisors(user?.role === "ADMIN");
  const [leads, setLeads] = useState<Lead[]>([]);
  const [followUps, setFollowUps] = useState<LeadFollowUp[]>([]);
  const [properties, setProperties] = useState<Property[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [apiVisits, setApiVisits] = useState<TodayVisits | null>(null);
  const [visitsError, setVisitsError] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [clock, setClock] = useState(() => new Date());
  const [isLoaded, setIsLoaded] = useState(false);
  const [loadedUserId, setLoadedUserId] = useState<string>();
  const [searchQuery, setSearchQuery] = useState("");
  const [activeQueueFilter, setActiveQueueFilter] = useState<"all" | "overdue" | "today" | "new" | "visits">("all");
  const [selectedProperties, setSelectedProperties] = useState<Record<string, string>>({});
  const [followUpLead, setFollowUpLead] = useState<Lead | null>(null);
  const [stageUpdateLead, setStageUpdateLead] = useState<Lead | null>(null);
  const [showMonthBalance, setShowMonthBalance] = useState(false);
  const { installments, error: collectionsError } = useCollections();

  // Carga de datos inicial y sincronización en tiempo real
  useEffect(() => {
    let active = true;
    let loading = false;
    let refreshPending = false;

    async function loadData() {
      if (loading) { refreshPending = true; return; }
      loading = true;
      let loadedLeads: Lead[] = [];
      let loadedFollowUps: LeadFollowUp[] = [];
      let loadedProperties: Property[] = isMockDataMode ? sampleProperties : [];
      let loadedProjects: Project[] = isMockDataMode ? sampleProjects : [];


      if (!isMockDataMode) {
        try {
          const [apiLeads, catalog, apiFollowUps, visits] = await Promise.all([
            loadEverpropLeads(),
            loadEverpropCatalog(),
            loadEverpropAllFollowUps(),
            loadEverpropTodayVisits().catch(() => null),
          ]);
          if (active) {
            setApiVisits(visits);
            setVisitsError(visits === null);
            loadedLeads = apiLeads;
            loadedProperties = catalog.properties;
            loadedProjects = catalog.projects;
            loadedFollowUps = apiFollowUps;
          }
        } catch (err) {
          console.error("Error loading leads from API:", err);
          if (active) { setLoadError("No pudimos actualizar los datos. Reintentaremos automáticamente."); setIsLoaded(true); }
          loading = false;
          if (active && refreshPending) { refreshPending = false; void loadData(); }
          return;
        }
      } else {
        loadedLeads = loadLeadList(sampleLeads, "c1");
        loadedFollowUps = loadLeadFollowUpList([], "c1");
      }

      if (active) {
        setLoadError("");
        setClock(new Date());
        setLeads(loadedLeads);
        setFollowUps(loadedFollowUps);
        setProperties(loadedProperties);
        setProjects(loadedProjects);
        setLoadedUserId(user?.id);

        setIsLoaded(true);
      }
      loading = false;
      if (active && refreshPending) { refreshPending = false; void loadData(); }
    }

    void loadData();

    const handleLeadsUpdated = () => {
      void loadData();
    };

    const refreshVisible = () => { if (document.visibilityState === "visible") void loadData(); };
    const refreshTimer = window.setInterval(refreshVisible, 30000);
    window.addEventListener("focus", refreshVisible);
    document.addEventListener("visibilitychange", refreshVisible);
    window.addEventListener("everprop_leads_updated", handleLeadsUpdated);
    let channel: BroadcastChannel | null = null;
    try {
      channel = new BroadcastChannel("everprop_leads");
      channel.onmessage = handleLeadsUpdated;
    } catch {
      // ignore
    }

    return () => {
      active = false;
      window.clearInterval(refreshTimer);
      window.removeEventListener("focus", refreshVisible);
      document.removeEventListener("visibilitychange", refreshVisible);
      window.removeEventListener("everprop_leads_updated", handleLeadsUpdated);
      channel?.close();
    };
  }, [user?.id]);

  const todayStr = commercialDay(clock);
  const todayFormatted = clock.toLocaleDateString("es-AR", {
    weekday: "long", day: "numeric", month: "long", timeZone: "America/Argentina/Buenos_Aires",
  });

  const overdueInstallmentsCount = useMemo(() => {
    const today = getTodayDateString();
    return installments.filter((inst) => {
      if (isMockDataMode && user && !isNotificationForUser(inst.advisorId, user)) return false;
      const { status } = evaluateInstallmentStatus(inst, today);
      return status === "OVERDUE";
    }).length;
  }, [installments, user]);

  // Filtrar leads del asesor comercial (si es admin, ve todos los leads de la empresa)
  const myLeads = useMemo(() => {
    if (!user) return [];
    let filtered = leads;
    if (isMockDataMode && user.role !== "ADMIN") {
      filtered = filtered.filter((lead) => String(lead.agentId) === String(user.id));
    } else if (user.role === "ADMIN" && globalSelectedAgentId !== "all") {
      filtered = filtered.filter((lead) => String(lead.agentId) === globalSelectedAgentId);
    }
    return filtered;
  }, [leads, user, globalSelectedAgentId]);

  // Cards, tabs and visible rows share exactly the same classified snapshot.
  const queueGroups = useMemo(() => commercialQueueGroups(myLeads, followUps, clock), [myLeads, followUps, clock]);
  const waitingCount = queueGroups.all.filter(item => item.priorityWeight > 0).length;
  const queueFilterLabels = {
    all: "Todos", overdue: "Vencidos", today: "Para hoy", new: "Nuevos",
  } as const;
  const overdueLeads = queueGroups.overdue;
  const todayLeads = queueGroups.today;
  const newLeads = queueGroups.new;
  const localVisitsToday = useMemo(() => myLeads.flatMap(lead => (lead.visits ?? [])
    .filter(visit => commercialDay(visit.scheduledAt) === todayStr && visit.status === "scheduled")
    .map(visit => ({ lead, scheduledAt: visit.scheduledAt, notes: visit.notes }))), [myLeads, todayStr]);
  const [visibleLeadCount, setVisibleLeadCount] = useState(4);
  const selectQueueFilter = (filter: typeof activeQueueFilter) => {
    setActiveQueueFilter(filter);
    setSearchQuery("");
    setVisibleLeadCount(4);
  };

  const scheduledVisitsToday = useMemo(() => isMockDataMode ? localVisitsToday : apiVisits?.data ?? [], [localVisitsToday, apiVisits]);
  const visitsTotal = isMockDataMode ? localVisitsToday.length : apiVisits?.meta.total;

  // Cola prioritaria de acción
  const priorityQueue = useMemo(() => {
    let queue = activeQueueFilter === "visits" ? queueGroups.all.filter(item => scheduledVisitsToday.some(visit => visit.lead.id === item.lead.id)) : queueGroups[activeQueueFilter];

    // Filtro de búsqueda por texto
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      queue = queue.filter(({ lead }) => {
        const nameMatch = lead.name.toLowerCase().includes(q);
        const phoneMatch = lead.phone?.includes(q);
        const emailMatch = lead.email?.toLowerCase().includes(q);
        return nameMatch || phoneMatch || emailMatch;
      });
    }

    // Ordenar por urgencia descendente
    return [...queue].sort((a, b) => b.priorityWeight - a.priorityWeight);
  }, [queueGroups, activeQueueFilter, searchQuery, scheduledVisitsToday]);

  // Manejo de cambio de etapa en 1 clic (por activo o general)
  async function handleStageChange(leadId: string, newStage: Lead["stage"], propertyId?: string) {
    const targetLead = leads.find((l) => l.id === leadId);
    if (!targetLead) return;

    // Validación comercial: No se puede cambiar de etapa sin haber realizado al menos un seguimiento previo
    const hasFollowUp = hasRecordedContact(followUps, targetLead);
    if (!hasFollowUp && ["contacted", "visiting", "negotiation"].includes(newStage)) {
      toast.error("Es obligatorio registrar un seguimiento comercial antes de cambiar la etapa del lead.");
      setFollowUpLead(targetLead);
      return;
    }

    const targetPropId = propertyId || targetLead.propertyIds?.[0] || targetLead.interests?.[0]?.propertyId || targetLead.interests?.[0]?.unitId;
    const stageConfig = STAGE_OPTIONS.find((s) => s.id === newStage);


    try {
      // Sincronización API antes de confirmar el cambio
      if (!isMockDataMode) {
        const promises: Promise<unknown>[] = [
          updateEverpropLead(leadId, {
            stage: stageConfig?.apiCode || "NEW",
          }),
        ];

        if (targetPropId) {
          promises.push(
            updateEverpropLeadProperty(leadId, targetPropId, {
              status: stageConfig?.apiCode || "NEW",
            }).catch((err) => {
              console.warn("Could not update property interest status on backend:", err);
            })
          );
        }

        await Promise.all(promises);
      }

      // Actualización local una vez confirmado el patch
      const updated = leads.map((l) => {
        if (l.id !== leadId) return l;

        let updatedInterests = l.interests;
        if (targetPropId && l.interests && l.interests.length > 0) {
          updatedInterests = l.interests.map((interest) => {
            if (interest.propertyId === targetPropId || interest.unitId === targetPropId) {
              return { ...interest, status: newStage };
            }
            return interest;
          });
        }

        return {
          ...l,
          stage: newStage,
          interests: updatedInterests,
        };
      });

      setLeads(updated);
      if (isMockDataMode) saveLeadList(updated, "c1");

      try {
        window.dispatchEvent(new Event("everprop_leads_updated"));
        const ch = new BroadcastChannel("everprop_leads");
        ch.postMessage({ type: "LEADS_UPDATED" });
        ch.close();
      } catch {
        // ignore
      }

      toast.success(`Etapa cambiada a "${stageConfig?.label || newStage}"`);
    } catch (err) {
      console.error("Error al actualizar etapa en backend:", err);
      toast.error("No se pudo actualizar la etapa en el servidor.");
    }
  }

  // Guardar seguimiento
  async function handleConfirmFollowUp(followUp: LeadFollowUp, target = followUpLead) {
    if (!target) return;

    // Confirm persistence before mutating the UI. Errors stay in the editor for retry.
    const recorded = isMockDataMode ? followUp : await createEverpropLeadFollowUp(target.id, {
      type: followUp.type, occurredAt: followUp.occurredAt, summary: followUp.summary,
      result: followUp.result, nextAction: followUp.nextAction,
      nextContactAt: followUp.nextContactAt, agentId: followUp.agentId,
    });
    setFollowUps(isMockDataMode
      ? appendLeadFollowUpToStorage(recorded, followUps, target.companyId)
      : [recorded, ...followUps]);
    setLeads((prev) => prev.map((item) => item.id === target.id ? {
      ...item,
      followUpUpdatedAt: isCommercialContact(recorded) && (!item.followUpUpdatedAt || recorded.occurredAt > item.followUpUpdatedAt)
        ? recorded.occurredAt : item.followUpUpdatedAt,
      lastActivity: recorded.occurredAt,
    } : item));

    toast.success("Seguimiento registrado con éxito.");
    const recordedLead = target;
    setFollowUpLead(null);
    if (isCommercialContact(recorded)) setStageUpdateLead(recordedLead);
  }

  // Confirmación de nueva etapa post-seguimiento
  async function handleConfirmStageUpdate(newStage: Exclude<Lead["stage"], "new">) {
    if (!stageUpdateLead) return;
    const activePropId = stageUpdateLead.propertyIds?.[0] || stageUpdateLead.interests?.[0]?.propertyId;
    await handleStageChange(stageUpdateLead.id, newStage, activePropId);
    setStageUpdateLead(null);
  }

  if (!isLoaded) {
    return (
      <div className="space-y-6">
        <div className="h-28 animate-pulse rounded-2xl bg-slate-100" />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-28 animate-pulse rounded-2xl bg-slate-100" />
          ))}
        </div>
        <div className="h-96 animate-pulse rounded-2xl bg-slate-100" />
      </div>
    );
  }

  return (
    <div className="advisor-workspace mi-day day-board">
      <header className="day-heading">
        <div><p className="day-muted">{todayFormatted}</p><h1>Bienvenido, {user?.name || "Asesor"}</h1></div>
        <div className="day-heading-actions">
          {user?.role === "ADMIN" && <label>Asesor <select value={globalSelectedAgentId} onChange={e => setGlobalSelectedAgentId(e.target.value)}><option value="all">Todo el equipo</option>{advisors.map(advisor => <option key={advisor.id} value={advisor.id}>{advisor.name}</option>)}</select></label>}
          <Link className="mi-day-secondary" href="/admin/leads/new"><Plus aria-hidden />Nuevo lead</Link>
          <Link className="mi-day-secondary" href="/admin/agenda"><CalendarDays aria-hidden />Mi agenda</Link>
          <Link className="mi-day-secondary" href="/admin/conversaciones"><MessageCircle aria-hidden />Conversaciones</Link>
          <Button variant="outline" onClick={() => setShowMonthBalance(!showMonthBalance)}>Balance del mes</Button>
        </div>
      </header>
      {loadError && <p role="alert" className="day-alert">{loadError}</p>}
      {showMonthBalance && <AdminMonthBalanceWidget leads={myLeads} followUps={followUps} properties={properties} projects={projects} />}
      <section className="day-traffic" aria-label="Semáforo de urgencia">
        {([
          { filter: "overdue", count: overdueLeads.length, one: "Seguimiento vencido", many: "Seguimientos vencidos", color: "day-rose", Icon: AlertCircle },
          { filter: "today", count: todayLeads.length, one: "Lead por contactar hoy", many: "Leads por contactar hoy", color: "day-amber", Icon: Clock },
          { filter: "new", count: newLeads.length, one: "Lead nuevo sin contacto", many: "Leads nuevos sin contacto", color: "day-blue", Icon: UserPlus },
          { filter: "visits", count: visitsTotal, one: "Cita agendada para hoy", many: "Citas agendadas para hoy", color: "day-green", Icon: CalendarDays },
        ] as const).map(({ filter, count, one, many, color, Icon }) => <button key={filter} type="button" className={cn("day-traffic-card", color)} aria-pressed={activeQueueFilter === filter} onClick={() => selectQueueFilter(filter)}><Icon aria-hidden /><strong>{loadError ? "—" : count ?? "—"}</strong><span>{count === 1 ? one : many}</span></button>)}
      </section>
      <div className="day-grid">

        <section className="day-card day-next" aria-labelledby="day-next-title">
          <div className="day-section-head"><h2 id="day-next-title">A quién llamar</h2><p className="day-meta">Ordenados por urgencia</p></div>
          <div className="day-filters">
            <label className="day-search"><Search aria-hidden /><span className="sr-only">Buscar por nombre, teléfono o email</span><input value={searchQuery} onChange={e => { setSearchQuery(e.target.value); setVisibleLeadCount(4); }} placeholder="Buscar cliente…" /></label>
            <div role="group" aria-label="Filtrar por seguimiento" className="day-filter-options">{(["all", "overdue", "today", "new"] as const).map(filter => <button key={filter} type="button" aria-pressed={activeQueueFilter === filter} onClick={() => selectQueueFilter(filter)}>{queueFilterLabels[filter]} · {queueGroups[filter].length}</button>)}</div>
          </div>
          <div id="commercial-lead-results">
            {priorityQueue.slice(0, visibleLeadCount).map(item => {
              const { lead } = item;
              const propertyIds = [...new Set([...(lead.propertyIds ?? []), ...(lead.interests ?? []).map(interest => interest.propertyId || interest.unitId).filter((id): id is string => Boolean(id))])];
              const propertyId = selectedProperties[lead.id] || propertyIds[0];
              const interest = lead.interests?.find(entry => entry.propertyId === propertyId || entry.unitId === propertyId);
              const property = properties.find(entry => entry.id === propertyId);
              const project = projects.find(entry => entry.id === (property?.projectId || interest?.projectId || lead.projectId));
              const propertyLabel = interestLabel(property, interest, project);
              const status = item.isOverdue ? "Vencido" : item.isDueToday ? "Vence hoy" : item.isNew ? "Sin contacto previo" : "Al día";
              const color = item.isOverdue ? "day-rose" : item.isDueToday ? "day-amber" : item.isNew ? "day-blue" : "day-green";
              const lastInteractionAt = [item.state.lastContactAt, getLeadFollowUps(followUps, lead.id, lead.companyId)[0]?.occurredAt,
                "lastContactAt" in lead && typeof lead.lastContactAt === "string" ? lead.lastContactAt : undefined,
                lead.followUpUpdatedAt, lead.lastActivity,
              ].find(value => value && !Number.isNaN(parseArgentinaDate(value).getTime()));
              const message = `Hola ${lead.name}, te contacto por tu interés en ${propertyLabel}. ¿Coordinamos el próximo paso?`;
              const phone = lead.phone?.replace(/[^+0-9]/g, "");
              return <article className="day-next-row" key={lead.id}>
                <span className={cn("day-avatar", color)} aria-hidden>{leadInitials(lead.name)}</span>
                <div className="day-person"><div className="day-person-head"><Link href={`/admin/leads/${lead.id}`}>{lead.name}</Link><span className={cn("day-chip", color)}>{status}</span></div><p className="day-property">{propertyIds.length <= 1 && <InterestText parts={interestParts(property, interest, project)} />}<strong>{property ? inventoryPriceLabel(property) : "Precio a consultar"}</strong></p>{lastInteractionAt && !item.isNew ? <p className="day-meta">Último contacto: {parseArgentinaDate(lastInteractionAt).toLocaleString("es-AR", { timeZone: "America/Argentina/Buenos_Aires", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" })}</p> : item.isNew && <p className="day-meta">Todavía no hay contactos registrados</p>}
                  {propertyIds.length > 1 && <div className="day-property-pills" role="group" aria-label={`Inmuebles de ${lead.name}`}>{propertyIds.map(id => {
                    const pillProperty = properties.find(entry => entry.id === id);
                    const pillInterest = lead.interests?.find(entry => entry.propertyId === id || entry.unitId === id);
                    const pillProject = projects.find(entry => entry.id === (pillProperty?.projectId || pillInterest?.projectId || lead.projectId));
                    return <button key={id} type="button" aria-pressed={id === propertyId} onClick={() => setSelectedProperties(previous => ({ ...previous, [lead.id]: id }))}><InterestText parts={interestParts(pillProperty, pillInterest, pillProject)} /></button>;
                  })}</div>}
                  <label className="day-stage">Etapa<select value={interest?.status || lead.stage} onChange={event => void handleStageChange(lead.id, event.target.value as Lead["stage"], propertyId)}>{STAGE_OPTIONS.map(option => <option key={option.id} value={option.id}>{option.label}</option>)}</select></label></div>
                <div className="day-row-actions">
                  <LeadConversationLink key={lead.id} lead={lead} />
                  {phone ? <><a className="mi-day-secondary" href={`https://wa.me/${phone.replace(/\D/g, "")}?text=${encodeURIComponent(message)}`} target="_blank" rel="noopener noreferrer"><MessageCircle aria-hidden />WhatsApp</a><a className="mi-day-primary" href={`tel:${phone}`} onClick={() => setFollowUpLead(lead)}><Phone aria-hidden />Llamar</a></> : <Link className="mi-day-primary" href={`/admin/leads/${lead.id}`}>Ver cliente</Link>}
                  <Button variant="ghost" className="day-record" onClick={() => setFollowUpLead(lead)}><ClipboardCheck aria-hidden />Registrar resultado</Button>
                </div>
              </article>;
            })}
            {priorityQueue.length === 0 && <div className="day-empty"><h3>{loadError ? "No pudimos actualizar tus contactos" : searchQuery || activeQueueFilter !== "all" ? "No hay clientes con este filtro" : "No tenés contactos pendientes"}</h3><p>{loadError ? "Reintentaremos automáticamente." : "Podés revisar tu agenda o buscar entre todos tus leads."}</p><Link className="mi-day-secondary" href="/admin/leads">Ver mis leads</Link></div>}
          </div>
          {priorityQueue.length > visibleLeadCount && <Button variant="outline" className="day-show-more" onClick={() => setVisibleLeadCount(count => count + 5)}>Ver más clientes ({priorityQueue.length - visibleLeadCount})</Button>}
        </section>


        <aside className="day-side" aria-label="Tu día">
        <section className="day-focus" aria-labelledby="day-waiting">
          <div className="day-section-head"><h2 id="day-waiting">Esperan tu llamado</h2><span className="day-chip day-chip-urgent">{loadError ? "—" : overdueLeads.length === 0 ? "Sin atrasados" : `${overdueLeads.length} ${overdueLeads.length === 1 ? "atrasado" : "atrasados"}`}</span></div>
          <div className="day-number">{loadError ? "—" : waitingCount}</div>
          <div className="day-progress" role="meter" aria-label="Contactos atrasados entre los pendientes" aria-valuemin={0} aria-valuemax={Math.max(1, waitingCount)} aria-valuenow={overdueLeads.length}><i style={{ width: `${waitingCount ? overdueLeads.length / waitingCount * 100 : 0}%` }} /></div>
          <AdvisorDayGuide userId={user?.id || ""} day={todayStr} queue={queueGroups.all} ready={!loadError && loadedUserId === user?.id} onSave={handleConfirmFollowUp} />
        </section>
        <section className="day-card day-agenda" aria-labelledby="day-agenda-title">
          <div className="day-section-head"><h2 id="day-agenda-title">Hoy en tu agenda</h2><span className="day-chip day-purple">{visitsTotal ?? "—"}</span></div>
          {scheduledVisitsToday.map((visit, index) => <div className="day-agenda-row" key={`${visit.lead.id}-${index}`}><span className="day-chip day-purple">{visit.scheduledAt ? new Date(visit.scheduledAt).toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZone: "America/Argentina/Buenos_Aires" }) : "Hoy"}</span><div><h3>Visita agendada</h3><Link href={visit.lead.id ? `/admin/leads/${visit.lead.id}` : "/admin/agenda"}>{visit.lead.name}</Link>{visit.notes && <p className="day-muted">{visit.notes}</p>}</div></div>)}
          {scheduledVisitsToday.length === 0 && <div className="day-empty"><CalendarDays aria-hidden /><h3>{visitsError ? "No pudimos cargar tus citas" : "Hoy tenés espacio en tu agenda"}</h3><p>{visitsError ? "Reintentaremos automáticamente. Podés consultar tu agenda." : "Tus visitas agendadas para hoy van a aparecer acá."}</p></div>}
          <Link className="mi-day-secondary" href="/admin/agenda">Abrir agenda <ArrowRight aria-hidden /></Link>
        </section>

        {FINAL_DELIVERY_ENABLED && <section className="day-card day-dues" aria-labelledby="day-dues-title"><div className="day-section-head"><h2 id="day-dues-title">Cuotas</h2>{!collectionsError && <span className={cn("day-chip", overdueInstallmentsCount > 0 && "day-rose")}>{overdueInstallmentsCount} vencidas</span>}</div><p className="day-muted" role={collectionsError ? "alert" : undefined}>{collectionsError || (overdueInstallmentsCount ? "Revisá los saldos pendientes de tus clientes." : "No tenés cuotas vencidas en tu cartera.")}</p><Link className="mi-day-secondary" href="/admin/cobranzas?status=overdue">Ver cuotas</Link></section>}
        <section className="day-card day-messages" aria-labelledby="day-messages-title"><div className="day-section-head"><h2 id="day-messages-title">Mensajes</h2><MessageCircle aria-hidden /></div><div className="day-empty"><h3>Seguí la conversación</h3><p>Revisá los últimos mensajes de tus clientes en la bandeja.</p></div><Link className="mi-day-secondary" href="/admin/conversaciones">Abrir mensajes <ArrowRight aria-hidden /></Link></section>
        <details className="day-card day-help"><summary><HelpCircle aria-hidden />¿Cómo hago…?</summary><p>Empezá por los contactos que esperan. Después de llamar, tocá «Registrar resultado» para guardar qué pasó y acordar el próximo paso.</p><Link className="mi-day-secondary" href="/admin/settings">Texto grande y configuración</Link></details>
        </aside>
      </div>

      {/* Modal de Registro de Seguimiento en 1 Clic */}
      {followUpLead && (
        <LeadFollowUpEditor
          className="mi-day"
          lead={followUpLead}
          onClose={() => setFollowUpLead(null)}
          onConfirm={handleConfirmFollowUp}
        />
      )}

      {/* Modal de Actualización de Etapa Post-Seguimiento */}
      {stageUpdateLead && (
        <LeadStageUpdateModal
          className="admin-workspace mi-day"
          open={Boolean(stageUpdateLead)}
          leadName={stageUpdateLead.name}
          currentStage={(() => {
            const activePropId = stageUpdateLead.propertyIds?.[0] || stageUpdateLead.interests?.[0]?.propertyId;
            const interest = stageUpdateLead.interests?.find((i) => i.propertyId === activePropId || i.unitId === activePropId);
            return interest?.status || stageUpdateLead.stage;
          })()}
          onClose={() => setStageUpdateLead(null)}
          onConfirm={handleConfirmStageUpdate}
        />
      )}
    </div>
  );
}






