"use client";

import { useMemo, useState, useEffect } from "react";
import { 
    CalendarDays, 
    Trash2, 
    Plus, 
    Phone, 
    Mail, 
    StickyNote
} from "lucide-react";
import type { Visit, Lead, Property } from "@/data/admin-sample";
import { Button } from "@/components/ui/button";
import { 
    Dialog, 
    DialogContent, 
    DialogHeader, 
    DialogTitle, 
    DialogFooter, 
    DialogDescription 
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import Badge from "@/components/ui/badge";
import { deferEffectUpdate } from "@/lib/deferred-effect";

type Props = {
  title: string;
  subtitle: string;
  visits: Visit[];
  onSchedule: (visit: Visit) => void;
  onDelete?: (visitId: string) => void;
  defaultGuestName?: string;
  leadOptions?: Lead[];
  defaultPhone?: string;
  defaultEmail?: string;
  defaultAgentId?: string;
  propertyOptions?: Property[]
};

function formatVisitDate(iso: string) {
  try {
    const date = new Date(iso);
    return {
        day: date.toLocaleDateString("es-AR", { day: '2-digit', month: 'short' }),
        time: date.toLocaleTimeString("es-AR", { hour: '2-digit', minute: '2-digit' }),
        full: date.toLocaleString("es-AR", { dateStyle: "long", timeStyle: "short" })
    };
  } catch {
    return { day: iso, time: "", full: iso };
  }
}

export default function VisitManager({
  title,
  subtitle,
  visits,
  onSchedule,
  onDelete,
  defaultGuestName,
  leadOptions,
  defaultPhone,
  defaultEmail,
  defaultAgentId,
  propertyOptions
}: Props) {
  const [guestName, setGuestName] = useState(defaultGuestName ?? "");
  const [scheduledAt, setScheduledAt] = useState("");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState("");
  const [selectedLeadId, setSelectedLeadId] = useState<string | undefined>(undefined);
  const [phone, setPhone] = useState<string>("");
  const [email, setEmail] = useState<string>("");
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [deletingVisitId, setDeletingVisitId] = useState<string | null>(null);
  const [selectedPropertyId, setSelectedPropertyId] = useState<string>("");


  useEffect(() => {
    return deferEffectUpdate(() => {
      if (defaultGuestName) setGuestName(defaultGuestName);
      if (defaultPhone) setPhone(defaultPhone);
      if (defaultEmail) setEmail(defaultEmail);
    });
  }, [defaultGuestName, defaultPhone, defaultEmail]);

  const sortedVisits = useMemo(() => {
    return [...visits].sort((a, b) => new Date(a.scheduledAt).getTime() - new Date(b.scheduledAt).getTime());
  }, [visits]);

  function handleSubmit(event: React.SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!guestName.trim()) { setError("Ingresá el nombre."); return; }
    if (!scheduledAt) { setError("Seleccioná fecha y hora."); return; }

    const visit: Visit = {
      id: `visit-${Date.now()}`,
      leadId: selectedLeadId,
      leadName: guestName.trim(),
      phone: phone.trim() || undefined,
      email: email.trim() || undefined,
      scheduledAt: new Date(scheduledAt).toISOString(),
      notes: notes.trim() || undefined,
      status: "scheduled",
      agentId: defaultAgentId ?? leadOptions?.find((lead) => lead.id === selectedLeadId)?.agentId,
      propertyId: selectedPropertyId || undefined,
      propertyTitle: propertyOptions?.find(p => p.id === selectedPropertyId)?.title
    };

    onSchedule(visit);
    setScheduledAt("");
    setNotes("");
    setError("");
    toast.success("Visita agendada correctamente");
  }

  return (
    <div className="w-full space-y-8">
      {/* Header Section */}
      <div className="flex items-start justify-between">
        <div className="space-y-1">
          <h2 className="text-xl font-bold text-slate-900 flex items-center gap-2">
            <CalendarDays className="h-5 w-5 text-blue-600" />
            {title}
          </h2>
          <p className="text-sm text-slate-500">{subtitle}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-8">
        {/* Formulario de Agendamiento */}
        <div className="xl:col-span-1">
          <form onSubmit={handleSubmit} className="space-y-4 p-6 rounded-2xl border border-slate-100 bg-slate-50/50">
            {propertyOptions && propertyOptions.length > 0 && (
              <div className="space-y-1.5 mb-4">
                  <label className="text-[11px] font-bold text-slate-500 uppercase">¿Qué propiedad van a visitar?</label>
                  <select 
                      value={selectedPropertyId} 
                      onChange={(e) => setSelectedPropertyId(e.target.value)}
                      className="w-full p-2 rounded-lg border border-slate-200 text-sm bg-white"
                  >
                      <option value="">Seleccionar propiedad...</option>
                      {propertyOptions.map(p => (
                          <option key={p.id} value={p.id}>{p.title}</option>
                      ))}
                  </select>
              </div>
            )}
            <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-4">Nueva Cita</h3>
            
            <div className="space-y-1.5">
              <label className="text-[11px] font-bold text-slate-500 uppercase ml-1">Visitante</label>
              <div className="relative">
                <Input
                  value={guestName}
                  onChange={(e) => {
                    setGuestName(e.target.value);
                    setShowSuggestions(true);
                  }}
                  onFocus={() => setShowSuggestions(true)}
                  onBlur={() => setTimeout(() => setShowSuggestions(false), 200)}
                  placeholder="Nombre completo"
                  className="bg-white border-slate-200"
                />
                {leadOptions && showSuggestions && guestName.length > 2 && (
                  <div className="absolute z-30 mt-1 w-full overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl animate-in fade-in zoom-in-95">
                    {leadOptions
                      .filter((l) => l.name.toLowerCase().includes(guestName.toLowerCase()))
                      .map((l) => (
                        <button
                          key={l.id}
                          type="button"
                          onMouseDown={() => {
                            setGuestName(l.name);
                            setSelectedLeadId(l.id);
                            setPhone(l.phone ?? "");
                            setEmail(l.email ?? "");
                            setShowSuggestions(false);
                          }}
                          className="flex w-full items-center justify-between px-4 py-3 text-sm hover:bg-slate-50 transition-colors border-b last:border-0 border-slate-50"
                        >
                          <span className="font-semibold text-slate-700">{l.name}</span>
                          <span className="text-[10px] text-slate-400">{l.phone || l.email}</span>
                        </button>
                      ))}
                  </div>
                )}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="text-[11px] font-bold text-slate-500 uppercase ml-1">Teléfono</label>
                <Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="WhatsApp" className="bg-white border-slate-200" />
              </div>
              <div className="space-y-1.5">
                <label className="text-[11px] font-bold text-slate-500 uppercase ml-1">Fecha y Hora</label>
                <Input type="datetime-local" value={scheduledAt} onChange={(e) => setScheduledAt(e.target.value)} className="bg-white border-slate-200" />
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-[11px] font-bold text-slate-500 uppercase ml-1">Notas u Observaciones</label>
              <Textarea 
                value={notes} 
                onChange={(e) => setNotes(e.target.value)} 
                placeholder="Ej: Trae seña, viene con arquitecto..." 
                className="bg-white border-slate-200 min-h-[80px]"
              />
            </div>

            {error && <p className="text-xs text-red-500 font-medium px-1">{error}</p>}

            <Button type="submit" className="w-full bg-blue-600 hover:bg-blue-700 text-white shadow-md shadow-blue-200 py-6 rounded-xl">
              <Plus className="mr-2 h-4 w-4" />
              Confirmar Visita
            </Button>
          </form>
        </div>

        {/* Lista de Visitas (Timeline) */}
        <div className="xl:col-span-2 space-y-4">
          <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest px-2">Cronograma de Visitas</h3>
          
          {sortedVisits.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 border-2 border-dashed border-slate-100 rounded-3xl bg-slate-50/30">
                <CalendarDays className="h-10 w-10 text-slate-200 mb-2" />
                <p className="text-sm text-slate-400">No hay visitas programadas</p>
            </div>
          ) : (
            <div className="grid gap-3">
              {sortedVisits.map((visit) => {
                const dateInfo = formatVisitDate(visit.scheduledAt);
                return (
                  <div key={visit.id} className="group relative flex items-center gap-4 p-4 rounded-2xl border border-slate-100 bg-white hover:border-blue-200 hover:shadow-md transition-all">
                    {/* Indicador de Fecha */}
                    <div className="flex flex-col items-center justify-center min-w-[60px] py-2 px-1 bg-slate-50 rounded-xl border border-slate-100 group-hover:bg-blue-50 group-hover:border-blue-100 transition-colors">
                        <span className="text-[10px] font-bold uppercase text-slate-400 group-hover:text-blue-400">{dateInfo.day}</span>
                        <span className="text-lg font-black text-slate-700 group-hover:text-blue-700">{dateInfo.time}</span>
                    </div>

                    <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-0.5">
                            <p className="font-bold text-slate-900 truncate">{visit.leadName}</p>
                            <Badge className="bg-emerald-50 text-emerald-700 hover:bg-emerald-50 border-none text-[10px] px-2 py-0">
                                Programada
                            </Badge>
                        </div>
                        <div className="flex items-center gap-4 text-xs text-slate-400">
                            <span className="flex items-center gap-1"><Phone className="h-3 w-3" /> {visit.phone || 'N/A'}</span>
                            <span className="flex items-center gap-1"><Mail className="h-3 w-3" /> {visit.email || 'N/A'}</span>
                        </div>
                        {visit.notes && (
                            <div className="mt-2 flex items-start gap-1.5 p-2 bg-amber-50/50 rounded-lg border border-amber-100/50">
                                <StickyNote className="h-3 w-3 text-amber-500 mt-0.5" />
                                <p className="text-[11px] text-amber-700 line-clamp-2">{visit.notes}</p>
                            </div>
                        )}
                    </div>

                    {/* Acciones */}
                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <Button 
                            variant="ghost" 
                            size="icon" 
                            onClick={() => setDeletingVisitId(visit.id)}
                            className="text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-full"
                        >
                            <Trash2 className="h-4 w-4" />
                        </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Dialog de Eliminación */}
      <Dialog open={!!deletingVisitId} onOpenChange={(open) => !open && setDeletingVisitId(null)}>
        <DialogContent className="rounded-3xl">
          <DialogHeader>
            <DialogTitle>¿Eliminar esta visita?</DialogTitle>
            <DialogDescription>
              Se cancelará la cita agendada. Esta acción no se puede deshacer.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setDeletingVisitId(null)} className="rounded-xl">Cancelar</Button>
            <Button
              className="bg-red-600 text-white hover:bg-red-700 rounded-xl"
              onClick={() => {
                if (deletingVisitId) {
                  onDelete?.(deletingVisitId);
                  toast.success("Visita cancelada");
                }
                setDeletingVisitId(null);
              }}
            >
              Sí, eliminar cita
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
