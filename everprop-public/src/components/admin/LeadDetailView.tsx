"use client";

import { useEffect, useMemo, useState, type KeyboardEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  Building2,
  Calculator,
  ChevronDown,
  CircleAlert,
  CircleCheck,
  Clock3,
  Edit3,
  ExternalLink,
  Layers3,
  Mail,
  MessageCircle,
  MoreHorizontal,
  Phone,
  Plus,
  StickyNote,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";

import {
  leads as sampleLeads,
  projects as sampleProjects,
  properties as sampleProperties,
  type Lead,
  type LeadFollowUp,
  type LeadInterest,
  type LeadInterestCategory,
  type Project,
  type Property,
  type Visit,
} from "@/data/admin-sample";
import { getAdvisor } from "@/data/auth-sample";
import {
  appendLeadFollowUpToStorage,
  loadLeadFollowUpList,
  loadLeadList,
  loadProjectList,
  loadPropertyList,
  saveLeadList,
  savePropertyList,
} from "@/lib/admin-storage";
import {
  createInterestForProperty,
  getInterestAssetIds,
  getInterestPendingFields,
  normalizeLeadInterests,
  syncLeadWithInterests,
} from "@/lib/lead-interests";
import { useAuth } from "@/lib/auth-context";
import { createNotification } from "@/lib/notifications";
import { getLeadFollowUps, isCommercialContact } from "@/lib/lead-follow-up";
import { isMockDataMode } from "@/lib/data-mode";
import {
  loadEverpropLeads,
  deleteEverpropLead,
  loadEverpropLeadById,
  isLeadVersionConflict,
  LEAD_VERSION_CONFLICT_MESSAGE,
  loadEverpropCatalog,
  updateEverpropLead,
  loadEverpropLeadFollowUps,
  createEverpropLeadFollowUp,
  attachEverpropLeadProperty,
  detachEverpropLeadProperty,
  loadEverpropVisits,
  createEverpropVisit,
  cancelEverpropVisit,
} from "@/lib/everprop-api";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import VisitManager from "@/components/admin/VisitManager";
import FinancingCalculator from "@/components/admin/FinancingCalculator";
import { LeadInterestEditor } from "@/components/admin/LeadInterestEditor";
import { LeadProfileEditor } from "@/components/admin/LeadProfileEditor";
import { LeadAdvisorEditor } from "@/components/admin/LeadAdvisorEditor";
import { LeadFollowUpEditor } from "@/components/admin/LeadFollowUpEditor";
import { LeadFollowUpStatus } from "@/components/admin/LeadFollowUpStatus";
import { LeadFollowUpTimeline } from "@/components/admin/LeadFollowUpTimeline";
import { LeadStageUpdateModal } from "@/components/admin/LeadStageUpdateModal";
import { FINAL_DELIVERY_ENABLED } from "@/lib/release-visibility";
import { LeadFinancingAgreements } from "@/components/admin/LeadFinancingAgreements";

const CATEGORY_LABELS: Record<LeadInterestCategory, string> = {
  loteo: "Loteos",
  edificio: "Edificios",
  comercial: "Locales y cocheras",
};

const STAGE_LABELS: Record<string, string> = {
  new: "Nuevo",
  contacted: "Contactado",
  visiting: "Visita Agendada",
  negotiation: "Negociación",
  closing: "Cierre / Ganado",
  discarded: "Descartado",
};

const STAGE_STYLES: Record<string, string> = {
  new: "border-slate-300 bg-slate-100 text-slate-800 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200",
  contacted: "border-blue-300 bg-blue-100 text-blue-900 dark:border-blue-800 dark:bg-blue-950/80 dark:text-blue-200",
  visiting: "border-purple-300 bg-purple-100 text-purple-900 dark:border-purple-800 dark:bg-purple-950/80 dark:text-purple-200",
  negotiation: "border-amber-300 bg-amber-100 text-amber-900 dark:border-amber-800 dark:bg-amber-950/80 dark:text-amber-200",
  closing: "border-emerald-300 bg-emerald-100 text-emerald-900 dark:border-emerald-800 dark:bg-emerald-950/80 dark:text-emerald-200",
};

type InterestEditorState = { mode: "new" } | { mode: "edit"; interest: LeadInterest } | null;
type LeadDetailSection = "activity" | "interests" | "financing";

function formatMoney(amount: number, currency?: string | null) {
  const value = amount.toLocaleString("es-AR");
  return currency ? `${currency} ${value}` : `${value} (moneda no confirmada)`;
}

export default function LeadDetailView({ leadId }: { leadId: string }) {
  const { currentUser } = useAuth();
  const canAssign = currentUser?.role === "ADMIN" || currentUser?.role === "ROTATOR";
  const showFinancing = FINAL_DELIVERY_ENABLED && currentUser?.role !== "ROTATOR";
  const router = useRouter();
  const [allLeads, setAllLeads] = useState<Lead[]>([]);
  const [lead, setLead] = useState<Lead | null>(null);
  const [allProperties, setAllProperties] = useState<Property[]>([]);
  const [allProjects, setAllProjects] = useState<Project[]>([]);
  const [loadError, setLoadError] = useState("");
  const [followUps, setFollowUps] = useState<LeadFollowUp[]>([]);
  const [activeSection, setActiveSection] = useState<LeadDetailSection>("activity");
  const [railOpen, setRailOpen] = useState(false);
  const [advisorEditorOpen, setAdvisorEditorOpen] = useState(false);
  const [followUpEditorOpen, setFollowUpEditorOpen] = useState(false);
  const [profileEditorOpen, setProfileEditorOpen] = useState(false);
  const [interestEditor, setInterestEditor] = useState<InterestEditorState>(null);
  const [interestToDelete, setInterestToDelete] = useState<LeadInterest | null>(null);
  const [leadToDelete, setLeadToDelete] = useState(false);
  const [stageUpdateModalOpen, setStageUpdateModalOpen] = useState(false);

  useEffect(() => {
    let active = true;
    async function loadData() {
      if (!isMockDataMode) {
        try {
          const [singleLead, apiLeads, catalog, apiFollowUps, apiVisits] = await Promise.all([
            loadEverpropLeadById(leadId).catch(() => null),
            loadEverpropLeads().catch(() => []),
            loadEverpropCatalog(),
            loadEverpropLeadFollowUps(leadId),
            loadEverpropVisits(),
          ]);
          if (!active) return;
          const foundLead = singleLead ?? (apiLeads.find((candidate) => candidate.id === leadId) ?? null);
          setAllLeads(apiLeads.length > 0 ? apiLeads : (singleLead ? [singleLead] : []));
          setAllProperties(catalog.properties);
          setAllProjects(catalog.projects);
          setFollowUps(apiFollowUps);
          setLead(foundLead ? { ...foundLead, visits: apiVisits.filter((visit) => visit.leadId === leadId) } : null);
          return;
        } catch (e) {
          console.error("Error loading lead detail from API:", e);
          if (active) setLoadError("No se pudo cargar la ficha. Volvé a cargar la página para reintentar.");
          return;
        }
      }
      if (!active) return;
      const initialLeads = loadLeadList(sampleLeads, "c1");
      const foundLead = initialLeads.find((candidate) => candidate.id === leadId) ?? null;
      const companyId = foundLead?.companyId ?? "c1";
      setAllLeads(initialLeads);
      setAllProperties(loadPropertyList(sampleProperties, companyId));
      setAllProjects(loadProjectList(sampleProjects, companyId));
      setFollowUps(loadLeadFollowUpList([], companyId));
      setLead(foundLead);
    }
    void loadData();
    return () => {
      active = false;
    };
  }, [leadId]);

  const interests = useMemo(() => lead ? normalizeLeadInterests(lead, allProperties) : [], [allProperties, lead]);
  const projectById = useMemo(() => new Map(allProjects.map((project) => [project.id, project])), [allProjects]);
  const propertyById = useMemo(() => new Map(allProperties.map((property) => [property.id, property])), [allProperties]);

  function updateLeadData(nextLead: Lead) {
    if (!lead || nextLead.companyId !== lead.companyId) {
      toast.error("No se puede guardar información de otra empresa.");
      return;
    }
    const nextLeads = allLeads.map((candidate) => candidate.id === nextLead.id ? nextLead : candidate);
    if (isMockDataMode) saveLeadList(nextLeads, nextLead.companyId);
    setAllLeads(nextLeads);
    setLead(nextLead);
  }

  async function handleSaveProfile(nextLead: Lead) {
    if (!isMockDataMode) {
      try {
        const stageApiMap: Record<string, string> = {
          new: "NEW",
          contacted: "CONTACTED",
          visiting: "VISIT_SCHEDULED",
          negotiation: "NEGOTIATION",
          closing: "WON",
          discarded: "LOST",
        };
        const saved = await updateEverpropLead(nextLead.id, {
          name: nextLead.name,
          email: nextLead.email,
          phone: nextLead.phone,
          ...(nextLead.stage !== lead?.stage ? { stage: stageApiMap[nextLead.stage] || "NEW" } : {}),
          notes: nextLead.notes,
          version: nextLead.version,
        });
        const savedLead = { ...nextLead, version: saved?.version ?? nextLead.version };
        setLead(savedLead);
        setAllLeads(allLeads.map((c) => (c.id === nextLead.id ? savedLead : c)));
        setProfileEditorOpen(false);
        toast.success("Ficha del cliente actualizada en la base de datos");
        return;
      } catch (e: any) {
        if (isLeadVersionConflict(e) && lead) {
          // Show the other person's save behind the open editor; same key (lastActivity) keeps the draft mounted.
          const fresh = await loadEverpropLeadById(nextLead.id).catch(() => null);
          if (fresh) setLead({ ...fresh, lastActivity: lead.lastActivity });
          toast.warning(LEAD_VERSION_CONFLICT_MESSAGE);
          return;
        }
        toast.error("Error al actualizar lead: " + (e.message || "Error desconocido"));
        return;
      }
    }
    updateLeadData(nextLead);
    setProfileEditorOpen(false);
    toast.success("Ficha del cliente actualizada");
  }

  async function handleDeleteLead() {
    if (!lead) return;
    if (!isMockDataMode) {
      try {
        await deleteEverpropLead(lead.id);
        toast.success("Lead eliminado con éxito.");
        router.push("/admin/leads");
      } catch (e: any) {
        toast.error("Error al eliminar lead: " + (e.message || "Error desconocido"));
      }
      return;
    }
    const nextLeads = allLeads.filter((c) => c.id !== lead.id);
    saveLeadList(nextLeads, lead.companyId);
    toast.success("Lead eliminado.");
    router.push("/admin/leads");
  }

  async function handleSaveInterest(nextInterest: LeadInterest) {
    if (!lead || nextInterest.companyId !== lead.companyId) {
      toast.error("El interés no pertenece a la empresa activa.");
      return;
    }
    const nextInterests = interestEditor?.mode === "edit"
      ? interests.map((interest) => interest.id === nextInterest.id ? nextInterest : interest)
      : [...interests, nextInterest];
    const syncedLead = syncLeadWithInterests(lead, nextInterests, allProperties);

    const targetPropertyId = nextInterest.unitId || nextInterest.propertyId;
    if (!isMockDataMode && !targetPropertyId) {
      toast.error("Seleccioná un activo o unidad para guardar el interés.");
      return;
    }
    if (!isMockDataMode && targetPropertyId) {
      try {
        await attachEverpropLeadProperty(lead.id, targetPropertyId, {
          notes: [nextInterest.preferences, nextInterest.notes].filter(Boolean).join("\n\n") || undefined,
          replacesPropertyId: interestEditor?.mode === "edit" ? (interestEditor.interest.unitId || interestEditor.interest.propertyId) : undefined,
        });
      } catch (err: any) {
        toast.error(err instanceof Error ? err.message : "No se pudo guardar el interés.");
        return;
      }
    }

    if (isMockDataMode) updateLeadData(syncedLead);
    else {
      try {
        const savedLead = await loadEverpropLeadById(lead.id);
        if (savedLead) updateLeadData({ ...savedLead, visits: lead.visits });
      } catch {
        toast.warning("El interés quedó guardado. No se pudo actualizar la ficha; recargá para verlo.");
      }
    }
    setInterestEditor(null);
    toast.success(interestEditor?.mode === "edit" ? "Interés actualizado" : "Interés agregado");
  }

  async function handleDeleteInterest() {
    if (!lead || !interestToDelete) return;
    const nextInterests = interests.filter((interest) => interest.id !== interestToDelete.id);
    const syncedLead = syncLeadWithInterests(lead, nextInterests, allProperties);
    const targetPropertyId = interestToDelete.unitId || interestToDelete.propertyId;
    if (!isMockDataMode && targetPropertyId) {
      try {
        await detachEverpropLeadProperty(lead.id, targetPropertyId);
      } catch (err: any) {
        toast.error(err instanceof Error ? err.message : "No se pudo quitar el interés.");
        return;
      }
    }

    updateLeadData(syncedLead);
    setInterestToDelete(null);
    toast.success("Interés eliminado", { description: `${lead.name} continúa registrado y conserva sus demás intereses.` });
  }

  async function handleScheduleVisit(visit: Visit) {
    if (!lead) return;
    if (!isMockDataMode) {
      await createEverpropVisit({
        lead_id: lead.id,
        property_id: visit.propertyId,
        scheduled_at: visit.scheduledAt,
        notes: visit.notes,
      });
      try {
        const visits = await loadEverpropVisits();
        updateLeadData({ ...lead, visits: visits.filter((item) => item.leadId === lead.id) });
      } catch {
        toast.warning("La cita quedó guardada. No se pudo actualizar la agenda; recargá para verla.");
      }
      return;
    }
    const finalVisit: Visit = {
      ...visit,
      leadId: lead.id,
      leadName: lead.name,
      agentId: visit.agentId ?? lead.agentId,
    };
    const propertyId = visit.propertyId;
    let nextInterests = interests;
    if (propertyId && !getInterestAssetIds(interests).includes(propertyId)) {
      const property = allProperties.find((candidate) => candidate.id === propertyId);
      if (property) {
        nextInterests = [...interests, createInterestForProperty(lead, property)];
        if (!isMockDataMode) {
          attachEverpropLeadProperty(lead.id, propertyId).catch((err) =>
            console.error("Error linking property on visit:", err)
          );
        }
      }
    }
    const syncedLead = syncLeadWithInterests(lead, nextInterests, allProperties);
    const nextLead: Lead = { ...syncedLead, visits: [...(lead.visits ?? []), finalVisit], lastActivity: new Date().toISOString() };
    const nextProperties = propertyId
      ? allProperties.map((property) => property.id === propertyId ? { ...property, visits: [...(property.visits ?? []), finalVisit] } : property)
      : allProperties;
    const nextLeads = allLeads.map((candidate) => candidate.id === nextLead.id ? nextLead : candidate);
    setLead(nextLead);
    setAllLeads(nextLeads);
    setAllProperties(nextProperties);
    saveLeadList(nextLeads, lead.companyId);
    savePropertyList(nextProperties, lead.companyId);
    toast.success("Visita agendada y sincronizada con el activo");
  }

  async function handleReassignAgentConfirmed(agentId?: string) {
    if (!lead) return;
    const newAdvisor = isMockDataMode ? getAdvisor(agentId) : undefined;
    const updatedLead: Lead = {
      ...lead,
      agentId,
      agentName: newAdvisor?.name,
    };

    if (!isMockDataMode) {
      try {
        const saved = await updateEverpropLead(lead.id, {
          agentId: agentId || null,
        });
        updatedLead.agentName = undefined;
        updatedLead.version = saved?.version ?? updatedLead.version;
      } catch (err: any) {
        toast.error(err instanceof Error ? err.message : "No se pudo reasignar el lead.");
        return;
      }
    }

    updateLeadData(updatedLead);
    if (isMockDataMode && agentId) {
      try {
        const channel = new BroadcastChannel("everprop_events");
        channel.postMessage({ type: "LEAD_REASSIGNED", targetAgentId: agentId, leadName: lead.name });
        channel.close();
        createNotification(agentId, `Se te ha reasignado el lead "${lead.name}"`, {
          title: "Lead reasignado",
          leadId: lead.id,
          actionUrl: `/admin/leads/${lead.id}`,
          eventType: "LEAD_REASSIGNED",
        });
      } catch (error) {
        console.error(error);
      }
    }
    setAdvisorEditorOpen(false);
    toast.success(agentId ? "Asesor responsable actualizado" : "Lead dejado sin asignar");
  }

  async function handleSaveFollowUp(followUp: LeadFollowUp) {
    if (!lead || followUp.companyId !== lead.companyId || followUp.leadId !== lead.id) {
      toast.error("El seguimiento no pertenece al lead y la empresa activos.");
      return;
    }

    const recorded = isMockDataMode ? followUp : await createEverpropLeadFollowUp(lead.id, {
      type: followUp.type,
      occurredAt: followUp.occurredAt,
      summary: followUp.summary,
      result: followUp.result,
      nextAction: followUp.nextAction,
      nextContactAt: followUp.nextContactAt,
      agentId: followUp.agentId,
    });
    setFollowUps(isMockDataMode
      ? appendLeadFollowUpToStorage(recorded, followUps, lead.companyId)
      : [recorded, ...followUps]);

    let nextLead = lead;
    if (isMockDataMode && isCommercialContact(followUp) && followUp.nextContactAt) {
      const syntheticVisit: Visit = {
        id: `followup-${followUp.id}`,
        leadId: lead.id,
        leadName: lead.name,
        agentId: followUp.agentId,
        propertyId: undefined,
        scheduledAt: followUp.nextContactAt,
        status: "scheduled",
        notes: followUp.nextAction || `Próximo contacto · ${followUp.type}`,
        phone: lead.phone,
        email: lead.email,
      };
      nextLead = { ...lead, visits: [...(lead.visits ?? []), syntheticVisit] };
    }

    if (isCommercialContact(followUp)) {
      const previousTimestamp = nextLead.followUpUpdatedAt
        ? new Date(nextLead.followUpUpdatedAt).getTime()
        : Number.NEGATIVE_INFINITY;
      if (new Date(followUp.occurredAt).getTime() > previousTimestamp) {
        nextLead = { ...nextLead, followUpUpdatedAt: followUp.occurredAt };
      }
    }

    if (!isMockDataMode) {
      try {
        const visits = await loadEverpropVisits();
        nextLead = { ...nextLead, visits: visits.filter((visit) => visit.leadId === lead.id) };
      } catch {
        toast.warning("El seguimiento quedó guardado. No se pudo actualizar la agenda; recargá la página para verla.");
      }
    }
    if (nextLead !== lead) {
      updateLeadData(nextLead);
    }

    setFollowUpEditorOpen(false);
    toast.success(
      followUp.type === "note" ? "Nota agregada al historial" : "Seguimiento comercial registrado",
    );
    if (isCommercialContact(recorded)) setStageUpdateModalOpen(true);
  }

  async function handleConfirmStageUpdate(newStage: Exclude<Lead["stage"], "new">) {
    if (!lead) return;
    const stageApiMap: Record<string, string> = {
      contacted: "CONTACTED",
      visiting: "VISIT_SCHEDULED",
      negotiation: "NEGOTIATION",
      closing: "WON",
      discarded: "LOST",
    };
    const stageLabels: Record<string, string> = {
      contacted: "Contactado",
      visiting: "Visita Agendada",
      negotiation: "Negociación",
      closing: "Cierre / Ganado",
      discarded: "Descartado",
    };

    const updatedLead: Lead = {
      ...lead,
      stage: newStage,
      lastActivity: new Date().toISOString(),
    };
    if (!isMockDataMode) {
      try {
        const saved = await updateEverpropLead(lead.id, { stage: stageApiMap[newStage] || "CONTACTED" });
        updatedLead.version = saved?.version ?? updatedLead.version;
      } catch (err) {
        toast.error("No se pudo actualizar la etapa. Podés reintentar.");
        throw err;
      }
    }
    updateLeadData(updatedLead);
    setStageUpdateModalOpen(false);
    toast.success(`Etapa comercial actualizada a "${stageLabels[newStage] || newStage}"`);
  }

  if (loadError) return <p role="alert" className="rounded-xl border border-amber-500/40 p-4 text-sm">{loadError}</p>;
  if (!lead) return null;

  const generalPendingData = [
    !lead.phone ? "Teléfono" : null,
    !lead.email ? "Email" : null,
    !lead.notes ? "Notas generales" : null,
    interests.length === 0 ? "Interés inmobiliario" : null,
  ].filter((item): item is string => item !== null);
  const interestAssetIds = getInterestAssetIds(interests);
  const primaryProperty = interestAssetIds[0]
    ? (propertyById.get(interestAssetIds[0]) || allProperties.find((p) => p.id === interestAssetIds[0]))
    : undefined;
  const primaryProject = primaryProperty?.projectId
    ? allProjects.find((p) => p.id === primaryProperty.projectId)
    : interests[0]?.projectId
    ? allProjects.find((p) => p.id === interests[0].projectId)
    : undefined;
  const assignedAgent = isMockDataMode
    ? getAdvisor(lead.agentId, lead.agentName)
    : lead.agentId
    ? { name: lead.agentName || "Asesor asignado", role: "Asesor comercial" }
    : undefined;
  const leadFollowUpItems = getLeadFollowUps(followUps, lead.id, lead.companyId);
  const activeVisitsCount = (lead.visits ?? []).filter((visit) => visit.status !== "cancelled").length;

  const latestFollowUp = leadFollowUpItems[0];
  const nextStepTitle = !lead.agentId
    ? "Asigná un asesor"
    : latestFollowUp?.nextAction || (latestFollowUp || lead.followUpUpdatedAt ? "Definí el próximo contacto" : "Registrá el primer contacto");
  const nextStepDetail = !lead.agentId
    ? canAssign
      ? "Sin asesor no se puede registrar un seguimiento."
      : "Pedile a un administrador que lo asigne. Sin asesor no se puede registrar un seguimiento."
    : latestFollowUp?.nextContactAt
    ? new Date(latestFollowUp.nextContactAt).toLocaleString("es-AR", {
        timeZone: "America/Argentina/Buenos_Aires",
        dateStyle: "medium",
        timeStyle: "short",
      })
    : undefined;

  let cleanPhone = lead.phone ? lead.phone.replace(/[^0-9]/g, "") : "";
  if (cleanPhone && !cleanPhone.startsWith("54")) cleanPhone = "549" + cleanPhone;

  const navigationSections: Array<{
    id: LeadDetailSection;
    label: string;
    icon: typeof Clock3;
    badge?: number;
  }> = [
    { id: "activity", label: "Actividad", icon: Clock3, badge: leadFollowUpItems.length + activeVisitsCount },
    { id: "interests", label: "Intereses", icon: Building2, badge: interests.length },
    ...(showFinancing ? [{ id: "financing" as const, label: "Financiación", icon: Calculator }] : []),
  ];

  function handleTabKeyDown(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    const last = navigationSections.length - 1;
    const keyTargets: Record<string, number> = {
      ArrowRight: index === last ? 0 : index + 1,
      ArrowLeft: index === 0 ? last : index - 1,
      Home: 0,
      End: last,
    };
    const nextIndex = keyTargets[event.key];
    if (nextIndex === undefined) return;
    event.preventDefault();
    const nextSection = navigationSections[nextIndex].id;
    setActiveSection(nextSection);
    document.getElementById(`lead-tab-${nextSection}`)?.focus();
  }

  const priorityLabel =
    ({ low: "Baja", normal: "Normal", high: "Alta", urgent: "Urgente" } as Record<string, string>)[lead.priority?.toLowerCase() || ""] ||
    lead.priority ||
    "Sin informar";

  return (
    <div className="mi-day leads-workspace lead-detail mx-auto w-full max-w-[1500px] space-y-4 pb-28 md:pb-12">
      {/* Cabecera fija: identidad, etapa y acciones de contacto */}
      <header className="lead-record-header sticky z-20 flex flex-wrap items-center gap-3 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <Link
          href="/admin/leads"
          aria-label="Volver a Mis Leads"
          className="inline-flex size-11 shrink-0 items-center justify-center rounded-xl text-slate-600 hover:bg-slate-100 hover:text-blue-700 dark:text-slate-300 dark:hover:bg-slate-800"
        >
          <ArrowLeft className="size-4" aria-hidden="true" />
        </Link>
        <Avatar className="hidden size-10 shrink-0 rounded-xl bg-blue-600 text-sm font-bold text-white sm:flex">
          <AvatarFallback className="bg-blue-600 text-white">
            {lead.name.trim().split(/\s+/).slice(0, 2).map((part) => part[0]).join("")}
          </AvatarFallback>
        </Avatar>
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-3 gap-y-1 md:min-w-56">
          <h1 id="lead-name" title={lead.name} className="min-w-0 max-w-full truncate font-bold tracking-tight text-slate-950 dark:text-slate-100">
            {lead.name}
          </h1>
          <button
            type="button"
            aria-haspopup="dialog"
            aria-label={`Etapa: ${STAGE_LABELS[lead.stage] || lead.stage}. Cambiar etapa`}
            onClick={() => setStageUpdateModalOpen(true)}
            className={cn(
              "inline-flex min-h-11 max-w-full items-center gap-1 rounded-xl border px-3 text-left text-xs font-bold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500",
              STAGE_STYLES[lead.stage] || STAGE_STYLES.new,
            )}
          >
            {STAGE_LABELS[lead.stage] || lead.stage}
            <ChevronDown className="size-3.5" aria-hidden="true" />
          </button>
        </div>

        {/* En móvil esta botonera pasa a una barra fija abajo (admin-design.css) */}
        <div className="lead-record-actions ml-auto flex shrink-0 items-center gap-2">
          {lead.phone && (
            <a
              href={`tel:${lead.phone.replace(/[^+\d]/g, "")}`}
              className="inline-flex min-h-11 items-center justify-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 text-xs font-bold text-slate-800 transition-colors hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:hover:bg-slate-700"
            >
              <Phone className="size-4 text-blue-600 dark:text-blue-400" aria-hidden="true" />
              <span className="sr-only min-[1440px]:not-sr-only">Llamar</span>
            </a>
          )}
          {cleanPhone && (
            <a
              href={`https://wa.me/${cleanPhone}?text=${encodeURIComponent(
                `Hola ${lead.name}, te contacto de Bellomo Inmobiliaria respecto a tu consulta${
                  interests[0]?.propertyTitle ? ` sobre ${interests[0].propertyTitle}` : ""
                }. ¿Cómo estás?`
              )}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex min-h-11 items-center justify-center gap-1.5 rounded-xl border border-emerald-200 bg-emerald-50 px-3 text-xs font-bold text-emerald-700 transition-colors hover:bg-emerald-100 dark:border-emerald-900 dark:bg-emerald-950/50 dark:text-emerald-300 dark:hover:bg-emerald-950"
            >
              <MessageCircle className="size-4" aria-hidden="true" />
              <span className="sr-only min-[1440px]:not-sr-only">WhatsApp</span>
            </a>
          )}
          <Button
            onClick={() => setFollowUpEditorOpen(true)}
            disabled={!lead.agentId}
            className="min-h-11 gap-1.5 rounded-xl bg-blue-600 px-4 text-xs font-bold text-white shadow-sm hover:bg-blue-700 disabled:opacity-50"
          >
            <Plus className="size-4" aria-hidden="true" />
            <span className="2xl:hidden">Seguimiento</span>
            <span className="hidden 2xl:inline">Registrar seguimiento</span>
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger
              aria-label="Más acciones"
              className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-700 transition-colors hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
            >
              <MoreHorizontal className="size-4" aria-hidden="true" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              <DropdownMenuItem className="min-h-11" onClick={() => router.push(`/admin/leads/${lead.id}/edit`)}>
                <Edit3 aria-hidden="true" /> Editar ficha
              </DropdownMenuItem>
              {currentUser?.role === "ADMIN" && (
                <DropdownMenuItem className="min-h-11" variant="destructive" onClick={() => setLeadToDelete(true)}>
                  <Trash2 aria-hidden="true" /> Eliminar cliente
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </header>

      <div className="grid grid-cols-1 items-start gap-4 xl:grid-cols-[18.75rem_minmax(0,1fr)]">
        {/* Columna de gestión: siempre visible en escritorio, desplegable en móvil */}
        <aside
          aria-label="Gestión del cliente"
          className="lead-record-rail rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900"
        >
          <button
            type="button"
            aria-expanded={railOpen}
            aria-controls="lead-rail-content"
            onClick={() => setRailOpen((open) => !open)}
            className="flex min-h-11 w-full items-center justify-between gap-2 rounded-2xl px-4 py-2 text-left text-xs font-bold text-slate-900 xl:hidden dark:text-slate-100"
          >
            <span>
              Datos del cliente{generalPendingData.length > 0 ? ` · ${generalPendingData.length === 1 ? "falta 1" : `faltan ${generalPendingData.length}`}` : ""}
            </span>
            <ChevronDown className={cn("size-4 shrink-0 transition-transform", railOpen && "rotate-180")} aria-hidden="true" />
          </button>
          <div id="lead-rail-content" className={cn("space-y-5 p-4", railOpen ? "block" : "hidden", "xl:block")}>
            <section aria-labelledby="lead-rail-management">
              <h2 id="lead-rail-management" className="text-sm font-bold text-slate-900 dark:text-slate-100">Gestión</h2>
              <dl className="mt-2 divide-y divide-slate-100 text-xs dark:divide-slate-800">
                <div className="flex min-h-11 items-center justify-between gap-3 py-1.5">
                  <dt className="font-semibold text-slate-500 dark:text-slate-400">Asesor</dt>
                  <dd className="flex min-w-0 items-center gap-2 text-right font-bold text-slate-900 dark:text-slate-100">
                    <span className="min-w-0">{assignedAgent?.name ?? "Sin asignar"}</span>
                    {canAssign && (
                      <button
                        type="button"
                        onClick={() => setAdvisorEditorOpen(true)}
                        className="min-h-11 shrink-0 rounded-lg px-2 font-bold text-blue-700 hover:bg-blue-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 dark:text-blue-400 dark:hover:bg-blue-950/40"
                      >
                        {lead.agentId ? "Cambiar" : "Asignar"}
                      </button>
                    )}
                  </dd>
                </div>
                <div className="flex items-center justify-between gap-3 py-2.5">
                  <dt className="font-semibold text-slate-500 dark:text-slate-400">Presupuesto</dt>
                  <dd className="text-right font-bold text-slate-900 dark:text-slate-100">
                    {lead.budget != null ? formatMoney(lead.budget, lead.currency) : "Sin informar"}
                  </dd>
                </div>
                <div className="flex items-center justify-between gap-3 py-2.5">
                  <dt className="font-semibold text-slate-500 dark:text-slate-400">Prioridad</dt>
                  <dd className="text-right font-bold text-slate-900 dark:text-slate-100">{priorityLabel}</dd>
                </div>
                <div className="flex items-center justify-between gap-3 py-2.5">
                  <dt className="font-semibold text-slate-500 dark:text-slate-400">Origen</dt>
                  <dd className="text-right font-bold text-slate-900 dark:text-slate-100">{lead.origin}</dd>
                </div>
              </dl>
            </section>

            <section aria-labelledby="lead-rail-contact">
              <h2 id="lead-rail-contact" className="text-sm font-bold text-slate-900 dark:text-slate-100">Contacto</h2>
              <ul className="mt-2 space-y-1.5 text-xs text-slate-700 dark:text-slate-300">
                <li className="flex items-center gap-2">
                  <Phone className="size-3.5 shrink-0 text-slate-400" aria-hidden="true" />
                  <span>{lead.phone || "Teléfono sin informar"}</span>
                </li>
                <li className="flex items-center gap-2">
                  <Mail className="size-3.5 shrink-0 text-slate-400" aria-hidden="true" />
                  <span className="lead-email min-w-0">{lead.email || "Email sin informar"}</span>
                </li>
              </ul>
            </section>

            {lead.notes && (
              <section aria-labelledby="lead-rail-notes">
                <h2 id="lead-rail-notes" className="flex items-center gap-1.5 text-sm font-bold text-slate-900 dark:text-slate-100">
                  <StickyNote className="size-3.5" aria-hidden="true" /> Notas generales
                </h2>
                <p className="mt-2 whitespace-pre-wrap text-xs leading-5 text-slate-700 dark:text-slate-300">{lead.notes}</p>
              </section>
            )}

            <section role="status" className="border-t border-slate-100 pt-4 dark:border-slate-800">
              {generalPendingData.length > 0 ? (
                <>
                  <h2 className="flex items-center gap-1.5 text-sm font-bold text-amber-900 dark:text-amber-200">
                    <CircleAlert className="size-3.5 shrink-0" aria-hidden="true" />
                    {generalPendingData.length === 1 ? "Falta 1 dato" : `Faltan ${generalPendingData.length} datos`}
                  </h2>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {generalPendingData.map((item) => (
                      <span
                        key={item}
                        className="rounded-md border border-amber-200 bg-amber-50 px-2 py-0.5 text-xs font-semibold text-amber-900 dark:border-amber-900 dark:bg-amber-950/60 dark:text-amber-200"
                      >
                        {item}
                      </span>
                    ))}
                  </div>
                  <Link
                    href={`/admin/leads/${lead.id}/edit`}
                    className="mt-2 inline-flex min-h-11 items-center gap-1.5 text-xs font-bold text-blue-700 hover:underline dark:text-blue-400"
                  >
                    <Edit3 className="size-3.5" aria-hidden="true" /> Completar ficha
                  </Link>
                </>
              ) : (
                <p className="flex items-center gap-1.5 text-xs font-semibold text-emerald-800 dark:text-emerald-300">
                  <CircleCheck className="size-4 shrink-0" aria-hidden="true" /> Información general completa
                </p>
              )}
            </section>
          </div>
        </aside>

        <div className="min-w-0 space-y-4">
          {/* Próximo paso: sin asesor es un bloqueo y se resuelve acá mismo */}
          <section
            aria-labelledby="lead-next-step-title"
            className={cn(
              "flex flex-wrap items-center justify-between gap-3 rounded-2xl border p-4",
              lead.agentId
                ? "border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900"
                : "border-amber-200 bg-amber-50 dark:border-amber-900/60 dark:bg-amber-950/20",
            )}
          >
            <div className="min-w-0 flex-1 basis-56">
              <p className="text-xs font-semibold text-slate-500 dark:text-slate-400">Próximo paso</p>
              <h2 id="lead-next-step-title" className="text-sm font-bold text-slate-900 dark:text-slate-100">{nextStepTitle}</h2>
              {nextStepDetail && <p className="mt-0.5 text-xs text-slate-600 dark:text-slate-300">{nextStepDetail}</p>}
            </div>
            {lead.agentId ? (
              <LeadFollowUpStatus
                compact
                leadId={lead.id}
                companyId={lead.companyId}
                followUps={followUps}
                legacyUpdatedAt={lead.followUpUpdatedAt}
              />
            ) : canAssign ? (
              <Button
                variant="outline"
                onClick={() => setAdvisorEditorOpen(true)}
                className="min-h-11 rounded-xl px-4 text-xs font-bold dark:border-slate-700"
              >
                Asignar asesor
              </Button>
            ) : null}
          </section>

          <div
            role="tablist"
            aria-label="Apartados de la ficha del cliente"
            className="flex flex-wrap border-b sm:gap-1 border-slate-200 dark:border-slate-800"
          >
            {navigationSections.map((section, index) => {
              const Icon = section.icon;
              const isActive = activeSection === section.id;
              return (
                <button
                  key={section.id}
                  type="button"
                  role="tab"
                  id={`lead-tab-${section.id}`}
                  aria-selected={isActive}
                  aria-controls={`lead-panel-${section.id}`}
                  tabIndex={isActive ? 0 : -1}
                  onClick={() => setActiveSection(section.id)}
                  onKeyDown={(event) => handleTabKeyDown(event, index)}
                  className={cn(
                    "-mb-px inline-flex min-h-11 shrink-0 items-center gap-2 whitespace-nowrap border-b-2 px-2 text-xs font-bold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-500",
                    isActive
                      ? "border-blue-600 text-blue-700 dark:border-blue-400 dark:text-blue-300"
                      : "border-transparent text-slate-600 hover:text-slate-900 dark:text-slate-300 dark:hover:text-white",
                  )}
                >
                  <Icon className="hidden size-4 shrink-0 sm:block" aria-hidden="true" />
                  {section.label}
                  {section.badge !== undefined && (
                    <span className="hidden rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-bold text-slate-700 sm:inline dark:bg-slate-800 dark:text-slate-300">
                      {section.badge}
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          {activeSection === "activity" && (
            <div id="lead-panel-activity" role="tabpanel" aria-labelledby="lead-tab-activity" className="space-y-4">
              <section
                aria-labelledby="lead-follow-up-timeline-title"
                className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900"
              >
                <h2 id="lead-follow-up-timeline-title" className="text-base font-bold text-slate-900 dark:text-slate-100">
                  Historial de contacto
                </h2>
                <div className="mt-4">
                  <LeadFollowUpTimeline leadId={lead.id} companyId={lead.companyId} followUps={followUps} legacyUpdatedAt={lead.followUpUpdatedAt} />
                </div>
              </section>
              <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <VisitManager
            title="Gestión de visitas y citas"
            subtitle="Agendá citas para cualquiera de sus activos de interés."
            visits={lead.visits ?? []}
            onSchedule={handleScheduleVisit}
            onDelete={async (visitId) => {
              if (!isMockDataMode) await cancelEverpropVisit(visitId);
              updateLeadData({
                ...lead,
                visits: (lead.visits ?? []).map((visit) =>
                  visit.id === visitId ? { ...visit, status: "cancelled" as const } : visit
                ),
              });
            }}
            defaultGuestName={lead.name}
            defaultPhone={lead.phone}
            defaultEmail={lead.email}
            defaultAgentId={lead.agentId}
            propertyOptions={allProperties.filter((property) => interestAssetIds.includes(property.id))}
          />
              </section>
            </div>
          )}

      {activeSection === "interests" && (
        <section
          id="lead-panel-interests"
          role="tabpanel"
          aria-labelledby="lead-tab-interests"
          className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 shadow-sm sm:p-6"
        >
          <div className="flex flex-col gap-3 border-b border-slate-200 dark:border-slate-800 pb-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 id="lead-interests-title" className="mt-1 text-lg font-bold tracking-tight text-slate-950 dark:text-slate-100">
                Intereses del cliente
              </h2>
              <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                Cada ficha conserva su propio proyecto, activo, unidad, preferencias y notas.
              </p>
            </div>
            <Button
              onClick={() => setInterestEditor({ mode: "new" })}
              className="min-h-11 w-full gap-1.5 bg-blue-600 px-4 text-xs font-semibold text-white hover:bg-blue-700 sm:w-auto shadow-sm"
            >
              <Plus className="size-3.5" aria-hidden="true" /> Agregar interés
            </Button>
          </div>

          {interests.length === 0 ? (
            <div className="mt-5 flex min-h-48 flex-col items-center justify-center rounded-2xl border-2 border-dashed border-slate-300 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/40 p-6 text-center">
              <Layers3 className="size-8 text-slate-400" aria-hidden="true" />
              <h3 className="mt-3 text-base font-bold text-slate-950 dark:text-slate-100">Todavía no hay intereses cargados</h3>
              <p className="mt-1 max-w-md text-xs text-slate-500 dark:text-slate-400">
                Seleccioná un activo o unidad para registrar el interés del cliente.
              </p>
            </div>
          ) : (
            <div className="mt-5 grid gap-4 md:grid-cols-2">
              {interests.map((interest, index) => {
                const project = interest.projectId ? projectById.get(interest.projectId) : undefined;
                const property = interest.propertyId ? propertyById.get(interest.propertyId) : undefined;
                const unit = interest.unitId ? propertyById.get(interest.unitId) : undefined;
                const pendingFields = getInterestPendingFields(interest);
                return (
                  <article
                    key={interest.id}
                    className="flex min-h-full flex-col rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-800/40 p-4 sm:p-5"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-xs font-bold uppercase tracking-wider text-blue-700 dark:text-blue-400">
                          Interés {index + 1}
                        </p>
                        <h3 className="mt-1 text-base font-bold text-slate-950 dark:text-slate-100">
                          {interest.category ? CATEGORY_LABELS[interest.category] : "Sin categoría"}
                        </h3>
                      </div>
                      <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-white dark:bg-slate-900 text-blue-700 dark:text-blue-400 shadow-sm border border-slate-100 dark:border-slate-800">
                        <Building2 className="size-4" aria-hidden="true" />
                      </span>
                    </div>
                    <dl className="mt-3.5 space-y-2 text-xs">
                      <div>
                        <dt className="font-semibold text-slate-500 dark:text-slate-400">Proyecto</dt>
                        <dd className="font-bold text-slate-900 dark:text-slate-100">{project?.name || interest.projectName || "Sin informar"}</dd>
                      </div>
                      <div>
                        <dt className="font-semibold text-slate-500 dark:text-slate-400">Activo</dt>
                        <dd className="font-bold text-slate-900 dark:text-slate-100">{property?.title || interest.propertyTitle || "Sin informar"}</dd>
                      </div>
                      <div>
                        <dt className="font-semibold text-slate-500 dark:text-slate-400">Unidad</dt>
                        <dd className="font-bold text-slate-900 dark:text-slate-100">
                          {unit
                            ? `${unit.unitNumber || unit.title}${unit.sectorName ? ` · ${unit.sectorName}` : ""}`
                            : [interest.unitNumber, interest.sectorName].filter(Boolean).join(" · ") || "Sin informar"}
                        </dd>
                      </div>
                      <div>
                        <dt className="font-semibold text-slate-500 dark:text-slate-400">Precio</dt>
                        <dd>{interest.price != null ? formatMoney(interest.price, interest.currency) : "Sin informar"}</dd>
                      </div>
                      <div>
                        <dt className="font-semibold text-slate-500 dark:text-slate-400">Estado / interés</dt>
                        <dd>
                          {STAGE_LABELS[interest.status as keyof typeof STAGE_LABELS] || interest.status || "Sin informar"} ·{" "}
                          {({ LOW: "Bajo", MEDIUM: "Medio", HIGH: "Alto" } as Record<string, string>)[interest.interestLevel || ""] ||
                            interest.interestLevel ||
                            "Sin informar"}
                        </dd>
                      </div>
                    </dl>
                    <div className="mt-3.5 space-y-2 border-t border-slate-200 dark:border-slate-800 pt-3 text-xs">
                      <div>
                        <p className="font-semibold text-slate-500 dark:text-slate-400">Preferencias</p>
                        <p className="whitespace-pre-wrap text-slate-700 dark:text-slate-300">{interest.preferences || "Sin informar"}</p>
                      </div>
                      <div>
                        <p className="font-semibold text-slate-500 dark:text-slate-400">Notas</p>
                        <p className="whitespace-pre-wrap text-slate-700 dark:text-slate-300">{interest.notes || "Sin informar"}</p>
                      </div>
                    </div>
                    <div className="mt-3">
                      <p className="text-xs font-bold text-amber-800 dark:text-amber-300">Datos sin informar</p>
                      <div className="mt-1.5 flex flex-wrap gap-1.5">
                        {pendingFields.length > 0 ? (
                          pendingFields.map((field) => (
                            <span
                              key={field}
                              className="rounded-md border border-amber-200 dark:border-amber-900 bg-amber-50 dark:bg-amber-950/40 px-2 py-0.5 text-xs font-medium text-amber-900 dark:text-amber-200"
                            >
                              {field}
                            </span>
                          ))
                        ) : (
                          <span className="rounded-md border border-emerald-200 dark:border-emerald-900 bg-emerald-50 dark:bg-emerald-950/40 px-2 py-0.5 text-xs font-medium text-emerald-800 dark:text-emerald-300">
                            Ficha completa
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="mt-auto grid grid-cols-2 gap-2 pt-4">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setInterestEditor({ mode: "edit", interest })}
                        className="min-h-11 gap-1.5 text-xs font-semibold dark:border-slate-800 dark:text-slate-300 dark:hover:bg-slate-800"
                      >
                        <Edit3 className="size-3.5" aria-hidden="true" /> Editar
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setInterestToDelete(interest)}
                        className="min-h-11 gap-1.5 border-rose-200 dark:border-rose-900 text-xs font-semibold text-rose-700 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/30 hover:text-rose-800"
                      >
                        <Trash2 className="size-3.5" aria-hidden="true" /> Eliminar
                      </Button>
                    </div>
                    {(property || unit || interest.propertyId || interest.unitId) && (
                      <Link
                        href={`/admin/properties/${(unit ?? property)?.id || interest.propertyId || interest.unitId}`}
                        className="mt-2.5 inline-flex min-h-11 items-center justify-center gap-1.5 rounded-lg py-1.5 text-xs font-semibold text-blue-700 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-950/40 transition-colors"
                      >
                        Ver activo <ExternalLink className="size-3.5" aria-hidden="true" />
                      </Link>
                    )}
                  </article>
                );
              })}
            </div>
          )}
        </section>
      )}

      {activeSection === "financing" && showFinancing && (
        <div
          id="lead-panel-financing"
          role="tabpanel"
          aria-labelledby="lead-tab-financing"
          className="space-y-6"
        >
          <div id="financing-agreements">
            <LeadFinancingAgreements
              leadId={lead.id}
              leadName={lead.name}
              leadPhone={lead.phone}
              companyId={lead.companyId}
              advisorId={lead.agentId}
              leadProjects={Array.from(new Set(interests.map((i) => i.projectId).filter(Boolean))).map((id) => ({
                id: id as string,
                title: projectById.get(id as string)?.name || "Proyecto",
              }))}
              leadAssets={interests
                .map((i) => ({
                  id: i.propertyId || i.id,
                  title: i.propertyTitle || propertyById.get(i.propertyId || "")?.title || "Activo",
                  projectId: i.projectId,
                }))
                .filter((a) => a.title)}
              onScrollToInterests={() => setActiveSection("interests")}
            />
          </div>

          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900 sm:p-6">
            <h2 className="mb-4 text-lg font-bold text-slate-900 dark:text-slate-100">Calculadora de financiación</h2>
            <FinancingCalculator
              key={`${lead.id}-${primaryProperty?.id ?? "none"}`}
              defaultPrice={primaryProperty?.price}
              defaultCurrency={(primaryProperty?.currency as "USD" | "ARS") ?? "USD"}
              leadName={lead.name}
              leadId={lead.id}
              advisorId={lead.agentId}
              propertyTitle={primaryProperty?.title}
              projectName={primaryProject?.name}
              companyId={lead.companyId}
              onPlanCreated={() => {
                if (typeof window !== "undefined") {
                  window.dispatchEvent(new Event("everprop_agreements_updated"));
                }
              }}
            />
          </section>
        </div>
      )}
        </div>
      </div>

      {profileEditorOpen && <LeadProfileEditor key={lead.lastActivity} lead={lead} onClose={() => setProfileEditorOpen(false)} onSave={handleSaveProfile} />}
      {interestEditor && <LeadInterestEditor key={interestEditor.mode === "edit" ? interestEditor.interest.id : "new-interest"} companyId={lead.companyId} interest={interestEditor.mode === "edit" ? interestEditor.interest : undefined} projects={allProjects} properties={allProperties} onClose={() => setInterestEditor(null)} onSave={handleSaveInterest} />}
      {followUpEditorOpen && <LeadFollowUpEditor className="mi-day leads-workspace" lead={lead} onClose={() => setFollowUpEditorOpen(false)} onConfirm={handleSaveFollowUp} />}
      {lead && (
        <LeadStageUpdateModal
          open={stageUpdateModalOpen}
          leadName={lead.name}
          currentStage={lead.stage}
          onClose={() => setStageUpdateModalOpen(false)}
          onConfirm={handleConfirmStageUpdate}
        />
      )}
      {advisorEditorOpen && canAssign && <LeadAdvisorEditor leadName={lead.name} currentAgentId={lead.agentId} onClose={() => setAdvisorEditorOpen(false)} onSave={handleReassignAgentConfirmed} />}

      <Dialog open={Boolean(interestToDelete)} onOpenChange={(open) => !open && setInterestToDelete(null)}>
        <DialogContent showCloseButton={false} className="mi-day leads-workspace lead-review sm:max-w-lg dark:border-slate-800 dark:bg-slate-900">
          <DialogHeader>
            <DialogTitle className="dark:text-slate-100">Eliminar este interés</DialogTitle>
            <DialogDescription className="dark:text-slate-400">
              Se quitará el interés de {lead.name}: {interestToDelete?.projectName || "Sin proyecto"} · {interestToDelete?.propertyTitle || interestToDelete?.propertyId || "Sin activo"} · Unidad {interestToDelete?.unitId || "sin informar"}. El cliente y sus demás intereses se conservan.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="mt-4 gap-2">
            <Button variant="outline" onClick={() => setInterestToDelete(null)} className="dark:border-slate-800 dark:text-slate-300 dark:hover:bg-slate-800">
              Cancelar
            </Button>
            <Button variant="destructive" onClick={handleDeleteInterest}>
              Eliminar interés
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={leadToDelete} onOpenChange={(open) => !open && setLeadToDelete(false)}>
        <DialogContent showCloseButton={false} className="mi-day leads-workspace lead-review sm:max-w-lg dark:border-slate-800 dark:bg-slate-900">
          <DialogHeader>
            <DialogTitle className="dark:text-slate-100">Eliminar este cliente</DialogTitle>
            <DialogDescription className="dark:text-slate-400">
              Eliminar a {lead.name} · Teléfono: {lead.phone || "Sin informar"} · Correo: {lead.email || "Sin informar"} · Origen: {lead.origin} · Etapa: {STAGE_LABELS[lead.stage]} · Asesor: {assignedAgent?.name || "Sin asignar"} · Intereses: {interests.length}. Esta acción no se puede deshacer.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="mt-4 gap-2">
            <Button variant="outline" onClick={() => setLeadToDelete(false)} className="dark:border-slate-800 dark:text-slate-300 dark:hover:bg-slate-800">
              Cancelar
            </Button>
            <Button variant="destructive" onClick={handleDeleteLead}>
              Eliminar cliente
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
