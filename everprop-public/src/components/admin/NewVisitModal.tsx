"use client";
import { useLeadAdvisors } from "@/hooks/use-lead-advisors";

import { useEffect, useState } from "react";
import { 
  CalendarDays, 
  Plus 
} from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DateTimeFields } from "@/components/ui/date-time-fields";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { 
  type Visit, 
  type Lead, 
  type Property, 
  leads as sampleLeads, 
  properties as sampleProperties 
} from "@/data/admin-sample";
import { loadLeadList, loadPropertyList, saveLeadList, savePropertyList } from "@/lib/admin-storage";
import { useCurrentSession } from "@/hooks/use-current-session";
import { MOCK_USERS } from "@/data/auth-sample";
import { isMockDataMode } from "@/lib/data-mode";
import { loadEverpropLeads, loadEverpropCatalog, createEverpropVisit } from "@/lib/everprop-api";
import { argentinaDateTimeInputToIso } from "@/lib/lead-follow-up";
import { QuickScheduleButtons } from "@/components/admin/QuickScheduleButtons";

interface NewVisitModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onVisitCreated?: () => void;
}

export function NewVisitModal({ open, onOpenChange, onVisitCreated }: NewVisitModalProps) {
  const { user, isAdvisor } = useCurrentSession();
  const { advisors: availableAdvisors, error: advisorsError } = useLeadAdvisors(open && !isAdvisor);
  const [leads, setLeads] = useState<Lead[]>(() => isMockDataMode ? loadLeadList(sampleLeads, "c1") : []);
  const [properties, setProperties] = useState<Property[]>(() => isMockDataMode ? loadPropertyList(sampleProperties, "c1") : []);

  const [selectedLeadId, setSelectedLeadId] = useState<string>("");
  const [guestName, setGuestName] = useState<string>("");
  const [phone, setPhone] = useState<string>("");
  const [email, setEmail] = useState<string>("");
  const [selectedPropertyId, setSelectedPropertyId] = useState<string>("");
  const [agentId, setAgentId] = useState<string>(user?.id || "u2");
  const [scheduledAt, setScheduledAt] = useState<string>("");
  const [notes, setNotes] = useState<string>("");
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  const [loadError, setLoadError] = useState("");
  const [loading, setLoading] = useState(!isMockDataMode);
  useEffect(() => {
    if (!open || isMockDataMode) return;
    let active = true;
    setLoading(true);
    setAgentId(user?.id || "");
    Promise.all([loadEverpropLeads(), loadEverpropCatalog()]).then(([rows, catalog]) => {
      if (!active) return;
      setLeads(rows); setProperties(catalog.properties); setLoadError("");
    }).catch(() => { if (active) setLoadError("No se pudieron cargar los clientes y propiedades. Cerrá y volvé a intentar."); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [open, user?.id]);
  const advisors = isAdvisor && user ? [{id:user.id,name:user.name}] : availableAdvisors;

  // When a lead is picked from the dropdown, auto-fill details
  const handleLeadSelect = (leadId: string) => {
    setSelectedLeadId(leadId);
    if (!leadId) {
      setGuestName("");
      setPhone("");
      setEmail("");
      setSelectedPropertyId("");
      return;
    }
    const found = leads.find((l) => l.id === leadId);
    if (found) {
      setGuestName(found.name);
      setPhone(found.phone || "");
      setEmail(found.email || "");
      if (found.agentId) setAgentId(found.agentId);
      const propId = found.propertyIds?.[0] || found.interests?.[0]?.propertyId;
      setSelectedPropertyId(propId || "");
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (advisorsError) { toast.error(advisorsError); return; }
    const finalName = guestName.trim() || leads.find((l) => l.id === selectedLeadId)?.name;
    if (!finalName) {
      toast.error("Por favor ingresá el nombre del visitante o seleccioná un lead.");
      return;
    }
    if (!scheduledAt || !argentinaDateTimeInputToIso(scheduledAt) || new Date(argentinaDateTimeInputToIso(scheduledAt)!).getTime() <= Date.now()) {
      toast.error("Por favor seleccioná fecha y hora para la cita.");
      return;
    }

    setIsSubmitting(true);
    try {
      const chosenProp = properties.find((p) => p.id === selectedPropertyId);
      const chosenLead = leads.find((l) => l.id === selectedLeadId);

      const newVisit: Visit = {
        id: `visit-${Date.now()}`,
        leadId: selectedLeadId || undefined,
        leadName: finalName,
        phone: phone.trim() || chosenLead?.phone,
        email: email.trim() || chosenLead?.email,
        scheduledAt: argentinaDateTimeInputToIso(scheduledAt)!,
        notes: notes.trim() || undefined,
        status: "scheduled",
        agentId: agentId || user?.id || "u2",
        propertyId: selectedPropertyId || undefined,
        propertyTitle: chosenProp?.title,
      };

      if (!isMockDataMode) {
        await createEverpropVisit({
          lead_id: selectedLeadId || undefined, property_id: selectedPropertyId || undefined,
          agent_id: agentId || user?.id, guest_name: finalName, guest_phone: phone.trim() || undefined,
          guest_email: email.trim() || undefined, scheduled_at: newVisit.scheduledAt, notes: notes.trim() || undefined,
        });
      } else {
      // Persist in lead visits
      const currentLeads = loadLeadList(sampleLeads, "c1");
      const updatedLeads = currentLeads.map((l) => {
        if (selectedLeadId && l.id === selectedLeadId) {
          return { ...l, visits: [...(l.visits || []), newVisit] };
        }
        return l;
      });
      saveLeadList(updatedLeads, "c1");

      // Persist in property visits if property selected
      if (selectedPropertyId) {
        const currentProps = loadPropertyList(sampleProperties, "c1");
        const updatedProps = currentProps.map((p) => {
          if (p.id === selectedPropertyId) {
            return { ...p, visits: [...(p.visits || []), newVisit] };
          }
          return p;
        });
        savePropertyList(updatedProps, "c1");
      }

      }

      // Realtime event dispatch
      try {
        window.dispatchEvent(new Event("everprop_leads_updated"));
        const ch = new BroadcastChannel("everprop_leads");
        ch.postMessage({ type: "LEADS_UPDATED" });
        ch.close();
      } catch {
        // ignore
      }

      toast.success(`Cita agendada con éxito para ${finalName}`);
      onVisitCreated?.();
      onOpenChange(false);
      // Reset
      setSelectedLeadId("");
      setGuestName("");
      setPhone("");
      setEmail("");
      setScheduledAt("");
      setNotes("");
    } catch (err) {
      console.error(err);
      toast.error("Ocurrió un error al agendar la cita.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="admin-workspace flex max-h-[calc(100dvh-2rem)] flex-col sm:max-w-[620px] p-0 overflow-hidden rounded-2xl border-slate-200 dark:border-slate-800 dark:bg-slate-900">
        <DialogHeader className="shrink-0 p-4 pr-12 sm:p-6 sm:pr-12 bg-card text-card-foreground border-b border-border">
          <div className="flex items-center gap-2">
            <span className="hidden sm:flex size-9 shrink-0 items-center justify-center rounded-xl bg-blue-600/30 text-blue-400 border border-blue-500/30">
              <CalendarDays className="size-5" />
            </span>
            <div>
              <DialogTitle className="text-xl font-bold text-card-foreground tracking-tight">
                Agendar Nueva Cita
              </DialogTitle>
              <DialogDescription className="text-sm text-muted-foreground mt-1">
                Coordiná una visita o llamada con el cliente.
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="min-h-0 flex-1 p-4 sm:p-6 space-y-4 overflow-y-auto bg-white dark:bg-slate-900">
          {advisorsError && <p role="alert" className="text-sm text-red-600">{advisorsError}</p>}
          {loadError && <p role="alert" className="text-sm text-red-600">{loadError}</p>}
          {loading && <p role="status">Cargando clientes…</p>}
          {/* Seleccionar Lead existente o escribir nombre */}
          <div className="space-y-1.5">
            <label htmlFor="visit-lead" className="text-sm font-semibold text-slate-600 dark:text-slate-400">
              Lead / Interesado Registrado
            </label>
            <select
              id="visit-lead"
                value={selectedLeadId}
              onChange={(e) => handleLeadSelect(e.target.value)}
              className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-800 shadow-2xs focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-200"
            >
              <option value="">Visitante sin lead vinculado</option>
              {leads.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name}
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label htmlFor="visit-guest" className="text-sm font-semibold text-slate-600 dark:text-slate-400">
                Nombre del Visitante *
              </label>
              <Input
                id="visit-guest"
                value={guestName}
                onChange={(e) => setGuestName(e.target.value)}
                placeholder="Ej: Marcelo Morales"
                required
                className="h-11 rounded-xl border-slate-200 bg-white px-3.5 shadow-2xs dark:border-slate-800 dark:bg-slate-950 dark:text-slate-100"
              />
            </div>

            <div className="space-y-1.5">
              <label htmlFor="visit-phone" className="text-sm font-semibold text-slate-600 dark:text-slate-400">
                Teléfono / WhatsApp
              </label>
              <Input
                id="visit-phone"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="Ej: +54 9 11..."
                className="h-11 rounded-xl border-slate-200 bg-white px-3.5 shadow-2xs dark:border-slate-800 dark:bg-slate-950 dark:text-slate-100"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <label htmlFor="visit-property" className="text-sm font-semibold text-slate-600 dark:text-slate-400">
              Propiedad o Lote de Interés
            </label>
            <select
              id="visit-property"
                value={selectedPropertyId}
              onChange={(e) => setSelectedPropertyId(e.target.value)}
              className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-800 shadow-2xs focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-200"
            >
              <option value="">Seleccionar propiedad o lote...</option>
              {properties.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.title} - {p.currency} {p.price?.toLocaleString("es-AR")}
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5 sm:col-span-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <label htmlFor="visit-date" className="text-sm font-semibold text-slate-600 dark:text-slate-400">
                  Fecha y Hora de la Cita *
                </label>
                {scheduledAt && (
                  <button
                    type="button"
                    onClick={() => setScheduledAt("")}
                    className="text-[11px] font-medium text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors"
                  >
                    Limpiar fecha
                  </button>
                )}
              </div>
              <DateTimeFields
                label="Cita"
                id="visit-date"
                value={scheduledAt}
                onValueChange={setScheduledAt}
                required
                className="h-11 rounded-xl border-slate-200 bg-white px-3 shadow-2xs dark:border-slate-800 dark:bg-slate-950 dark:text-slate-100"
              />
              <QuickScheduleButtons
                value={scheduledAt}
                onChange={setScheduledAt}
                label="Agendar visita rápido para:"
                className="pt-1"
              />
            </div>

            <div className="space-y-1.5 sm:col-span-2">
              <label htmlFor="visit-agent" className="text-sm font-semibold text-slate-600 dark:text-slate-400">
                Asesor Responsable
              </label>
              <select
                id="visit-agent"
                value={agentId}
                onChange={(e) => setAgentId(e.target.value)}
                disabled={isAdvisor || Boolean(leads.find(l => l.id === selectedLeadId)?.agentId)}
                className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-800 shadow-2xs focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100 disabled:opacity-60 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-200"
              >
                {advisors.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="space-y-1.5">
            <label htmlFor="visit-notes" className="text-sm font-semibold text-slate-600 dark:text-slate-400">
              Notas u Observaciones
            </label>
            <Textarea
              id="visit-notes"
                value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Ej: Viene con arquitecto, interesado en financiación a 24 cuotas, trae seña..."
              className="min-h-[85px] rounded-xl border-slate-200 bg-white p-3 shadow-2xs text-sm dark:border-slate-800 dark:bg-slate-950 dark:text-slate-100"
            />
          </div>

          <DialogFooter className="pt-4 border-t border-slate-100 dark:border-slate-800 flex items-center justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              className="w-full sm:w-auto min-h-11 rounded-xl border-slate-200 dark:border-slate-800 px-4 text-sm font-semibold text-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
            >
              Cancelar
            </Button>
            <Button
              type="submit"
              disabled={isSubmitting || loading || Boolean(loadError)}
              className="w-full sm:w-auto min-h-11 rounded-xl bg-blue-600 px-5 text-sm font-bold text-white hover:bg-blue-700 shadow-xs"
            >
              <Plus className="size-4 mr-1.5" />
              {isSubmitting ? "Agendando..." : "Confirmar Cita"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
