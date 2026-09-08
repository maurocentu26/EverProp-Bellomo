"use client";

import { useState } from "react";
import { 
  FlaskConical, 
  UserPlus, 
  Clock, 
  AlertTriangle, 
  MessageSquare, 
  CalendarPlus, 
  ChevronDown, 
  ChevronUp,
  Sparkles,
  Check
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { useSidebar } from "@/components/ui/sidebar";
import { useCurrentSession } from "@/hooks/use-current-session";
import { 
  type Lead, 
  type LeadFollowUp, 
  type Visit, 
  leads as sampleLeads, 
  properties as sampleProperties 
} from "@/data/admin-sample";
import { 
  loadLeadList, 
  saveLeadList, 
  loadLeadFollowUpList, 
  appendLeadFollowUpToStorage,
  loadPropertyList,
  savePropertyList 
} from "@/lib/admin-storage";
import { createNotification } from "@/lib/notifications";
import { isLocalQaToolsEnabled, isMockDataMode } from "@/lib/data-mode";
import { createEverpropLead, createEverpropLeadFollowUp } from "@/lib/everprop-api";
import { cn } from "@/lib/utils";

export function SidebarSimulations() {
  const { state } = useSidebar();
  const isCollapsed = state === "collapsed";
  const { user } = useCurrentSession();

  const [isExpanded, setIsExpanded] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [newLeadName, setNewLeadName] = useState("");
  const [activeDialogTab, setActiveDialogTab] = useState<"assign" | "all">("assign");

  if (!isLocalQaToolsEnabled) return null;

  // Helper para notificar cambios en tiempo real
  const dispatchRealtimeUpdates = (leadName: string, eventTitle: string, message: string, leadId?: string) => {
    const targetUserId = user?.id || "u2";
    createNotification(targetUserId, message, {
      title: eventTitle,
      leadId,
      eventType: "SIMULATION",
      actionUrl: leadId ? `/admin/leads/${leadId}` : "/admin",
    });

    try {
      window.dispatchEvent(new Event("everprop_notifications_updated"));
      window.dispatchEvent(new Event("everprop_leads_updated"));
      const notifCh = new BroadcastChannel("everprop_notifications");
      notifCh.postMessage({ type: "NOTIFICATIONS_UPDATED" });
      notifCh.close();
      const leadsCh = new BroadcastChannel("everprop_leads");
      leadsCh.postMessage({ type: "LEADS_UPDATED" });
      leadsCh.close();
    } catch {
      // ignore
    }
  };

  // ── Caso 1: Asignar nuevo lead (pide sólo el nombre) ──
  const handleAssignNewLead = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const name = newLeadName.trim() || "Mariana Ruiz";
    const leadId = `lead-sim-${Date.now()}`;
    const cleanPhone = "+54 9 11 5522-8811";

    const newLead: Lead = {
      id: leadId,
      name,
      phone: cleanPhone,
      email: `${name.toLowerCase().replace(/\s+/g, ".")}@gmail.com`,
      companyId: "c1",
      stage: "new",
      origin: "Portal Web / Simulación QA",
      agentId: user?.id || "u2",
      agentName: user?.name || "Martín Bellomo",
      lastActivity: new Date().toISOString(),
      interests: [
        {
          id: `int-${Date.now()}`,
          companyId: "c1",
          propertyId: "p1",
          propertyTitle: "Lote 14 - Manzana B",
          status: "new",
          currency: "USD",
          price: 25000,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      ],
      propertyIds: ["p1"],
    };

    const currentLeads = loadLeadList(sampleLeads, "c1");
    saveLeadList([newLead, ...currentLeads], "c1");

    if (!isMockDataMode) {
      void createEverpropLead({
        name,
        email: `${name.toLowerCase().replace(/\s+/g, ".")}@gmail.com`,
        phone: cleanPhone,
        stage: "NEW",
      }).catch((err) => console.warn("Simulation API create lead:", err));
    }

    dispatchRealtimeUpdates(
      name,
      "Nuevo Lead Asignado",
      `Se te ha asignado un nuevo lead interesado en Lote 14: ${name}`,
      leadId
    );

    toast.success(`Lead "${name}" creado y asignado. Notificación enviada en tiempo real.`);
    setNewLeadName("");
    setModalOpen(false);
  };

  // ── Caso 2: Lead con vencimiento en 1 día ──
  const handleCreateDueTomorrowLead = () => {
    const leadId = `lead-due-${Date.now()}`;
    const name = "Esteban Morales (Vence en 1d)";
    // Hace 9 días (el límite es 10 días, por ende queda exactamente 1 día)
    const occurredAt = new Date(Date.now() - 9 * 24 * 60 * 60 * 1000).toISOString();

    const newLead: Lead = {
      id: leadId,
      name,
      phone: "+54 9 11 4433-2211",
      email: "esteban.morales@hotmail.com",
      companyId: "c1",
      stage: "contacted",
      origin: "Campaña Facebook / Altos del Valle",
      agentId: user?.id || "u2",
      agentName: user?.name || "Martín Bellomo",
      followUpUpdatedAt: occurredAt,
      lastActivity: occurredAt,
      interests: [
        {
          id: `int-${Date.now()}`,
          companyId: "c1",
          propertyId: "p2",
          propertyTitle: "Lote 22 - Esquina",
          status: "contacted",
          currency: "USD",
          price: 32000,
          createdAt: occurredAt,
          updatedAt: occurredAt,
        },
      ],
      propertyIds: ["p2"],
    };

    const newFollowUp: LeadFollowUp = {
      id: `fu-${Date.now()}`,
      leadId,
      companyId: "c1",
      occurredAt,
      type: "whatsapp",
      summary: "Interesado en lote 22. Se envió plan de pago. Requiere re-contacto para definir seña.",
      result: "interested",
      nextAction: "Llamar para coordinar reserva",
      nextContactAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      agentId: user?.id || "u2",
    };

    const currentLeads = loadLeadList(sampleLeads, "c1");
    saveLeadList([newLead, ...currentLeads], "c1");
    const currentFUs = loadLeadFollowUpList([], "c1");
    appendLeadFollowUpToStorage(newFollowUp, currentFUs, "c1");

    if (!isMockDataMode) {
      void (async () => {
        try {
          const apiLead = await createEverpropLead({
            name,
            email: "esteban.morales@hotmail.com",
            phone: "+54 9 11 4433-2211",
            stage: "CONTACTED",
          });
          await createEverpropLeadFollowUp(apiLead.id, {
            type: "whatsapp",
            occurredAt,
            summary: "Interesado en lote 22. Se envió plan de pago. Requiere re-contacto para definir seña.",
            result: "interested",
            nextAction: "Llamar para coordinar reserva",
            nextContactAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
          });
          window.dispatchEvent(new Event("everprop_leads_updated"));
        } catch (err) {
          console.warn("Simulation API due lead:", err);
        }
      })();
    }

    dispatchRealtimeUpdates(
      name,
      "Seguimiento Próximo a Vencer",
      `El lead ${name} vence en 1 día. Requiere contacto comercial.`,
      leadId
    );

    toast.warning(`Lead creado: "${name}". Aparece en la cola "Para Hoy / Próximos" (vence en 1 día).`);
    setModalOpen(false);
  };

  // ── Caso 3: Lead Vencido Crítico (>10 días, ej. 13 días) ──
  const handleCreateOverdueLead = () => {
    const leadId = `lead-overdue-${Date.now()}`;
    const name = "Gonzalo Funes (Vencido 13d)";
    // Hace 13 días
    const occurredAt = new Date(Date.now() - 13 * 24 * 60 * 60 * 1000).toISOString();

    const newLead: Lead = {
      id: leadId,
      name,
      phone: "+54 9 11 6789-0123",
      email: "gonzalo.funes@yahoo.com",
      companyId: "c1",
      stage: "contacted",
      origin: "WhatsApp Directo",
      agentId: user?.id || "u2",
      agentName: user?.name || "Martín Bellomo",
      followUpUpdatedAt: occurredAt,
      lastActivity: occurredAt,
      interests: [
        {
          id: `int-${Date.now()}`,
          companyId: "c1",
          propertyId: "p1",
          propertyTitle: "Lote 14 - Manzana B",
          status: "contacted",
          currency: "USD",
          price: 25000,
          createdAt: occurredAt,
          updatedAt: occurredAt,
        },
      ],
      propertyIds: ["p1"],
    };

    const newFollowUp: LeadFollowUp = {
      id: `fu-${Date.now()}`,
      leadId,
      companyId: "c1",
      occurredAt,
      type: "call",
      summary: "Pidió información sobre cuotas pero no respondió los últimos mensajes.",
      result: "no_answer",
      nextAction: "Reintentar llamada urgente",
      agentId: user?.id || "u2",
    };

    const currentLeads = loadLeadList(sampleLeads, "c1");
    saveLeadList([newLead, ...currentLeads], "c1");
    const currentFUs = loadLeadFollowUpList([], "c1");
    appendLeadFollowUpToStorage(newFollowUp, currentFUs, "c1");

    if (!isMockDataMode) {
      void (async () => {
        try {
          const apiLead = await createEverpropLead({
            name,
            email: "gonzalo.funes@yahoo.com",
            phone: "+54 9 11 6789-0123",
            stage: "CONTACTED",
          });
          await createEverpropLeadFollowUp(apiLead.id, {
            type: "call",
            occurredAt,
            summary: "Pidió información sobre cuotas pero no respondió los últimos mensajes.",
            result: "no_answer",
            nextAction: "Reintentar llamada urgente",
          });
          window.dispatchEvent(new Event("everprop_leads_updated"));
        } catch (err) {
          console.warn("Simulation API overdue lead:", err);
        }
      })();
    }

    dispatchRealtimeUpdates(
      name,
      "ALERTA: Lead Vencido",
      `El lead ${name} tiene 13 días sin seguimiento comercial registrado.`,
      leadId
    );

    toast.error(`Lead creado: "${name}". Se sumó al contador de "Seguimientos Vencidos".`);
    setModalOpen(false);
  };

  // ── Caso 4: Mensaje Entrante de WhatsApp ──
  const handleInboundWhatsApp = () => {
    const sender = "Rodrigo Silva";
    const text = "Hola buenas tardes, vi publicado el Lote 14 en Altos del Valle. ¿Sigue disponible para reservar esta semana?";

    dispatchRealtimeUpdates(
      sender,
      "Mensaje de WhatsApp Recibido",
      `${sender}: "${text}"`
    );

    toast.info(`WhatsApp recibido de ${sender}: "${text.slice(0, 50)}..."`);
    setModalOpen(false);
  };

  // ── Caso 5: Agendar Visita para Mañana ──
  const handleScheduleVisitTomorrow = () => {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(11, 0, 0, 0);

    const visitId = `visit-sim-${Date.now()}`;
    const newVisit: Visit = {
      id: visitId,
      leadName: "Camila Rossi",
      phone: "+54 9 11 9988-7766",
      email: "camila.rossi@gmail.com",
      scheduledAt: tomorrow.toISOString(),
      notes: "Visita presencial para señar Lote 14 con su pareja.",
      status: "scheduled",
      agentId: user?.id || "u2",
      propertyId: "p1",
      propertyTitle: "Lote 14 - Manzana B",
    };

    const currentLeads = loadLeadList(sampleLeads, "c1");
    let targetLead = currentLeads[0];
    const updatedLeads = currentLeads.map((l, idx) => {
      if (idx === 0) {
        targetLead = l;
        return { ...l, visits: [...(l.visits || []), newVisit] };
      }
      return l;
    });
    saveLeadList(updatedLeads, "c1");

    const currentProps = loadPropertyList(sampleProperties, "c1");
    const updatedProps = currentProps.map((p) => {
      if (p.id === "p1") {
        return { ...p, visits: [...(p.visits || []), newVisit] };
      }
      return p;
    });
    savePropertyList(updatedProps, "c1");

    dispatchRealtimeUpdates(
      "Camila Rossi",
      "Nueva Visita Agendada",
      `Visita coordinada con Camila Rossi para mañana a las 11:00 hs (Lote 14).`
    );

    toast.success(`Visita agendada para mañana 11:00 hs con Camila Rossi.`);
    setModalOpen(false);
  };

  // Vista en modo colapsado (Icon button)
  if (isCollapsed) {
    return (
      <div className="flex justify-center p-2">
        <button
          type="button"
          onClick={() => {
            setActiveDialogTab("all");
            setModalOpen(true);
          }}
          title="Simulador de Casos QA / Demo"
          className="flex size-9 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-700 hover:bg-slate-100 hover:text-blue-600 transition-colors shadow-2xs dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300"
        >
          <FlaskConical className="size-4 text-blue-600" />
        </button>
      </div>
    );
  }

  return (
    <div className="mx-2 mb-2">
      <div className="rounded-xl border border-slate-200 bg-white p-2.5 shadow-2xs dark:border-slate-800 dark:bg-slate-900/60">
        <div className="flex items-center justify-between">
          <button
            type="button"
            onClick={() => setIsExpanded(!isExpanded)}
            className="flex items-center gap-1.5 text-xs font-bold text-slate-800 hover:text-blue-600 transition-colors dark:text-slate-200"
          >
            <FlaskConical className="size-3.5 text-blue-600 shrink-0" />
            <span>Simulador QA</span>
          </button>
          <div className="flex items-center gap-1">
            <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-slate-500 dark:bg-slate-800 dark:text-slate-400">
              Pruebas
            </span>
            <button
              type="button"
              onClick={() => setIsExpanded(!isExpanded)}
              className="p-0.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
            >
              {isExpanded ? <ChevronUp className="size-3.5" /> : <ChevronDown className="size-3.5" />}
            </button>
          </div>
        </div>

        {isExpanded && (
          <div className="mt-2.5 space-y-1.5 border-t border-slate-100 pt-2 dark:border-slate-800">
            {/* Botón 1: Asignar nuevo lead */}
            <button
              type="button"
              onClick={() => {
                setActiveDialogTab("assign");
                setModalOpen(true);
              }}
              className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-xs font-semibold text-slate-700 hover:bg-slate-50 hover:text-blue-600 transition-colors dark:text-slate-300 dark:hover:bg-slate-800"
            >
              <UserPlus className="size-3.5 text-blue-600 shrink-0" />
              <span className="truncate">Asignar nuevo lead...</span>
            </button>

            {/* Botón 2: Lead por vencer en 1 día */}
            <button
              type="button"
              onClick={handleCreateDueTomorrowLead}
              className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-xs font-semibold text-slate-700 hover:bg-amber-50/60 hover:text-amber-700 transition-colors dark:text-slate-300 dark:hover:bg-slate-800"
            >
              <Clock className="size-3.5 text-amber-600 shrink-0" />
              <span className="truncate">Lead vence en 1 día</span>
            </button>

            {/* Botón 3: Lead vencido urgente (+12d) */}
            <button
              type="button"
              onClick={handleCreateOverdueLead}
              className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-xs font-semibold text-slate-700 hover:bg-rose-50/60 hover:text-rose-700 transition-colors dark:text-slate-300 dark:hover:bg-slate-800"
            >
              <AlertTriangle className="size-3.5 text-rose-600 shrink-0" />
              <span className="truncate">Lead vencido (+12 días)</span>
            </button>

            {/* Botón 4: WhatsApp entrante */}
            <button
              type="button"
              onClick={handleInboundWhatsApp}
              className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-xs font-semibold text-slate-700 hover:bg-emerald-50/60 hover:text-emerald-700 transition-colors dark:text-slate-300 dark:hover:bg-slate-800"
            >
              <MessageSquare className="size-3.5 text-emerald-600 shrink-0" />
              <span className="truncate">Mensaje WhatsApp</span>
            </button>

            {/* Botón 5: Agendar visita mañana */}
            <button
              type="button"
              onClick={handleScheduleVisitTomorrow}
              className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-xs font-semibold text-slate-700 hover:bg-purple-50/60 hover:text-purple-700 transition-colors dark:text-slate-300 dark:hover:bg-slate-800"
            >
              <CalendarPlus className="size-3.5 text-purple-600 shrink-0" />
              <span className="truncate">Visita para mañana</span>
            </button>
          </div>
        )}
      </div>

      {/* Modal interactivo de asignación de Lead (sólo nombre) o lista completa */}
      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent className="sm:max-w-[450px] p-0 overflow-hidden rounded-2xl border-slate-200">
          <DialogHeader className="p-5 bg-slate-900 text-white border-b border-slate-800">
            <div className="flex items-center gap-2">
              <span className="flex size-8 items-center justify-center rounded-lg bg-blue-600/30 text-blue-400 border border-blue-500/30">
                <FlaskConical className="size-4" />
              </span>
              <div>
                <DialogTitle className="text-lg font-bold text-white tracking-tight">
                  {activeDialogTab === "assign" ? "Simular Nuevo Lead Asignado" : "Casos de Uso QA / Demo"}
                </DialogTitle>
                <DialogDescription className="text-xs text-slate-400 mt-0.5">
                  Genera eventos en tiempo real con notificaciones directas al asesor.
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>

          {activeDialogTab === "assign" ? (
            <form onSubmit={handleAssignNewLead} className="p-5 space-y-4">
              <div className="space-y-1.5">
                <label className="text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-400">
                  Nombre del Lead a Crear *
                </label>
                <Input
                  value={newLeadName}
                  onChange={(e) => setNewLeadName(e.target.value)}
                  placeholder="Ej: Luciana Valenzuela"
                  autoFocus
                  className="h-11 rounded-xl border-slate-200 bg-white px-3.5 text-sm shadow-2xs"
                />
                <p className="text-[11px] text-slate-500">
                  Al confirmar, se creará el lead, se asignará a tu cuenta ({user?.name || "Asesor"}), y saltará la notificación en la campanita.
                </p>
              </div>

              <DialogFooter className="pt-2 flex items-center justify-end gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setModalOpen(false)}
                  className="min-h-10 rounded-xl px-4 text-xs font-semibold"
                >
                  Cancelar
                </Button>
                <Button
                  type="submit"
                  className="min-h-10 rounded-xl bg-blue-600 px-4 text-xs font-bold text-white hover:bg-blue-700 shadow-xs"
                >
                  <UserPlus className="size-3.5 mr-1.5" />
                  Asignar y Notificar
                </Button>
              </DialogFooter>
            </form>
          ) : (
            <div className="p-5 space-y-2">
              <p className="text-xs text-slate-500 mb-3">
                Seleccioná el caso de uso que querés ejecutar para probar la reactividad del sistema:
              </p>
              <button
                type="button"
                onClick={() => setActiveDialogTab("assign")}
                className="flex w-full items-center justify-between rounded-xl border border-slate-200 p-3 text-left hover:border-blue-300 hover:bg-blue-50/30 transition-all text-xs font-bold text-slate-800"
              >
                <span className="flex items-center gap-2">
                  <UserPlus className="size-4 text-blue-600" />
                  Asignar Nuevo Lead (Pedir nombre)
                </span>
                <span className="text-[10px] text-blue-600 font-semibold">Configurar &rarr;</span>
              </button>

              <button
                type="button"
                onClick={handleCreateDueTomorrowLead}
                className="flex w-full items-center justify-between rounded-xl border border-amber-200 bg-amber-50/40 p-3 text-left hover:bg-amber-50 transition-all text-xs font-bold text-amber-900"
              >
                <span className="flex items-center gap-2">
                  <Clock className="size-4 text-amber-600" />
                  Lead por Vencer en 1 Día (Alerta amarilla)
                </span>
                <span className="text-[10px] text-amber-700 font-semibold">Ejecutar</span>
              </button>

              <button
                type="button"
                onClick={handleCreateOverdueLead}
                className="flex w-full items-center justify-between rounded-xl border border-rose-200 bg-rose-50/40 p-3 text-left hover:bg-rose-50 transition-all text-xs font-bold text-rose-900"
              >
                <span className="flex items-center gap-2">
                  <AlertTriangle className="size-4 text-rose-600" />
                  Lead Vencido Urgente (+12 días sin contacto)
                </span>
                <span className="text-[10px] text-rose-700 font-semibold">Ejecutar</span>
              </button>

              <button
                type="button"
                onClick={handleInboundWhatsApp}
                className="flex w-full items-center justify-between rounded-xl border border-emerald-200 bg-emerald-50/40 p-3 text-left hover:bg-emerald-50 transition-all text-xs font-bold text-emerald-900"
              >
                <span className="flex items-center gap-2">
                  <MessageSquare className="size-4 text-emerald-600" />
                  Mensaje WhatsApp Entrante de Consulta
                </span>
                <span className="text-[10px] text-emerald-700 font-semibold">Ejecutar</span>
              </button>

              <button
                type="button"
                onClick={handleScheduleVisitTomorrow}
                className="flex w-full items-center justify-between rounded-xl border border-purple-200 bg-purple-50/40 p-3 text-left hover:bg-purple-50 transition-all text-xs font-bold text-purple-900"
              >
                <span className="flex items-center gap-2">
                  <CalendarPlus className="size-4 text-purple-600" />
                  Agendar Visita Comercial para Mañana
                </span>
                <span className="text-[10px] text-purple-700 font-semibold">Ejecutar</span>
              </button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
