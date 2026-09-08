"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Building2, CircleAlert, CircleCheck, ClipboardCheck, Edit3, ExternalLink, Layers3, Plus, StickyNote, Trash2 } from "lucide-react";
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
import { MOCK_USERS, getAdvisor } from "@/data/auth-sample";
import {
  appendLeadFollowUpToStorage,
  loadLeadFollowUpList,
  loadLeadList,
  loadProjectList,
  loadPropertyList,
  saveLeadList,
  savePropertyList,
  updateLeadAgent,
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
import { isCommercialContact } from "@/lib/lead-follow-up";
import { isMockDataMode } from "@/lib/data-mode";
import {
  loadEverpropLeads,
  loadEverpropLeadById,
  loadEverpropCatalog,
  updateEverpropLead,
  loadEverpropLeadFollowUps,
  createEverpropLeadFollowUp,
  attachEverpropLeadProperty,
  detachEverpropLeadProperty,
} from "@/lib/everprop-api";
import { deferEffectUpdate } from "@/lib/deferred-effect";
import { Button } from "@/components/ui/button";
import Badge from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
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

const CATEGORY_LABELS: Record<LeadInterestCategory, string> = {
  loteo: "Loteos",
  local: "Locales",
  cochera: "Cocheras",
  tradicional: "Inmobiliaria tradicional",
};

type InterestEditorState = { mode: "new" } | { mode: "edit"; interest: LeadInterest } | null;

export default function LeadDetailView({ leadId }: { leadId: string }) {
  const { currentUser } = useAuth();
  const [allLeads, setAllLeads] = useState<Lead[]>([]);
  const [lead, setLead] = useState<Lead | null>(null);
  const [allProperties, setAllProperties] = useState<Property[]>([]);
  const [allProjects, setAllProjects] = useState<Project[]>([]);
  const [followUps, setFollowUps] = useState<LeadFollowUp[]>([]);
  const [advisorEditorOpen, setAdvisorEditorOpen] = useState(false);
  const [followUpEditorOpen, setFollowUpEditorOpen] = useState(false);
  const [profileEditorOpen, setProfileEditorOpen] = useState(false);
  const [interestEditor, setInterestEditor] = useState<InterestEditorState>(null);
  const [interestToDelete, setInterestToDelete] = useState<LeadInterest | null>(null);
  const [stageUpdateModalOpen, setStageUpdateModalOpen] = useState(false);

  useEffect(() => {
    let active = true;
    async function loadData() {
      if (!isMockDataMode) {
        try {
          const [singleLead, apiLeads, catalog, apiFollowUps] = await Promise.all([
            loadEverpropLeadById(leadId).catch(() => null),
            loadEverpropLeads().catch(() => []),
            loadEverpropCatalog().catch(() => ({ properties: sampleProperties, projects: sampleProjects })),
            loadEverpropLeadFollowUps(leadId).catch(() => []),
          ]);
          if (!active) return;
          const foundLead = singleLead ?? (apiLeads.find((candidate) => candidate.id === leadId) ?? null);
          setAllLeads(apiLeads.length > 0 ? apiLeads : (singleLead ? [singleLead] : []));
          setAllProperties(catalog.properties);
          setAllProjects(catalog.projects);
          const localFollowUps = loadLeadFollowUpList([], foundLead?.companyId ?? "c1").filter((f) => f.leadId === leadId);
          setFollowUps(apiFollowUps.length > 0 ? apiFollowUps : localFollowUps);
          setLead(foundLead);
          return;
        } catch (e) {
          console.error("Error loading lead detail from API:", e);
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
    saveLeadList(nextLeads, nextLead.companyId);
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
        };
        await updateEverpropLead(nextLead.id, {
          name: nextLead.name,
          email: nextLead.email,
          phone: nextLead.phone,
          stage: stageApiMap[nextLead.stage] || "NEW",
          notes: nextLead.notes,
        });
        setLead(nextLead);
        setAllLeads(allLeads.map((c) => (c.id === nextLead.id ? nextLead : c)));
        setProfileEditorOpen(false);
        toast.success("Ficha del cliente actualizada en la base de datos");
        return;
      } catch (e: any) {
        toast.error("Error al actualizar lead: " + (e.message || "Error desconocido"));
        return;
      }
    }
    updateLeadData(nextLead);
    setProfileEditorOpen(false);
    toast.success("Ficha del cliente actualizada");
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
    updateLeadData(syncedLead);
    setInterestEditor(null);

    const targetPropertyId = nextInterest.unitId || nextInterest.propertyId;
    if (!isMockDataMode && targetPropertyId) {
      try {
        await attachEverpropLeadProperty(lead.id, targetPropertyId, {
          notes: nextInterest.notes,
        });
      } catch (err: any) {
        console.error("Error linking property in backend:", err);
      }
    }

    toast.success(interestEditor?.mode === "edit" ? "Interés actualizado" : "Interés agregado");
  }

  async function handleDeleteInterest() {
    if (!lead || !interestToDelete) return;
    const nextInterests = interests.filter((interest) => interest.id !== interestToDelete.id);
    const syncedLead = syncLeadWithInterests(lead, nextInterests, allProperties);
    updateLeadData(syncedLead);

    const targetPropertyId = interestToDelete.unitId || interestToDelete.propertyId;
    if (!isMockDataMode && targetPropertyId) {
      try {
        await detachEverpropLeadProperty(lead.id, targetPropertyId);
      } catch (err: any) {
        console.error("Error unlinking property in backend:", err);
      }
    }

    setInterestToDelete(null);
    toast.success("Interés eliminado", { description: `${lead.name} continúa registrado y conserva sus demás intereses.` });
  }

  function handleScheduleVisit(visit: Visit) {
    if (!lead) return;
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
    toast.success("Visita agendada y sincronizada con la propiedad");
  }

  async function handleReassignAgentConfirmed(agentId?: string) {
    if (!lead) return;
    const newAdvisor = getAdvisor(agentId);
    const updatedLead: Lead = {
      ...lead,
      agentId,
      agentName: newAdvisor?.name,
    };
    const nextLeads = allLeads.map((candidate) => candidate.id === lead.id ? updatedLead : candidate);
    setAllLeads(nextLeads);
    setLead(updatedLead);
    saveLeadList(nextLeads, lead.companyId);

    if (!isMockDataMode) {
      try {
        await updateEverpropLead(lead.id, {
          agentId: agentId || null,
        });
      } catch (err: any) {
        console.error("Error updating lead agent in backend:", err);
      }
    }

    if (agentId) {
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

    const nextFollowUps = appendLeadFollowUpToStorage(
      followUp,
      followUps,
      lead.companyId,
    );
    setFollowUps(nextFollowUps);

    if (!isMockDataMode) {
      try {
        const created = await createEverpropLeadFollowUp(lead.id, {
          type: followUp.type,
          occurredAt: followUp.occurredAt,
          summary: followUp.summary,
          result: followUp.result,
          nextAction: followUp.nextAction,
          nextContactAt: followUp.nextContactAt,
          agentId: followUp.agentId,
        });
        setFollowUps((prev) => [created, ...prev.filter((f) => f.id !== followUp.id)]);
      } catch (err: any) {
        console.error("Error saving follow up to API:", err);
      }
    }

    // Sync nextContactAt → lead.visits so it appears in Calendar/Agenda
    let nextLead = lead;
    if (followUp.nextContactAt) {
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

    if (nextLead !== lead) {
      updateLeadData(nextLead);
    }

    setFollowUpEditorOpen(false);
    toast.success(
      followUp.type === "note" ? "Nota agregada al historial" : "Seguimiento comercial registrado",
    );
    setStageUpdateModalOpen(true);
  }

  async function handleConfirmStageUpdate(newStage: Exclude<Lead["stage"], "new">) {
    if (!lead) return;
    const stageApiMap: Record<string, string> = {
      contacted: "CONTACTED",
      visiting: "VISIT_SCHEDULED",
      negotiation: "NEGOTIATION",
      closing: "WON",
    };
    const stageLabels: Record<string, string> = {
      contacted: "Contactado",
      visiting: "Visita Agendada",
      negotiation: "Negociación",
      closing: "Cierre / Ganado",
    };

    const updatedLead: Lead = {
      ...lead,
      stage: newStage,
      lastActivity: new Date().toISOString(),
    };
    updateLeadData(updatedLead);
    setStageUpdateModalOpen(false);
    toast.success(`Etapa comercial actualizada a "${stageLabels[newStage] || newStage}"`);

    if (!isMockDataMode) {
      try {
        await updateEverpropLead(lead.id, {
          stage: stageApiMap[newStage] || "CONTACTED",
        });
      } catch (err) {
        console.error("Error al actualizar etapa en backend:", err);
      }
    }
  }

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
  const assignedAgent = getAdvisor(lead.agentId, lead.agentName);

  const cleanPhone = lead.phone ? lead.phone.replace(/[^0-9]/g, "") : "";

  return (
    <div className="mx-auto w-full max-w-[120rem] space-y-5 pb-12">
      <Link href="/admin/leads" className="inline-flex min-h-9 items-center gap-1.5 rounded-lg px-2 text-xs font-medium text-slate-500 hover:bg-slate-100 hover:text-blue-700">
        <ArrowLeft className="size-4" aria-hidden="true" /> Volver al pipeline
      </Link>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-12">
        {/* ── Main Column (8 cols): Deep content ── */}
        <div className="min-w-0 space-y-6 xl:col-span-8">
          {/* Pending Info Alert */}
          {generalPendingData.length > 0 ? (
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-4" role="status">
              <div className="flex items-start gap-2.5">
                <CircleAlert className="mt-0.5 size-4 shrink-0 text-amber-700" aria-hidden="true" />
                <div>
                  <p className="text-xs font-bold text-amber-950">Información pendiente</p>
                  <p className="mt-0.5 text-xs text-amber-800">El cliente ya está registrado. Podés completar estos datos con el botón "Completar ficha".</p>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {generalPendingData.map((item) => (
                      <span key={item} className="rounded-md border border-amber-200 bg-white px-2 py-0.5 text-xs font-semibold text-amber-900">
                        {item}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 p-3.5 text-xs font-semibold text-emerald-800" role="status">
              <CircleCheck className="size-4 shrink-0" aria-hidden="true" /> La información general del cliente está completa.
            </div>
          )}

          {/* General Notes */}
          {lead.notes && (
            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <p className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-slate-500">
                <StickyNote className="size-3.5" aria-hidden="true" /> Notas generales
              </p>
              <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-700 dark:text-slate-200">{lead.notes}</p>
            </div>
          )}

          {/* Follow-up Timeline */}
          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6" aria-labelledby="lead-follow-up-timeline-title">
            <div className="flex flex-col gap-3 border-b border-slate-200 pb-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-xs font-bold uppercase tracking-wider text-blue-700">Historial comercial</p>
                <h2 id="lead-follow-up-timeline-title" className="mt-1 text-lg font-bold tracking-tight text-slate-950">Línea de tiempo</h2>
                <p className="mt-0.5 text-xs text-slate-500">Cada contacto conserva su asesor, fecha, tipo, resumen, resultado y próximo paso.</p>
              </div>
              <Button onClick={() => setFollowUpEditorOpen(true)} disabled={!lead.agentId} className="h-8 w-full gap-1.5 bg-blue-600 px-3 text-xs font-semibold text-white hover:bg-blue-700 sm:w-auto shadow-sm disabled:opacity-50 disabled:cursor-not-allowed">
                <Plus className="size-3.5" aria-hidden="true" /> Nuevo seguimiento
              </Button>
            </div>
            <div className="mt-5">
              <LeadFollowUpTimeline leadId={lead.id} companyId={lead.companyId} followUps={followUps} legacyUpdatedAt={lead.followUpUpdatedAt} />
            </div>
          </section>

          {/* Interests Section */}
          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6" aria-labelledby="lead-interests-title">
            <div className="flex flex-col gap-3 border-b border-slate-200 pb-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-xs font-bold uppercase tracking-wider text-blue-700">Calificación comercial</p>
                <h2 id="lead-interests-title" className="mt-1 text-lg font-bold tracking-tight text-slate-950">Intereses independientes</h2>
                <p className="mt-0.5 text-xs text-slate-500">Cada ficha conserva su propio proyecto, propiedad, unidad, preferencias y notas.</p>
              </div>
              <Button onClick={() => setInterestEditor({ mode: "new" })} className="h-8 w-full gap-1.5 bg-blue-600 px-3 text-xs font-semibold text-white hover:bg-blue-700 sm:w-auto shadow-sm">
                <Plus className="size-3.5" aria-hidden="true" /> Agregar interés
              </Button>
            </div>

            {interests.length === 0 ? (
              <div className="mt-5 flex min-h-48 flex-col items-center justify-center rounded-2xl border-2 border-dashed border-slate-300 bg-slate-50 p-6 text-center">
                <Layers3 className="size-8 text-slate-400" aria-hidden="true" />
                <h3 className="mt-3 text-base font-bold text-slate-950">Todavía no hay intereses cargados</h3>
                <p className="mt-1 max-w-md text-xs text-slate-500">Podés registrar una ficha vacía y completarla durante la calificación.</p>
              </div>
            ) : (
              <div className="mt-5 grid gap-4 md:grid-cols-2">
                {interests.map((interest, index) => {
                  const project = interest.projectId ? projectById.get(interest.projectId) : undefined;
                  const property = interest.propertyId ? propertyById.get(interest.propertyId) : undefined;
                  const unit = interest.unitId ? propertyById.get(interest.unitId) : undefined;
                  const pendingFields = getInterestPendingFields(interest);
                  return (
                    <article key={interest.id} className="flex min-h-full flex-col rounded-xl border border-slate-200 bg-slate-50/70 p-4 sm:p-5">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="text-xs font-bold uppercase tracking-wider text-blue-700">Interés {index + 1}</p>
                          <h3 className="mt-1 text-base font-bold text-slate-950">{interest.category ? CATEGORY_LABELS[interest.category] : "Sin categoría"}</h3>
                        </div>
                        <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-white text-blue-700 shadow-sm border border-slate-100">
                          <Building2 className="size-4" aria-hidden="true" />
                        </span>
                      </div>
                      <dl className="mt-3.5 space-y-2 text-xs">
                        <div><dt className="font-semibold text-slate-500">Proyecto</dt><dd className="font-bold text-slate-900">{project?.name || "Sin informar"}</dd></div>
                        <div><dt className="font-semibold text-slate-500">Propiedad</dt><dd className="font-bold text-slate-900">{property?.title || interest.propertyTitle || "Sin informar"}</dd></div>
                        <div><dt className="font-semibold text-slate-500">Unidad</dt><dd className="font-bold text-slate-900">{unit ? `${unit.unitNumber || unit.title}${unit.sectorName ? ` · ${unit.sectorName}` : ""}` : "Sin informar"}</dd></div>
                      </dl>
                      <div className="mt-3.5 space-y-2 border-t border-slate-200 pt-3 text-xs">
                        <div><p className="font-semibold text-slate-500">Preferencias</p><p className="whitespace-pre-wrap text-slate-700">{interest.preferences || "Sin informar"}</p></div>
                        <div><p className="font-semibold text-slate-500">Notas</p><p className="whitespace-pre-wrap text-slate-700">{interest.notes || "Sin informar"}</p></div>
                      </div>
                      <div className="mt-3">
                        <p className="text-xs font-bold text-amber-800">Datos sin informar</p>
                        <div className="mt-1.5 flex flex-wrap gap-1.5">
                          {pendingFields.length > 0 ? pendingFields.map((field) => (
                            <span key={field} className="rounded-md border border-amber-200 bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-900">{field}</span>
                          )) : (
                            <span className="rounded-md border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-800">Ficha completa</span>
                          )}
                        </div>
                      </div>
                      <div className="mt-auto grid grid-cols-2 gap-2 pt-4">
                        <Button variant="outline" size="sm" onClick={() => setInterestEditor({ mode: "edit", interest })} className="h-8 gap-1.5 text-xs font-semibold">
                          <Edit3 className="size-3" aria-hidden="true" /> Editar
                        </Button>
                        <Button variant="outline" size="sm" onClick={() => setInterestToDelete(interest)} className="h-8 gap-1.5 border-rose-200 text-xs font-semibold text-rose-700 hover:bg-rose-50 hover:text-rose-800">
                          <Trash2 className="size-3" aria-hidden="true" /> Eliminar
                        </Button>
                      </div>
                      {(property || unit || interest.propertyId || interest.unitId) && (
                        <Link href={`/admin/properties/${(unit ?? property)?.id || interest.propertyId || interest.unitId}`} className="mt-2.5 inline-flex items-center justify-center gap-1.5 rounded-lg py-1.5 text-xs font-semibold text-blue-700 hover:bg-blue-50 transition-colors">
                          Ver activo <ExternalLink className="size-3" aria-hidden="true" />
                        </Link>
                      )}
                    </article>
                  );
                })}
              </div>
            )}
          </section>

          {/* Visits & Agenda */}
          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
            <VisitManager
              title="Gestión de visitas y citas"
              subtitle="Agendá citas para cualquiera de sus activos de interés."
              visits={lead.visits ?? []}
              onSchedule={handleScheduleVisit}
              defaultGuestName={lead.name}
              defaultPhone={lead.phone}
              defaultEmail={lead.email}
              defaultAgentId={lead.agentId}
              propertyOptions={allProperties.filter((property) => interestAssetIds.includes(property.id))}
            />
          </section>
        </div>

        {/* ── Sidebar Column (4 cols): Quick access tools ── */}
        <div className="min-w-0 space-y-6 xl:col-span-4">
          {/* Lead Overview Card */}
          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6" aria-labelledby="lead-name">
            <div className="flex items-start gap-3.5">
              <Avatar className="size-12 shrink-0 rounded-xl bg-blue-600 text-base font-bold text-white">
                <AvatarFallback className="bg-blue-600 text-white">{lead.name[0]}</AvatarFallback>
              </Avatar>
              <div className="min-w-0 flex-1">
                <h1 id="lead-name" className="text-lg font-bold tracking-tight text-slate-950 dark:text-slate-100 sm:text-xl truncate">{lead.name}</h1>
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  <Badge variant="default" className="px-2 py-0.5 text-xs">{lead.origin}</Badge>
                  <Badge className="border-0 bg-blue-50 px-2 py-0.5 text-xs capitalize text-blue-700">{lead.stage}</Badge>
                </div>
              </div>
            </div>

            <div className="mt-4 space-y-2 border-t border-slate-100 dark:border-slate-800 pt-3 text-xs text-slate-600 dark:text-slate-300">
              <div className="flex items-center justify-between">
                <span className="font-semibold text-slate-900 dark:text-slate-100">Teléfono:</span>
                <span className="text-right">{lead.phone || "Sin informar"}</span>
              </div>
              {cleanPhone && (
                <a
                  href={`https://wa.me/${cleanPhone}?text=${encodeURIComponent(
                    `Hola ${lead.name}, te contacto de Bellomo Inmobiliaria respecto a tu consulta${
                      interests[0]?.propertyTitle ? ` sobre ${interests[0].propertyTitle}` : ""
                    }. ¿Cómo estás?`
                  )}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-600 hover:text-emerald-700 hover:underline"
                >
                  Abrir conversación en WhatsApp →
                </a>
              )}
              <div className="flex items-center justify-between">
                <span className="font-semibold text-slate-900 dark:text-slate-100">Email:</span>
                <span className="text-right truncate max-w-44">{lead.email || "Sin informar"}</span>
              </div>
            </div>

            <Link href={`/admin/leads/${lead.id}/edit`} className="w-full">
              <Button className="mt-4 h-9 w-full gap-1.5 bg-blue-600 px-4 text-xs font-semibold text-white hover:bg-blue-700 shadow-sm">
                <Edit3 className="size-3.5" aria-hidden="true" /> Completar ficha
              </Button>
            </Link>
          </section>

          {/* Assigned Advisor Card */}
          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm" aria-labelledby="lead-advisor-title">
            <p id="lead-advisor-title" className="text-xs font-semibold text-slate-500">Asesor responsable</p>
            <p className="mt-1 text-base font-bold text-slate-900">{assignedAgent?.name ?? "Sin asignar"}</p>
            <p className="mt-0.5 text-xs leading-5 text-slate-500">{assignedAgent?.role ?? "Cada lead conserva un único asesor responsable."}</p>
            {currentUser?.role === "ADMIN" && (
              <Button variant="outline" onClick={() => setAdvisorEditorOpen(true)} className="mt-3 h-8 w-full px-3 text-xs font-semibold">
                Cambiar asesor
              </Button>
            )}
          </section>

          {/* Follow-up Status Card */}
          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm" aria-labelledby="lead-follow-up-title">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <span className="flex size-7 items-center justify-center rounded-lg bg-blue-50 text-blue-700">
                  <ClipboardCheck className="size-4" aria-hidden="true" />
                </span>
                <h2 id="lead-follow-up-title" className="text-sm font-bold text-slate-900">Seguimiento Comercial</h2>
              </div>
            </div>
            <div className="mt-3">
              <LeadFollowUpStatus leadId={lead.id} companyId={lead.companyId} followUps={followUps} legacyUpdatedAt={lead.followUpUpdatedAt} />
            </div>
            {!lead.agentId && (
              <p className="mt-2 text-xs text-amber-700 font-medium">Asigná un asesor antes de registrar un seguimiento.</p>
            )}
            <Button
              onClick={() => setFollowUpEditorOpen(true)}
              disabled={!lead.agentId}
              className="mt-3 h-9 w-full gap-1.5 rounded-xl bg-blue-600 px-3 text-xs font-bold text-white hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed shadow-sm"
            >
              <Plus className="size-3.5" />
              Registrar seguimiento
            </Button>
          </section>


        </div>
      </div>

          {/* Financing Calculator Card */}
          <div className="min-w-0">
            <FinancingCalculator key={`${lead.id}-${primaryProperty?.id ?? ''}`} defaultPrice={primaryProperty?.price} defaultCurrency={primaryProperty?.currency ?? "ARS"} leadName={lead.name} projectName={projectById.get(primaryProperty?.projectId ?? interests[0]?.projectId ?? '')?.name} />
          </div>

      {profileEditorOpen && <LeadProfileEditor key={lead.lastActivity} lead={lead} onClose={() => setProfileEditorOpen(false)} onSave={handleSaveProfile} />}
      {interestEditor && <LeadInterestEditor key={interestEditor.mode === "edit" ? interestEditor.interest.id : "new-interest"} companyId={lead.companyId} interest={interestEditor.mode === "edit" ? interestEditor.interest : undefined} projects={allProjects} properties={allProperties} onClose={() => setInterestEditor(null)} onSave={handleSaveInterest} />}
      {followUpEditorOpen && <LeadFollowUpEditor lead={lead} onClose={() => setFollowUpEditorOpen(false)} onConfirm={handleSaveFollowUp} />}
      {lead && (
        <LeadStageUpdateModal
          open={stageUpdateModalOpen}
          leadName={lead.name}
          currentStage={lead.stage}
          onClose={() => setStageUpdateModalOpen(false)}
          onConfirm={handleConfirmStageUpdate}
        />
      )}
      {advisorEditorOpen && currentUser?.role === "ADMIN" && <LeadAdvisorEditor leadName={lead.name} currentAgentId={lead.agentId} onClose={() => setAdvisorEditorOpen(false)} onSave={handleReassignAgentConfirmed} />}

      <Dialog open={Boolean(interestToDelete)} onOpenChange={(open) => !open && setInterestToDelete(null)}>
        <DialogContent className="sm:max-w-md"><DialogHeader><DialogTitle>Eliminar este interés</DialogTitle><DialogDescription>Se quitará solamente esta ficha. El cliente y sus demás intereses no serán eliminados.</DialogDescription></DialogHeader><DialogFooter className="mt-4 gap-2"><Button variant="outline" onClick={() => setInterestToDelete(null)}>Cancelar</Button><Button variant="destructive" onClick={handleDeleteInterest}>Eliminar interés</Button></DialogFooter></DialogContent>
      </Dialog>
    </div>
  );
}
