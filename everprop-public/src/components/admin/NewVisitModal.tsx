"use client";

import { useState } from "react";
import { 
  CalendarDays, 
  Plus 
} from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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

interface NewVisitModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onVisitCreated?: () => void;
}

export function NewVisitModal({ open, onOpenChange, onVisitCreated }: NewVisitModalProps) {
  const { user, isAdvisor } = useCurrentSession();
  const [leads] = useState<Lead[]>(() => loadLeadList(sampleLeads, "c1"));
  const [properties] = useState<Property[]>(() => loadPropertyList(sampleProperties, "c1"));

  const [selectedLeadId, setSelectedLeadId] = useState<string>("");
  const [guestName, setGuestName] = useState<string>("");
  const [phone, setPhone] = useState<string>("");
  const [email, setEmail] = useState<string>("");
  const [selectedPropertyId, setSelectedPropertyId] = useState<string>("");
  const [agentId, setAgentId] = useState<string>(user?.id || "u2");
  const [scheduledAt, setScheduledAt] = useState<string>("");
  const [notes, setNotes] = useState<string>("");
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

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
      if (propId) setSelectedPropertyId(propId);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const finalName = guestName.trim() || leads.find((l) => l.id === selectedLeadId)?.name;
    if (!finalName) {
      toast.error("Por favor ingresá el nombre del visitante o seleccioná un lead.");
      return;
    }
    if (!scheduledAt) {
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
        scheduledAt: new Date(scheduledAt).toISOString(),
        notes: notes.trim() || undefined,
        status: "scheduled",
        agentId: agentId || user?.id || "u2",
        propertyId: selectedPropertyId || undefined,
        propertyTitle: chosenProp?.title,
      };

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
      <DialogContent className="sm:max-w-[620px] p-0 overflow-hidden rounded-2xl border-slate-200">
        <DialogHeader className="p-6 bg-slate-900 text-white border-b border-slate-800">
          <div className="flex items-center gap-2">
            <span className="flex size-9 items-center justify-center rounded-xl bg-blue-600/30 text-blue-400 border border-blue-500/30">
              <CalendarDays className="size-5" />
            </span>
            <div>
              <DialogTitle className="text-xl font-bold text-white tracking-tight">
                Agendar Nueva Cita
              </DialogTitle>
              <DialogDescription className="text-xs text-slate-400 mt-0.5">
                Coordiná una visita comercial presencial o llamada para tu agenda.
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="p-6 space-y-4 max-h-[75vh] overflow-y-auto">
          {/* Seleccionar Lead existente o escribir nombre */}
          <div className="space-y-1.5">
            <label className="text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-400">
              Lead / Interesado Registrado
            </label>
            <select
              value={selectedLeadId}
              onChange={(e) => handleLeadSelect(e.target.value)}
              className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-800 shadow-2xs focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200"
            >
              <option value="">-- Cargar visitante manual / No vinculado --</option>
              {leads.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name} {l.phone ? `(${l.phone})` : ""}
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-400">
                Nombre del Visitante *
              </label>
              <Input
                value={guestName}
                onChange={(e) => setGuestName(e.target.value)}
                placeholder="Ej: Marcelo Morales"
                required
                className="h-11 rounded-xl border-slate-200 bg-white px-3.5 shadow-2xs"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-400">
                Teléfono / WhatsApp
              </label>
              <Input
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="Ej: +54 9 11..."
                className="h-11 rounded-xl border-slate-200 bg-white px-3.5 shadow-2xs"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-400">
              Propiedad o Lote de Interés
            </label>
            <select
              value={selectedPropertyId}
              onChange={(e) => setSelectedPropertyId(e.target.value)}
              className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-800 shadow-2xs focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200"
            >
              <option value="">Seleccionar propiedad o lote...</option>
              {properties.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.title} - {p.currency} {p.price?.toLocaleString()}
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-400">
                Fecha y Hora de la Cita *
              </label>
              <Input
                type="datetime-local"
                value={scheduledAt}
                onChange={(e) => setScheduledAt(e.target.value)}
                required
                className="h-11 rounded-xl border-slate-200 bg-white px-3 shadow-2xs"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-400">
                Asesor Responsable
              </label>
              <select
                value={agentId}
                onChange={(e) => setAgentId(e.target.value)}
                disabled={isAdvisor}
                className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-800 shadow-2xs focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100 disabled:opacity-60 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200"
              >
                {MOCK_USERS.filter((u) => u.role === "ADVISOR" || u.role === "ADMIN").map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name} ({u.role})
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-400">
              Notas u Observaciones
            </label>
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Ej: Viene con arquitecto, interesado en financiación a 24 cuotas, trae seña..."
              className="min-h-[85px] rounded-xl border-slate-200 bg-white p-3 shadow-2xs text-sm"
            />
          </div>

          <DialogFooter className="pt-4 border-t border-slate-100 flex items-center justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              className="min-h-11 rounded-xl border-slate-200 px-4 text-sm font-semibold text-slate-700"
            >
              Cancelar
            </Button>
            <Button
              type="submit"
              disabled={isSubmitting}
              className="min-h-11 rounded-xl bg-blue-600 px-5 text-sm font-bold text-white hover:bg-blue-700 shadow-xs"
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
