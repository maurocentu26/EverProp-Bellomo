"use client";
import { FINAL_DELIVERY_ENABLED } from "@/lib/release-visibility";
import { useCollections } from "@/hooks/use-collections";

import { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import { ArrowRight, CalendarDays, ClipboardCheck, HelpCircle, MessageCircle, Phone, Plus, Search } from "lucide-react";
import { toast } from "sonner";
import { 
  type Lead, 
  type LeadFollowUp, 
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
import { LeadFollowUpEditor } from "@/components/admin/LeadFollowUpEditor";
import { LeadStageUpdateModal } from "@/components/admin/LeadStageUpdateModal";
import { AdminMonthBalanceWidget } from "@/components/admin/advisor/AdminMonthBalanceWidget";
import { AdvisorDayGuide } from "@/components/admin/advisor/AdvisorDayGuide";
import { leadInitials, priorityReason } from "@/lib/advisor-day-guide";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const STAGE_OPTIONS: { id: Lead["stage"]; label: string; apiCode: string; color: string }[] = [
  { id: "new", label: "Nuevo", apiCode: "NEW", color: "bg-slate-100 text-slate-800 border-slate-300 dark:bg-slate-800 dark:text-slate-200 dark:border-slate-700" },
  { id: "contacted", label: "Contactado", apiCode: "CONTACTED", color: "bg-blue-100 text-blue-900 border-blue-300 dark:bg-blue-950/80 dark:text-blue-200 dark:border-blue-800" },
  { id: "visiting", label: "Visita Agendada", apiCode: "VISIT_SCHEDULED", color: "bg-purple-100 text-purple-900 border-purple-300 dark:bg-purple-950/80 dark:text-purple-200 dark:border-purple-800" },
  { id: "negotiation", label: "Negociación", apiCode: "NEGOTIATION", color: "bg-amber-100 text-amber-900 border-amber-300 dark:bg-amber-950/80 dark:text-amber-200 dark:border-amber-800" },
  { id: "closing", label: "Cerrado / Ganado", apiCode: "WON", color: "bg-emerald-100 text-emerald-900 border-emerald-300 dark:bg-emerald-950/80 dark:text-emerald-200 dark:border-emerald-800" },
  { id: "discarded", label: "Descartado", apiCode: "LOST", color: "bg-slate-100 text-slate-700 border-slate-300 dark:bg-slate-800 dark:text-slate-200" },
];

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
  const [activeQueueFilter, setActiveQueueFilter] = useState<"all" | "overdue" | "today" | "new">("all");
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
  const inProgress = queueGroups.all.filter(item => item.lead.stage !== "new").slice(0, 3);
  const queueFilterLabels = {
    all: "Todos", overdue: "Contactos atrasados", today: "Contactar hoy", new: "Nuevos sin contactar",
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

  const scheduledVisitsToday = isMockDataMode ? localVisitsToday : apiVisits?.data ?? [];
  const visitsTotal = isMockDataMode ? localVisitsToday.length : apiVisits?.meta.total;

  // Cola prioritaria de acción
  const priorityQueue = useMemo(() => {
    let queue = queueGroups[activeQueueFilter];

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
  }, [queueGroups, activeQueueFilter, searchQuery]);

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
        <div><p className="day-muted">{todayFormatted}</p><h1>Buen día, {user?.name?.split(" ")[0] || "Asesor"}</h1></div>
        <div className="day-heading-actions">
          {user?.role === "ADMIN" && <label>Asesor <select value={globalSelectedAgentId} onChange={e => setGlobalSelectedAgentId(e.target.value)}><option value="all">Todo el equipo</option>{advisors.map(advisor => <option key={advisor.id} value={advisor.id}>{advisor.name}</option>)}</select></label>}
          <Link className="mi-day-secondary" href="/admin/leads/new"><Plus aria-hidden />Nuevo lead</Link>
          <Button variant="outline" onClick={() => setShowMonthBalance(!showMonthBalance)}>Balance del mes</Button>
        </div>
      </header>
      {loadError && <p role="alert" className="day-alert">{loadError}</p>}
      {showMonthBalance && <AdminMonthBalanceWidget leads={myLeads} followUps={followUps} properties={properties} projects={projects} />}
      <div className="day-grid">
        <section className="day-focus" aria-labelledby="day-waiting">
          <div className="day-section-head"><h2 id="day-waiting">Esperan tu llamado</h2><span className="day-chip day-chip-urgent">{loadError ? "—" : overdueLeads.length === 0 ? "Sin atrasados" : `${overdueLeads.length} ${overdueLeads.length === 1 ? "atrasado" : "atrasados"}`}</span></div>
          <div className="day-number">{loadError ? "—" : waitingCount}</div>
          <div className="day-progress" role="meter" aria-label="Contactos atrasados entre los pendientes" aria-valuemin={0} aria-valuemax={Math.max(1, waitingCount)} aria-valuenow={overdueLeads.length}><i style={{ width: `${waitingCount ? overdueLeads.length / waitingCount * 100 : 0}%` }} /></div>
          <AdvisorDayGuide userId={user?.id || ""} day={todayStr} queue={queueGroups.all} ready={!loadError && loadedUserId === user?.id} onSave={handleConfirmFollowUp} />
        </section>

        <section className="day-card day-next" aria-labelledby="day-next-title">
          <div className="day-section-head"><h2 id="day-next-title">Tu próximo paso</h2><span className="day-chip">Por urgencia</span></div>
          <details className="day-filters"><summary>Buscar y filtrar clientes</summary>
            <label className="day-search"><Search aria-hidden /><span className="sr-only">Buscar por nombre, teléfono o email</span><input value={searchQuery} onChange={e => { setSearchQuery(e.target.value); setVisibleLeadCount(4); }} placeholder="Buscar cliente…" /></label>
            <div role="group" aria-label="Filtrar por seguimiento" className="day-filter-options">{(["all", "overdue", "today", "new"] as const).map(filter => <button key={filter} type="button" aria-pressed={activeQueueFilter === filter} onClick={() => selectQueueFilter(filter)}>{queueFilterLabels[filter]} · {queueGroups[filter].length}</button>)}</div>
          </details>
          <div id="commercial-lead-results">
            {priorityQueue.slice(0, visibleLeadCount).map(item => {
              const { lead } = item;
              const phone = lead.phone?.replace(/[^+0-9]/g, "");
              return <article className="day-next-row" key={lead.id}>
                <span className={cn("day-avatar", item.isOverdue ? "day-rose" : item.isDueToday ? "day-amber" : "day-blue")} aria-hidden>{leadInitials(lead.name)}</span>
                <div className="day-person"><Link href={`/admin/leads/${lead.id}`}>{lead.name}</Link><span className={cn("day-chip", item.isOverdue ? "day-rose" : item.isDueToday ? "day-amber" : "day-blue")}>{priorityReason(item)}</span></div>
                <div className="day-row-actions">
                  {phone ? <><a className="mi-day-secondary" href={`https://wa.me/${phone.replace(/\D/g, "")}`} target="_blank" rel="noopener noreferrer"><MessageCircle aria-hidden />WhatsApp</a><a className="mi-day-primary" href={`tel:${phone}`} onClick={() => setFollowUpLead(lead)}><Phone aria-hidden />Llamar</a></> : <Link className="mi-day-primary" href={`/admin/leads/${lead.id}`}>Ver cliente</Link>}
                  <Button variant="ghost" className="day-record" onClick={() => setFollowUpLead(lead)}><ClipboardCheck aria-hidden />Registrar resultado</Button>
                </div>
              </article>;
            })}
            {priorityQueue.length === 0 && <div className="day-empty"><h3>{loadError ? "No pudimos actualizar tus contactos" : searchQuery || activeQueueFilter !== "all" ? "No hay clientes con este filtro" : "No tenés contactos pendientes"}</h3><p>{loadError ? "Reintentaremos automáticamente." : "Podés revisar tu agenda o buscar entre todos tus leads."}</p><Link className="mi-day-secondary" href="/admin/leads">Ver mis leads</Link></div>}
          </div>
          {priorityQueue.length > visibleLeadCount && <Button variant="outline" className="day-show-more" onClick={() => setVisibleLeadCount(count => count + 5)}>Ver más clientes ({priorityQueue.length - visibleLeadCount})</Button>}
        </section>

        <section className="day-clients" aria-labelledby="day-clients-title">
          <h2 id="day-clients-title" className="day-mobile-title">Clientes en curso</h2>
          <div className="day-client-track">
            {inProgress.map(({ lead }) => {
              const propertyId = lead.propertyIds?.[0] || lead.interests?.[0]?.propertyId || lead.interests?.[0]?.unitId;
              const interest = lead.interests?.find(item => item.propertyId === propertyId || item.unitId === propertyId);
              const property = properties.find(item => item.id === propertyId);
              const project = projects.find(item => item.id === (interest?.projectId || lead.projectId));
              const stage = interest?.status || lead.stage;
              const stageIndex = STAGE_OPTIONS.findIndex(item => item.id === stage);
              const stageNumber = Math.min(5, Math.max(1, stageIndex + 1));
              return <article key={lead.id} className={cn("day-client-card", stage === "visiting" ? "day-purple" : stage === "negotiation" ? "day-amber" : "day-blue")}>
                <p className="day-muted">En seguimiento</p>
                <h3>{property?.title || interest?.propertyTitle || "Sin unidad vinculada"}</h3>
                {project && <p>{project.name}</p>}
                <p>{lead.name}</p>
                <div className="day-progress" aria-hidden><i style={{ width: `${stageNumber * 20}%` }} /></div>
                <p className="day-stage">Etapa: {STAGE_OPTIONS[stageIndex]?.label || "Nuevo"} · {stageNumber} de 5</p>
                <Link href={`/admin/leads/${lead.id}`}>Ver cliente <span aria-hidden>›</span></Link>
              </article>;
            })}
            {inProgress.length === 0 && <div className="day-card day-empty"><h3>Tus próximos clientes, acá</h3><p>Cuando avances una consulta, vas a ver su etapa y unidad en este espacio.</p><Link href="/admin/leads" className="mi-day-secondary">Ver mis leads</Link></div>}
          </div>
        </section>

        <section className="day-card day-agenda" aria-labelledby="day-agenda-title">
          <div className="day-section-head"><h2 id="day-agenda-title">Hoy en tu agenda</h2><span className="day-chip day-purple">{visitsTotal ?? "—"}</span></div>
          {scheduledVisitsToday.map((visit, index) => <div className="day-agenda-row" key={`${visit.lead.id}-${index}`}><span className="day-chip day-purple">{visit.scheduledAt ? new Date(visit.scheduledAt).toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit", timeZone: "America/Argentina/Buenos_Aires" }) : "Hoy"}</span><div><h3>Visita agendada</h3><Link href={visit.lead.id ? `/admin/leads/${visit.lead.id}` : "/admin/agenda"}>{visit.lead.name}</Link>{visit.notes && <p className="day-muted">{visit.notes}</p>}</div></div>)}
          {scheduledVisitsToday.length === 0 && <div className="day-empty"><CalendarDays aria-hidden /><h3>{visitsError ? "No pudimos cargar tus citas" : "Hoy tenés espacio en tu agenda"}</h3><p>{visitsError ? "Reintentaremos automáticamente. Podés consultar tu agenda." : "Tus visitas agendadas para hoy van a aparecer acá."}</p></div>}
          <Link className="mi-day-secondary" href="/admin/agenda">Abrir agenda <ArrowRight aria-hidden /></Link>
        </section>

        <section className="day-counters" aria-label="Resumen de contactos">
          <button type="button" className="day-card" onClick={() => selectQueueFilter("new")}><strong className="day-counter-number">{loadError ? "—" : newLeads.length}</strong><span>Consultas nuevas</span></button>
          <button type="button" className="day-card" onClick={() => selectQueueFilter("today")}><strong className="day-counter-number">{loadError ? "—" : todayLeads.length}</strong><span>Contactos para hoy</span></button>
        </section>

        {FINAL_DELIVERY_ENABLED && <section className="day-card day-dues" aria-labelledby="day-dues-title"><div className="day-section-head"><h2 id="day-dues-title">Cuotas</h2>{!collectionsError && <span className={cn("day-chip", overdueInstallmentsCount > 0 && "day-rose")}>{overdueInstallmentsCount} vencidas</span>}</div><p className="day-muted" role={collectionsError ? "alert" : undefined}>{collectionsError || (overdueInstallmentsCount ? "Revisá los saldos pendientes de tus clientes." : "No tenés cuotas vencidas en tu cartera.")}</p><Link className="mi-day-secondary" href="/admin/cobranzas?status=overdue">Ver cuotas</Link></section>}
        <section className="day-card day-messages" aria-labelledby="day-messages-title"><div className="day-section-head"><h2 id="day-messages-title">Mensajes</h2><MessageCircle aria-hidden /></div><div className="day-empty"><h3>Seguí la conversación</h3><p>Revisá los últimos mensajes de tus clientes en la bandeja.</p></div><Link className="mi-day-secondary" href="/admin/conversaciones">Abrir mensajes <ArrowRight aria-hidden /></Link></section>
        <details className="day-card day-help"><summary><HelpCircle aria-hidden />¿Cómo hago…?</summary><p>Empezá por los contactos que esperan. Después de llamar, tocá «Registrar resultado» para guardar qué pasó y acordar el próximo paso.</p><Link className="mi-day-secondary" href="/admin/settings">Texto grande y configuración</Link></details>
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






