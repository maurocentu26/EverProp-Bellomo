"use client";
import { FINAL_DELIVERY_ENABLED } from "@/lib/release-visibility";
import { useCollections } from "@/hooks/use-collections";

import { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { 
  AlertTriangle, 
  Calendar, 
  Clock3, 
  Phone, 
  MessageCircle, 
  Plus, 
  Search, 
  ChevronRight, 
  CalendarDays, 
  ExternalLink,
  ClipboardCheck,
  CheckCircle2,
  Flame,
  MapPin,
  ArrowRight,
  Mail,
  Lightbulb,
  Building2,
  BarChart3,
  Users,
  Loader2,
  ReceiptText,
} from "lucide-react";
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
import { getLeadFollowUpState } from "@/lib/lead-follow-up";
import { isMockDataMode } from "@/lib/data-mode";
import { 
  loadEverpropLeads, 
  loadEverpropCatalog, 
  updateEverpropLead, 
  updateEverpropLeadProperty,
  createEverpropLeadFollowUp,
  loadEverpropAllFollowUps,
} from "@/lib/everprop-api";
import { useCurrentSession } from "@/hooks/use-current-session";
import { LeadFollowUpEditor } from "@/components/admin/LeadFollowUpEditor";
import { LeadStageUpdateModal } from "@/components/admin/LeadStageUpdateModal";
import { AdminMonthBalanceWidget } from "@/components/admin/advisor/AdminMonthBalanceWidget";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import Badge from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const STAGE_OPTIONS: { id: Lead["stage"]; label: string; apiCode: string; color: string }[] = [
  { id: "new", label: "Nuevo", apiCode: "NEW", color: "bg-slate-100 text-slate-800 border-slate-300 dark:bg-slate-800 dark:text-slate-200 dark:border-slate-700" },
  { id: "contacted", label: "Contactado", apiCode: "CONTACTED", color: "bg-blue-100 text-blue-900 border-blue-300 dark:bg-blue-950/80 dark:text-blue-200 dark:border-blue-800" },
  { id: "visiting", label: "Visita Agendada", apiCode: "VISIT_SCHEDULED", color: "bg-purple-100 text-purple-900 border-purple-300 dark:bg-purple-950/80 dark:text-purple-200 dark:border-purple-800" },
  { id: "negotiation", label: "Negociación", apiCode: "NEGOTIATION", color: "bg-amber-100 text-amber-900 border-amber-300 dark:bg-amber-950/80 dark:text-amber-200 dark:border-amber-800" },
  { id: "closing", label: "Cerrado / Ganado", apiCode: "WON", color: "bg-emerald-100 text-emerald-900 border-emerald-300 dark:bg-emerald-950/80 dark:text-emerald-200 dark:border-emerald-800" },
];

export default function AdvisorCockpit() {
  const { user } = useCurrentSession();
  const [leads, setLeads] = useState<Lead[]>([]);
  const [followUps, setFollowUps] = useState<LeadFollowUp[]>([]);
  const [properties, setProperties] = useState<Property[]>(sampleProperties);
  const [projects, setProjects] = useState<Project[]>(sampleProjects);
  const [isLoaded, setIsLoaded] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [activeQueueFilter, setActiveQueueFilter] = useState<"all" | "overdue" | "today" | "new">("all");
  const router = useRouter();
  const [followUpLead, setFollowUpLead] = useState<Lead | null>(null);
  const [stageUpdateLead, setStageUpdateLead] = useState<Lead | null>(null);
  const [updatingStageLeadId, setUpdatingStageLeadId] = useState<string | null>(null);
  const [selectedPropertyByLead, setSelectedPropertyByLead] = useState<Record<string, string>>({});
  const [showMonthBalance, setShowMonthBalance] = useState(false);
  const { installments, error: collectionsError } = useCollections();

  // Carga de datos inicial y sincronización en tiempo real
  useEffect(() => {
    let active = true;

    async function loadData() {
      let loadedLeads: Lead[] = [];
      let loadedFollowUps: LeadFollowUp[] = [];
      let loadedProperties: Property[] = sampleProperties;
      let loadedProjects: Project[] = sampleProjects;


      if (!isMockDataMode) {
        try {
          const [apiLeads, catalog, apiFollowUps] = await Promise.all([
            loadEverpropLeads(),
            loadEverpropCatalog().catch(() => ({ properties: sampleProperties, projects: sampleProjects })),
            loadEverpropAllFollowUps().catch(() => []),
          ]);
          if (active) {
            const localLeads = loadLeadList([], "c1");
            const apiIds = new Set(apiLeads.map((l) => l.id));
            const extraLocalLeads = localLeads.filter((l) => !apiIds.has(l.id));
            loadedLeads = [...apiLeads, ...extraLocalLeads];

            if (catalog.properties && catalog.properties.length > 0) {
              loadedProperties = catalog.properties;
            }
            if (catalog.projects && catalog.projects.length > 0) {
              loadedProjects = catalog.projects;
            }
            const localFollowUps = loadLeadFollowUpList([], "c1");
            const apiFuIds = new Set(apiFollowUps.map((f: LeadFollowUp) => f.id));
            const extraLocalFus = localFollowUps.filter((f) => !apiFuIds.has(f.id));
            loadedFollowUps = [...apiFollowUps, ...extraLocalFus];
          }
        } catch (err) {
          console.error("Error loading leads from API:", err);
          loadedLeads = loadLeadList(sampleLeads, "c1");
          loadedFollowUps = loadLeadFollowUpList([], "c1");
        }
      } else {
        loadedLeads = loadLeadList(sampleLeads, "c1");
        loadedFollowUps = loadLeadFollowUpList([], "c1");
      }

      if (active) {
        setLeads(loadedLeads);
        setFollowUps(loadedFollowUps);
        setProperties(loadedProperties);
        setProjects(loadedProjects);

        setIsLoaded(true);
      }
    }

    void loadData();

    const handleLeadsUpdated = () => {
      void loadData();
    };

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
      window.removeEventListener("everprop_leads_updated", handleLeadsUpdated);
      channel?.close();
    };
  }, []);

  const todayStr = useMemo(() => {
    const now = new Date();
    return now.toISOString().split("T")[0];
  }, []);

  const todayFormatted = useMemo(() => {
    const now = new Date();
    return now.toLocaleDateString("es-AR", {
      weekday: "long",
      day: "numeric",
      month: "long",
    });
  }, []);

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
    if (!user || user.role === "ADMIN") return leads;
    const filtered = leads.filter((lead) => {
      if (!lead.agentId) return true; // Mostrar también sin asignar si está en cola
      return String(lead.agentId) === String(user.id);
    });
    // Si no tiene asignados ninguno todavía, mostrar todos los leads para no dejarlo vacío
    return filtered.length > 0 ? filtered : leads;
  }, [leads, user]);

  // Derivar métricas y categorizaciones para Mi Día
  const { overdueLeads, todayLeads, newLeads, scheduledVisitsToday } = useMemo(() => {
    const now = new Date();
    const overdue: { lead: Lead; state: ReturnType<typeof getLeadFollowUpState> }[] = [];
    const todayScheduled: { lead: Lead; state: ReturnType<typeof getLeadFollowUpState> }[] = [];
    const freshlyNew: Lead[] = [];
    const visitsToday: { lead: Lead; scheduledAt: string; notes?: string }[] = [];

    for (const lead of myLeads) {
      const state = getLeadFollowUpState(followUps, lead.id, lead.followUpUpdatedAt, now, lead.companyId);

      // Chequear si es vencido (>10 días)
      if (state.kind === "overdue") {
        overdue.push({ lead, state });
      }

      // Chequear si tiene contacto hoy
      const hasTodayContact = followUps.some((f) => f.leadId === lead.id && f.nextContactAt?.startsWith(todayStr));
      if (hasTodayContact || state.kind === "dueSoon") {
        todayScheduled.push({ lead, state });
      }

      // Chequear si es nuevo
      if (lead.stage === "new") {
        freshlyNew.push(lead);
      }

      // Visitas agendadas hoy
      if (lead.visits && lead.visits.length > 0) {
        for (const v of lead.visits) {
          if (v.scheduledAt?.startsWith(todayStr) && v.status === "scheduled") {
            visitsToday.push({ lead, scheduledAt: v.scheduledAt, notes: v.notes });
          }
        }
      }
    }

    return {
      overdueLeads: overdue,
      todayLeads: todayScheduled,
      newLeads: freshlyNew,
      scheduledVisitsToday: visitsToday,
    };
  }, [myLeads, followUps, todayStr]);

  // Cola prioritaria de acción
  const priorityQueue = useMemo(() => {
    const now = new Date();
    let queue = myLeads.map((lead) => {
      const state = getLeadFollowUpState(followUps, lead.id, lead.followUpUpdatedAt, now, lead.companyId);
      const isOverdue = state.kind === "overdue";
      const isDueToday = followUps.some((f) => f.leadId === lead.id && f.nextContactAt?.startsWith(todayStr)) || state.kind === "dueSoon";
      const isNew = lead.stage === "new";

      // Score de prioridad
      let priorityWeight = 0;
      if (isOverdue) priorityWeight += 100 + (state.elapsedDays ?? 0);
      if (isDueToday) priorityWeight += 80;
      if (isNew) priorityWeight += 50;

      return {
        lead,
        state,
        isOverdue,
        isDueToday,
        isNew,
        priorityWeight,
      };
    });

    // Filtro por tab de cola
    if (activeQueueFilter === "overdue") {
      queue = queue.filter((item) => item.isOverdue);
    } else if (activeQueueFilter === "today") {
      queue = queue.filter((item) => item.isDueToday);
    } else if (activeQueueFilter === "new") {
      queue = queue.filter((item) => item.isNew);
    }

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
    return queue.sort((a, b) => b.priorityWeight - a.priorityWeight);
  }, [myLeads, followUps, activeQueueFilter, searchQuery, todayStr]);

  // Manejo de cambio de etapa en 1 clic (por propiedad o general)
  async function handleStageChange(leadId: string, newStage: Lead["stage"], propertyId?: string) {
    const previousLeads = [...leads];
    const targetLead = leads.find((l) => l.id === leadId);
    if (!targetLead) return;

    // Validación comercial: No se puede cambiar de etapa sin haber realizado al menos un seguimiento previo
    const leadFollowUps = followUps.filter((f) => f.leadId === leadId);
    const hasFollowUp = leadFollowUps.length > 0 || Boolean(targetLead.followUpUpdatedAt);
    if (!hasFollowUp && newStage !== "new") {
      toast.error("Es obligatorio registrar un seguimiento comercial antes de cambiar la etapa del lead.");
      setFollowUpLead(targetLead);
      return;
    }

    const targetPropId = propertyId || selectedPropertyByLead[leadId] || targetLead.propertyIds?.[0] || targetLead.interests?.[0]?.propertyId || targetLead.interests?.[0]?.unitId;
    const stageConfig = STAGE_OPTIONS.find((s) => s.id === newStage);

    setUpdatingStageLeadId(leadId);

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
      saveLeadList(updated, "c1");

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
    } finally {
      setUpdatingStageLeadId(null);
    }
  }

  // Guardar seguimiento
  async function handleConfirmFollowUp(followUp: LeadFollowUp) {
    if (!followUpLead) return;

    const nextFollowUps = appendLeadFollowUpToStorage(followUp, followUps, followUpLead.companyId);
    setFollowUps(nextFollowUps);
    setLeads((prev) =>
      prev.map((l) =>
        l.id === followUpLead.id
          ? { ...l, followUpUpdatedAt: followUp.occurredAt, lastActivity: followUp.occurredAt }
          : l
      )
    );

    if (!isMockDataMode) {
      try {
        const created = await createEverpropLeadFollowUp(followUpLead.id, {
          type: followUp.type,
          occurredAt: followUp.occurredAt,
          summary: followUp.summary,
          result: followUp.result,
          nextAction: followUp.nextAction,
          nextContactAt: followUp.nextContactAt,
          agentId: followUp.agentId,
        });
        setFollowUps((prev) => [created, ...prev.filter((f) => f.id !== followUp.id)]);
      } catch (e) {
        console.error("Error al registrar seguimiento en API:", e);
      }
    }

    toast.success("Seguimiento registrado con éxito.");
    const recordedLead = followUpLead;
    setFollowUpLead(null);
    setStageUpdateLead(recordedLead);
  }

  // Confirmación de nueva etapa post-seguimiento
  async function handleConfirmStageUpdate(newStage: Exclude<Lead["stage"], "new">) {
    if (!stageUpdateLead) return;
    const activePropId = selectedPropertyByLead[stageUpdateLead.id] || stageUpdateLead.propertyIds?.[0] || stageUpdateLead.interests?.[0]?.propertyId;
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
    <div className="space-y-6 pb-12">
      {/* ── CABECERA CORPORATIVA SOBRIA: BIENVENIDA AL ASESOR ── */}
      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-xs sm:p-6 dark:bg-card dark:border-border">
        {/* Mobile layout */}
        <div className="sm:hidden space-y-3">
          <div className="flex flex-col items-stretch gap-3">
            <div className="min-w-0">
              <h1 className="text-lg font-bold tracking-tight text-slate-900 dark:text-slate-100 break-words">
                Hola, {user?.name || "Asesor"}
              </h1>
              <p className="text-xs capitalize text-slate-500 dark:text-slate-400">
                {todayFormatted}
              </p>
            </div>
            <Link href="/admin/leads/new">
              <Button className="min-h-11 gap-1.5 rounded-xl bg-blue-600 px-3.5 text-xs font-bold text-white hover:bg-blue-700 shadow-xs w-full">
                <Plus className="size-3.5" />
                Nuevo Lead
              </Button>
            </Link>
          </div>
          <div className="grid grid-cols-2 gap-2">
            {FINAL_DELIVERY_ENABLED && <Button
              type="button"
              variant={showMonthBalance ? "default" : "outline"}
              onClick={() => setShowMonthBalance(!showMonthBalance)}
              className={cn(
                "min-h-11 gap-1.5 rounded-lg px-3 text-xs font-semibold flex-1",
                showMonthBalance
                  ? "bg-slate-900 text-white hover:bg-slate-800 dark:bg-slate-100 dark:text-slate-900"
                  : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-300"
              )}
            >
              <BarChart3 className="size-3.5" />
              Balance
            </Button>}
            <Link href="/admin/leads" className="flex-1">
              <Button variant="outline" className="min-h-11 gap-1.5 rounded-lg border-slate-200 bg-white px-3 text-xs font-semibold text-slate-600 hover:bg-slate-50 w-full dark:border-slate-800 dark:bg-slate-950 dark:text-slate-300">
                <Users className="size-3.5" />
                Mis Leads
              </Button>
            </Link>
            <Link href="/admin/agenda" className="flex-1">
              <Button variant="outline" className="min-h-11 gap-1.5 rounded-lg border-slate-200 bg-white px-3 text-xs font-semibold text-slate-600 hover:bg-slate-50 w-full dark:border-slate-800 dark:bg-slate-950 dark:text-slate-300">
                <CalendarDays className="size-3.5" />
                Agenda
              </Button>
            </Link>
            {FINAL_DELIVERY_ENABLED && <Link href="/admin/cobranzas" className="flex-1">
              <Button variant="outline" className="min-h-11 gap-1.5 rounded-lg border-slate-200 bg-white px-3 text-xs font-semibold text-slate-600 hover:bg-slate-50 w-full dark:border-slate-800 dark:bg-slate-950 dark:text-slate-300">
                <ReceiptText className="size-3.5 text-blue-600 dark:text-blue-400" />
                Cuotas
              </Button>
            </Link>}
          </div>
        </div>

        {/* Desktop layout */}
        <div className="hidden sm:flex sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl dark:text-slate-100">
              Bienvenido, {user?.name || "Asesor"}
            </h1>
            <p className="mt-1 text-sm capitalize text-slate-500 dark:text-slate-400">
              {todayFormatted}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            {FINAL_DELIVERY_ENABLED && <Button
              type="button"
              variant={showMonthBalance ? "default" : "outline"}
              onClick={() => setShowMonthBalance(!showMonthBalance)}
              className={cn(
                "min-h-11 gap-2 rounded-xl px-4 text-sm font-semibold shadow-xs transition-colors",
                showMonthBalance
                  ? "bg-slate-900 text-white hover:bg-slate-800 dark:bg-slate-100 dark:text-slate-900"
                  : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-200"
              )}
            >
              <BarChart3 className="size-4" />
              {showMonthBalance ? "Ocultar Balance" : "Balance del Mes & Números"}
            </Button>}
            <Link href="/admin/leads/new">
              <Button className="min-h-11 gap-2 rounded-xl bg-blue-600 px-4 text-sm font-bold text-white hover:bg-blue-700 shadow-xs">
                <Plus className="size-4" />
                Nuevo Lead
              </Button>
            </Link>
            <Link href="/admin/leads">
              <Button variant="outline" className="min-h-11 gap-2 rounded-xl border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 hover:bg-slate-50 shadow-xs dark:border-slate-800 dark:bg-slate-950 dark:text-slate-200">
                <Users className="size-4" />
                Mis Leads
              </Button>
            </Link>
            <Link href="/admin/agenda">
              <Button variant="outline" className="min-h-11 gap-2 rounded-xl border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 hover:bg-slate-50 shadow-xs dark:border-slate-800 dark:bg-slate-950 dark:text-slate-200">
                <CalendarDays className="size-4" />
                Mi Agenda
              </Button>
            </Link>
            {FINAL_DELIVERY_ENABLED && <Link href="/admin/cobranzas">
              <Button variant="outline" className="min-h-11 gap-2 rounded-xl border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 hover:bg-slate-50 shadow-xs dark:border-slate-800 dark:bg-slate-950 dark:text-slate-200">
                <ReceiptText className="size-4 text-blue-600 dark:text-blue-400" />
                Cobranzas & Cuotas
              </Button>
            </Link>}
          </div>
        </div>
      </div>

      {/* ── BALANCE DEL MES & NÚMEROS DE LEADS (AUDITORÍA COMERCIAL) ── */}
      {FINAL_DELIVERY_ENABLED && showMonthBalance && (
        <AdminMonthBalanceWidget
          leads={leads}
          followUps={followUps}
          properties={properties}
          projects={projects}
        />
      )}

      {/* ── 4 TARJETAS DE ENFOQUE DIARIO (KPIS ACCIONABLES) ── */}
      <div className="grid grid-cols-2 gap-2.5 sm:gap-4 lg:grid-cols-4">
        {/* Vencidos */}
        <button
          type="button"
          onClick={() => setActiveQueueFilter(activeQueueFilter === "overdue" ? "all" : "overdue")}
          className={cn(
            "flex flex-col justify-between rounded-2xl border p-3 sm:p-5 text-left transition-all shadow-sm",
            activeQueueFilter === "overdue"
              ? "border-rose-500 bg-rose-50 ring-2 ring-rose-500"
              : "border-rose-200/80 bg-white hover:border-rose-300 hover:bg-rose-50/50"
          )}
        >
          <div className="flex items-center justify-between">
            <span className="flex size-8 sm:size-10 items-center justify-center rounded-xl bg-rose-100 text-rose-700">
              <AlertTriangle className="size-4 sm:size-5" />
            </span>
            <span className="text-[10px] sm:text-xs font-bold uppercase tracking-wider text-rose-600">Urgente</span>
          </div>
          <div className="mt-2.5 sm:mt-4">
            <p className="text-2xl sm:text-3xl font-black text-rose-950">{overdueLeads.length}</p>
            <p className="mt-0.5 text-xs sm:text-sm font-semibold text-rose-800">Seg. Vencidos</p>
            <p className="text-[10px] sm:text-xs text-rose-600 hidden sm:block">&gt; 10 días sin contacto</p>
          </div>
        </button>

        {/* Contactos para hoy */}
        <button
          type="button"
          onClick={() => setActiveQueueFilter(activeQueueFilter === "today" ? "all" : "today")}
          className={cn(
            "flex flex-col justify-between rounded-2xl border p-3 sm:p-5 text-left transition-all shadow-sm",
            activeQueueFilter === "today"
              ? "border-amber-500 bg-amber-50 ring-2 ring-amber-500"
              : "border-amber-200/80 bg-white hover:border-amber-300 hover:bg-amber-50/50"
          )}
        >
          <div className="flex items-center justify-between">
            <span className="flex size-8 sm:size-10 items-center justify-center rounded-xl bg-amber-100 text-amber-700">
              <Clock3 className="size-4 sm:size-5" />
            </span>
            <span className="text-[10px] sm:text-xs font-bold uppercase tracking-wider text-amber-600">Para Hoy</span>
          </div>
          <div className="mt-2.5 sm:mt-4">
            <p className="text-2xl sm:text-3xl font-black text-amber-950">{todayLeads.length}</p>
            <p className="mt-0.5 text-xs sm:text-sm font-semibold text-amber-800">Programados</p>
            <p className="text-[10px] sm:text-xs text-amber-600 hidden sm:block">Compromisos de hoy</p>
          </div>
        </button>

        {/* Nuevos sin contactar */}
        <button
          type="button"
          onClick={() => setActiveQueueFilter(activeQueueFilter === "new" ? "all" : "new")}
          className={cn(
            "flex flex-col justify-between rounded-2xl border p-3 sm:p-5 text-left transition-all shadow-sm",
            activeQueueFilter === "new"
              ? "border-blue-500 bg-blue-50 ring-2 ring-blue-500"
              : "border-blue-200/80 bg-white hover:border-blue-300 hover:bg-blue-50/50"
          )}
        >
          <div className="flex items-center justify-between">
            <span className="flex size-8 sm:size-10 items-center justify-center rounded-xl bg-blue-100 text-blue-700">
              <Flame className="size-4 sm:size-5" />
            </span>
            <span className="text-[10px] sm:text-xs font-bold uppercase tracking-wider text-blue-600">Entrantes</span>
          </div>
          <div className="mt-2.5 sm:mt-4">
            <p className="text-2xl sm:text-3xl font-black text-blue-950">{newLeads.length}</p>
            <p className="mt-0.5 text-xs sm:text-sm font-semibold text-blue-800">Sin Contactar</p>
            <p className="text-[10px] sm:text-xs text-blue-600 hidden sm:block">Primer contacto pendiente</p>
          </div>
        </button>

        {/* Citas de Hoy */}
        <Link
          href="/admin/agenda"
          className="flex flex-col justify-between rounded-2xl border border-purple-200/80 bg-white p-3 sm:p-5 text-left shadow-sm transition-all hover:border-purple-300 hover:bg-purple-50/50"
        >
          <div className="flex items-center justify-between">
            <span className="flex size-8 sm:size-10 items-center justify-center rounded-xl bg-purple-100 text-purple-700">
              <Calendar className="size-4 sm:size-5" />
            </span>
            <span className="text-[10px] sm:text-xs font-bold uppercase tracking-wider text-purple-600">Agenda</span>
          </div>
          <div className="mt-2.5 sm:mt-4">
            <p className="text-2xl sm:text-3xl font-black text-purple-950">{scheduledVisitsToday.length}</p>
            <p className="mt-0.5 text-xs sm:text-sm font-semibold text-purple-800">Citas Hoy</p>
            <p className="text-[10px] sm:text-xs text-purple-600 hidden sm:block">Visitas a loteos / unidades</p>
          </div>
        </Link>
      </div>

      {/* ── ALERTA DE MORA EN CUOTAS DE CLIENTES ── */}
      {FINAL_DELIVERY_ENABLED && collectionsError && <p role="alert" className="text-red-600">Cobranzas: {collectionsError}</p>}
      {FINAL_DELIVERY_ENABLED && overdueInstallmentsCount > 0 && (
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 rounded-2xl border border-rose-200 bg-rose-50/70 p-4 shadow-sm dark:border-rose-900/50 dark:bg-rose-950/20">
          <div className="flex items-center gap-3">
            <span className="flex size-9 items-center justify-center rounded-xl bg-rose-100 text-rose-700 dark:bg-rose-900/50 dark:text-rose-300 shrink-0">
              <ReceiptText className="size-5" />
            </span>
            <div>
              <p className="text-xs font-bold text-rose-950 dark:text-rose-100">
                Alerta de Mora: Tenés {overdueInstallmentsCount} cuota(s) vencida(s) en tu cartera de leads
              </p>
              <p className="text-[11px] text-rose-700 dark:text-rose-400">
                Registrá el cobro recibido o enviá el recordatorio personalizado por WhatsApp con 1 clic.
              </p>
            </div>
          </div>
          <Link
            href="/admin/cobranzas?status=overdue"
            className="flex items-center justify-center gap-1.5 rounded-xl bg-rose-600 px-3.5 py-2 text-xs font-bold text-white shadow-sm hover:bg-rose-700 shrink-0"
          >
            <span>Gestionar Mora</span>
            <ArrowRight className="size-3.5" />
          </Link>
        </div>
      )}

      {/* ── CUERPO PRINCIPAL: COLA DE ACCIÓN + AGENDA LATERAL ── */}
      <div className="grid grid-cols-1 gap-8 lg:grid-cols-3">
        {/* Columna Izquierda: Cola de Tareas Prioritarias (2 columnas en lg) */}
        <div className="space-y-4 lg:col-span-2">
          <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
            <div>
              <h2 className="text-xl font-bold text-slate-900">Cola de Acción Prioritaria</h2>
              <p className="text-sm text-slate-500">Contactá, avanzá etapas y registrá seguimientos sin rodeos.</p>
            </div>

            {/* Selector de filtro de cola */}
            <div className="flex items-center gap-1 rounded-xl bg-slate-100 p-1">
              <button
                type="button"
                onClick={() => setActiveQueueFilter("all")}
                className={cn(
                  "rounded-lg px-3 py-1.5 text-xs font-bold transition-all",
                  activeQueueFilter === "all" ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-700"
                )}
              >
                Todos ({myLeads.length})
              </button>
              <button
                type="button"
                onClick={() => setActiveQueueFilter("overdue")}
                className={cn(
                  "rounded-lg px-3 py-1.5 text-xs font-bold transition-all",
                  activeQueueFilter === "overdue" ? "bg-rose-600 text-white shadow-sm" : "text-slate-500 hover:text-rose-600"
                )}
              >
                Vencidos ({overdueLeads.length})
              </button>
              <button
                type="button"
                onClick={() => setActiveQueueFilter("today")}
                className={cn(
                  "rounded-lg px-3 py-1.5 text-xs font-bold transition-all",
                  activeQueueFilter === "today" ? "bg-amber-500 text-slate-950 shadow-sm" : "text-slate-500 hover:text-amber-700"
                )}
              >
                Para Hoy ({todayLeads.length})
              </button>
              <button
                type="button"
                onClick={() => setActiveQueueFilter("new")}
                className={cn(
                  "rounded-lg px-3 py-1.5 text-xs font-bold transition-all",
                  activeQueueFilter === "new" ? "bg-blue-600 text-white shadow-sm" : "text-slate-500 hover:text-blue-600"
                )}
              >
                Nuevos ({newLeads.length})
              </button>
            </div>
          </div>

          {/* Buscador rápido */}
          <div className="relative">
            <Search className="absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Buscar por nombre, teléfono o lote..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="h-11 w-full rounded-xl border border-slate-200 bg-white pl-10 pr-4 text-sm font-medium text-slate-900 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100"
            />
          </div>

          {/* Tarjetas de Lead con Acciones de 1 Clic */}
          <div className="space-y-3">
            {priorityQueue.length === 0 ? (
              <div className="flex flex-col items-center justify-center rounded-3xl border-2 border-dashed border-slate-200 bg-slate-50 p-12 text-center">
                <CheckCircle2 className="size-12 text-emerald-500" />
                <p className="mt-3 text-base font-bold text-slate-800">¡Al día! No hay leads pendientes en esta lista.</p>
                <p className="mt-1 text-sm text-slate-500">Excelente trabajo. Podés revisar el catálogo o cargar nuevos interesados.</p>
              </div>
            ) : (
              priorityQueue.slice(0, 5).map(({ lead, state, isOverdue, isDueToday }) => {
                const cleanPhone = lead.phone?.replace(/\D/g, "");
                const candidatePropertyIds = (lead.propertyIds && lead.propertyIds.length > 0)
                  ? lead.propertyIds
                  : (lead.interests || []).map((i) => i.propertyId || i.unitId).filter(Boolean) as string[];
                const activePropId = selectedPropertyByLead[lead.id] || candidatePropertyIds[0];
                const matchedProperty = activePropId ? properties.find((p) => p.id === activePropId) : undefined;
                const matchedInterest = activePropId
                  ? lead.interests?.find((i) => i.propertyId === activePropId || i.unitId === activePropId)
                  : lead.interests?.[0];
                const matchedProject = matchedInterest?.projectId ? projects.find((proj) => proj.id === matchedInterest.projectId) : undefined;
                const displayTitle = matchedProperty?.title || matchedInterest?.propertyTitle || (matchedProject ? `Proyecto ${matchedProject.name}` : undefined);
                const displayPrice = matchedProperty
                  ? `${matchedProperty.currency} ${matchedProperty.price.toLocaleString()}`
                  : matchedInterest?.price
                  ? `${matchedInterest.currency || "USD"} ${matchedInterest.price.toLocaleString()}`
                  : undefined;
                const activePropStage = (matchedInterest?.status as Lead["stage"]) || lead.stage;
                const currentStageObj = STAGE_OPTIONS.find((s) => s.id === activePropStage) || STAGE_OPTIONS[0];

                const whatsappText = encodeURIComponent(
                  `Hola ${lead.name}, te escribo de Bellomo Inmobiliaria respecto a tu consulta${
                    displayTitle ? ` sobre ${displayTitle}` : ""
                  }. ¿Cómo estás?`
                );

                return (
                  <article
                    key={lead.id}
                    onClick={(e) => {
                      if ((e.target as HTMLElement).closest("button, a, select, input, label")) return;
                      router.push(`/admin/leads/${lead.id}`);
                    }}
                    className={cn(
                      "rounded-2xl border bg-white p-3.5 shadow-sm transition-all sm:p-5 dark:bg-card dark:border-border cursor-pointer hover:shadow-md",
                      isOverdue
                        ? "border-rose-200 hover:border-rose-400 dark:border-rose-900/60"
                        : isDueToday
                        ? "border-amber-200 hover:border-amber-400 dark:border-amber-900/60"
                        : "border-slate-200 hover:border-blue-300 dark:border-border"
                    )}
                  >
                    {/* Row 1: Avatar + Name + Origin + Urgency Badge + Stage Selector */}
                    <div className="flex items-center gap-2.5">
                      <Avatar className="size-9 shrink-0 border border-slate-200 dark:border-slate-800">
                        <AvatarFallback className="bg-slate-100 text-[10px] font-bold text-slate-700 dark:bg-slate-800 dark:text-slate-200">
                          {lead.name.slice(0, 2).toUpperCase()}
                        </AvatarFallback>
                      </Avatar>

                      <div className="min-w-0 flex-1">
                        <Link
                          href={`/admin/leads/${lead.id}`}
                          className="truncate text-sm font-bold text-slate-900 hover:text-blue-600 block leading-tight dark:text-slate-100 dark:hover:text-blue-400"
                        >
                          {lead.name}
                        </Link>
                        <div className="flex items-center gap-1.5 mt-0.5">
                          <span className="size-1.5 rounded-full bg-slate-300 dark:bg-slate-600 shrink-0" />
                          <span className="truncate text-[11px] text-slate-500 dark:text-slate-400">{lead.origin}</span>
                          {isOverdue && (
                            <span className="inline-flex items-center gap-0.5 rounded-full border border-rose-200 bg-rose-50 px-1.5 py-0.5 text-[9px] font-bold text-rose-700 dark:border-rose-900 dark:bg-rose-950/60 dark:text-rose-300 shrink-0 ml-auto">
                              <AlertTriangle className="size-2.5" />
                              {state.elapsedDays}d
                            </span>
                          )}
                          {isDueToday && !isOverdue && (
                            <span className="inline-flex items-center gap-0.5 rounded-full border border-amber-200 bg-amber-50 px-1.5 py-0.5 text-[9px] font-bold text-amber-800 dark:border-amber-900 dark:bg-amber-950/60 dark:text-amber-300 shrink-0 ml-auto">
                              <Clock3 className="size-2.5" />
                              Hoy
                            </span>
                          )}
                          {lead.stage === "new" && !isOverdue && !isDueToday && (
                            <span className="rounded-full border border-blue-200 bg-blue-50 px-1.5 py-0.5 text-[9px] font-bold text-blue-700 dark:border-blue-900 dark:bg-blue-950/60 dark:text-blue-300 shrink-0 ml-auto">
                              Nuevo
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Stage selector - compact on mobile */}
                      <div className="relative inline-flex items-center">
                        {updatingStageLeadId === lead.id && (
                          <span className="absolute left-2 top-1/2 -translate-y-1/2 flex items-center z-10 pointer-events-none">
                            <Loader2 className="size-3 animate-spin text-blue-600 dark:text-blue-400" />
                          </span>
                        )}
                        <select
                          disabled={updatingStageLeadId === lead.id}
                          value={activePropStage}
                          onChange={(e) => handleStageChange(lead.id, e.target.value as Lead["stage"], activePropId)}
                          className={cn(
                            "hidden sm:block h-7 shrink-0 rounded-lg border px-2 text-[11px] font-bold focus:outline-none focus:ring-2 focus:ring-blue-500 cursor-pointer shadow-2xs disabled:opacity-60 disabled:cursor-not-allowed",
                            updatingStageLeadId === lead.id && "pl-6",
                            currentStageObj.color
                          )}
                          title={matchedProperty ? `Etapa comercial para ${matchedProperty.title}` : "Etapa comercial del lead"}
                        >
                          {STAGE_OPTIONS.map((opt) => (
                            <option key={opt.id} value={opt.id} className="bg-white text-slate-800 dark:bg-slate-900 dark:text-slate-100 font-medium">
                              {opt.label}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>

                    {/* Switcher de Propiedades si el lead tiene múltiples intereses con estados independientes */}
                    {candidatePropertyIds.length > 1 && (
                      <div className="mt-2.5 flex items-center gap-1.5 overflow-x-auto pb-1">
                        <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 shrink-0">
                          Inmuebles ({candidatePropertyIds.length}):
                        </span>
                        {candidatePropertyIds.map((propId, idx) => {
                          const prop = properties.find((p) => p.id === propId);
                          const isSelected = activePropId === propId;
                          const propInterest = lead.interests?.find((i) => i.propertyId === propId || i.unitId === propId);
                          const pillTitle = prop?.title || propInterest?.propertyTitle || `Inmueble #${idx + 1}`;
                          const pillStage = (propInterest?.status as Lead["stage"]) || lead.stage;
                          const pillStageObj = STAGE_OPTIONS.find((s) => s.id === pillStage);
                          return (
                            <button
                              key={propId}
                              type="button"
                              onClick={() => setSelectedPropertyByLead((prev) => ({ ...prev, [lead.id]: propId }))}
                              className={cn(
                                "inline-flex items-center gap-1.5 px-2 py-1 rounded-lg text-[11px] font-semibold shrink-0 transition-all border shadow-2xs",
                                isSelected
                                  ? "border-blue-500 bg-blue-50 text-blue-900 font-bold dark:bg-blue-950/60 dark:text-blue-200 dark:border-blue-700"
                                  : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400"
                              )}
                            >
                              <span className="truncate max-w-[120px]">{pillTitle}</span>
                              {pillStageObj && (
                                <span className={cn(
                                  "text-[9px] font-bold px-1.5 py-0.5 rounded border leading-none",
                                  pillStageObj.color
                                )}>
                                  {pillStageObj.label}
                                </span>
                              )}
                            </button>
                          );
                        })}
                      </div>
                    )}

                    {/* Row 2: Property interest + price + stage (mobile stage selector) */}
                    <div className="mt-2.5 flex items-center gap-2">
                      {displayTitle ? (
                        <div className="flex items-center justify-between gap-2 flex-1 rounded-lg bg-slate-50 dark:bg-slate-900 px-2.5 py-1.5 border border-slate-100 dark:border-slate-800 text-xs min-w-0">
                          <div className="flex items-center gap-1.5 min-w-0">
                            <Building2 className="size-3.5 text-slate-400 shrink-0" />
                            <span className="font-semibold text-slate-800 dark:text-slate-200 truncate">{displayTitle}</span>
                          </div>
                          {displayPrice && (
                            <span className="font-bold text-blue-600 dark:text-blue-400 shrink-0 text-[11px]">
                              {displayPrice}
                            </span>
                          )}
                        </div>
                      ) : (
                        <div className="flex items-center gap-1.5 flex-1 rounded-lg bg-slate-50 dark:bg-slate-900 px-2.5 py-1.5 border border-slate-100 dark:border-slate-800 text-xs text-slate-400">
                          <Building2 className="size-3.5 text-slate-300 shrink-0" />
                          <span>Sin propiedad vinculada</span>
                        </div>
                      )}
                      {/* Mobile-only stage selector */}
                      <div className="relative inline-flex items-center sm:hidden shrink-0">
                        {updatingStageLeadId === lead.id && (
                          <span className="absolute left-1.5 top-1/2 -translate-y-1/2 flex items-center z-10 pointer-events-none">
                            <Loader2 className="size-3 animate-spin text-blue-600 dark:text-blue-400" />
                          </span>
                        )}
                        <select
                          disabled={updatingStageLeadId === lead.id}
                          value={activePropStage}
                          onChange={(e) => handleStageChange(lead.id, e.target.value as Lead["stage"], activePropId)}
                          className={cn(
                            "h-7 shrink-0 rounded-lg border px-1.5 text-[10px] font-bold focus:outline-none focus:ring-2 focus:ring-blue-500 cursor-pointer shadow-2xs max-w-[110px] disabled:opacity-60 disabled:cursor-not-allowed",
                            updatingStageLeadId === lead.id && "pl-5",
                            currentStageObj.color
                          )}
                        >
                          {STAGE_OPTIONS.map((opt) => (
                            <option key={opt.id} value={opt.id} className="bg-white text-slate-800 dark:bg-slate-900 dark:text-slate-100 font-medium">
                              {opt.label}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>

                    {/* Row 3: Contact data + last follow-up (compact) */}
                    <div className="mt-2 flex items-center justify-between gap-2 text-[11px] text-slate-500 dark:text-slate-400">
                      <div className="flex items-center gap-2.5">
                        {lead.phone && (
                          <span className="inline-flex items-center gap-1">
                            <Phone className="size-3 text-slate-400" />
                            {lead.phone}
                          </span>
                        )}
                        {lead.email && (
                          <span className="hidden sm:inline-flex items-center gap-1 truncate max-w-44">
                            <Mail className="size-3 text-slate-400" />
                            {lead.email}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <Clock3 className="size-3 text-slate-400" />
                        <span>{state.formattedDate ? `${state.formattedDate}` : "Sin contacto"}</span>
                      </div>
                    </div>

                    {/* Row 4: Action buttons */}
                    <div className="mt-2.5 pt-2 border-t border-slate-100 dark:border-slate-800">
                      {/* Mobile (< sm): tactile button row */}
                      <div className="flex items-center gap-1.5 sm:hidden">
                        {cleanPhone && (
                          <a
                            href={`https://wa.me/${cleanPhone}?text=${whatsappText}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex h-9 flex-1 items-center justify-center gap-1.5 rounded-xl bg-emerald-600 text-xs font-bold text-white shadow-xs active:bg-emerald-700"
                          >
                            <MessageCircle className="size-3.5" />
                            WhatsApp
                          </a>
                        )}
                        {lead.phone && (
                          <a
                            href={`tel:${lead.phone}`}
                            className="inline-flex h-9 items-center justify-center gap-1 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 text-xs font-bold text-slate-700 dark:text-slate-300 shadow-xs active:bg-slate-100"
                          >
                            <Phone className="size-3.5 text-blue-600" />
                          </a>
                        )}
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => setFollowUpLead(lead)}
                          className="h-9 flex-1 gap-1 rounded-xl border-blue-200 dark:border-blue-800 bg-blue-50/60 dark:bg-blue-950/30 text-xs font-bold text-blue-700 dark:text-blue-300 active:bg-blue-100"
                        >
                          <ClipboardCheck className="size-3.5" />
                          Seguimiento
                        </Button>
                        <Link
                          href={`/admin/leads/${lead.id}`}
                          className="inline-flex h-9 items-center justify-center rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-2.5 text-slate-500 dark:text-slate-400 shadow-xs active:bg-slate-100"
                          aria-label="Ver ficha completa"
                        >
                          <ChevronRight className="size-4" />
                        </Link>
                      </div>

                      {/* Desktop (>= sm): compact horizontal bar */}
                      <div className="hidden sm:flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          {cleanPhone && (
                            <a
                              href={`https://wa.me/${cleanPhone}?text=${whatsappText}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-emerald-600 px-3 text-xs font-bold text-white transition-colors hover:bg-emerald-700 shadow-sm"
                            >
                              <MessageCircle className="size-4" />
                              WhatsApp
                            </a>
                          )}

                          {lead.phone && (
                            <a
                              href={`tel:${lead.phone}`}
                              className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 text-xs font-bold text-slate-700 transition-colors hover:bg-slate-50 shadow-sm"
                            >
                              <Phone className="size-4 text-blue-600" />
                              Llamar
                            </a>
                          )}

                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => setFollowUpLead(lead)}
                            className="h-9 gap-1.5 rounded-lg border-blue-200 bg-blue-50/50 px-3 text-xs font-bold text-blue-700 hover:bg-blue-100 hover:text-blue-800"
                          >
                            <ClipboardCheck className="size-4" />
                            Registrar Seguimiento
                          </Button>
                        </div>

                        <Link
                          href={`/admin/leads/${lead.id}`}
                          className="inline-flex items-center gap-1 text-xs font-semibold text-slate-500 hover:text-slate-900"
                        >
                          Ver ficha completa <ChevronRight className="size-3.5" />
                        </Link>
                      </div>
                    </div>
                  </article>
                );
              })
            )}

            {priorityQueue.length > 5 && (
              <div className="pt-2 text-center">
                <Link href="/admin/leads">
                  <Button variant="outline" className="gap-2 rounded-xl text-xs font-bold">
                    Ver todos los leads ({priorityQueue.length}) <ArrowRight className="size-3.5" />
                  </Button>
                </Link>
              </div>
            )}
          </div>
        </div>

        {/* Columna Derecha: Mi Agenda Inmediata (1 columna en lg) */}
        <div className="space-y-6">
          {/* Citas y visitas de hoy / mañana */}
          <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <span className="flex size-8 items-center justify-center rounded-lg bg-purple-100 text-purple-700">
                  <Calendar className="size-4" />
                </span>
                <h3 className="font-bold text-slate-900">Agenda Próxima</h3>
              </div>
              <Link href="/admin/agenda" className="text-xs font-bold text-blue-600 hover:text-blue-700">
                Ver Agenda
              </Link>
            </div>

            <div className="mt-4 space-y-3">
              {scheduledVisitsToday.length === 0 ? (
                <div className="rounded-2xl bg-slate-50 p-4 text-center">
                  <CalendarDays className="mx-auto size-8 text-slate-300" />
                  <p className="mt-2 text-xs font-bold text-slate-700">No tenés citas agendadas para hoy</p>
                  <p className="mt-1 text-[11px] text-slate-500">
                    Aprovechá la mañana para llamar a los leads con seguimiento vencido.
                  </p>
                </div>
              ) : (
                scheduledVisitsToday.map((v, i) => (
                  <div key={i} className="rounded-xl border border-purple-100 bg-purple-50/40 p-3">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-purple-900">{v.lead.name}</span>
                      <span className="text-[10px] font-bold text-purple-600">
                        {v.scheduledAt ? new Date(v.scheduledAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "Hoy"}
                      </span>
                    </div>
                    {v.notes && <p className="mt-1 text-xs text-slate-600">{v.notes}</p>}
                    <div className="mt-2 flex items-center justify-between pt-1">
                      <Link
                        href={`/admin/leads/${v.lead.id}`}
                        className="text-[11px] font-semibold text-purple-700 hover:underline"
                      >
                        Ver cliente
                      </Link>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Card de Enfoque y Buenas Prácticas */}
          <div className="rounded-3xl border border-slate-200 bg-slate-50 p-5 shadow-sm">
            <div className="flex items-center gap-2">
              <span className="flex size-7 items-center justify-center rounded-lg bg-blue-600 text-white">
                <Lightbulb className="size-4" />
              </span>
              <h4 className="text-sm font-bold text-slate-900">Recomendación Comercial</h4>
            </div>
            <p className="mt-2 text-xs leading-5 text-slate-600">
              Un lead contactado en los primeros <span className="font-bold text-slate-900">15 minutos</span> de su consulta tiene un <span className="font-bold text-slate-900">70% más de probabilidad</span> de agendar una visita presencial al loteo o edificio.
            </p>
            <div className="mt-4 pt-3 border-t border-slate-200">
              <Link href="/admin/inventory-matrix" className="text-xs font-bold text-blue-700 hover:text-blue-800 flex items-center gap-1">
                Consultar Matriz de Lotes <ExternalLink className="size-3" />
              </Link>
            </div>
          </div>
        </div>
      </div>

      {/* Modal de Registro de Seguimiento en 1 Clic */}
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
          currentStage={(() => {
            const activePropId = selectedPropertyByLead[stageUpdateLead.id] || stageUpdateLead.propertyIds?.[0] || stageUpdateLead.interests?.[0]?.propertyId;
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


