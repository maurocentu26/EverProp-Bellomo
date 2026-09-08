"use client";

import { useMemo, useState, useEffect, useRef } from "react";
import { 
    CalendarDays, 
    Trash2, 
    Plus, 
    Phone, 
    Mail, 
    StickyNote,
    Search,
    User,
    UserCheck,
    X,
    ChevronDown
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
import { cn } from "@/lib/utils";
import { QuickScheduleButtons } from "@/components/admin/QuickScheduleButtons";

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
  propertyOptions?: Property[];
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
  const [deletingVisitId, setDeletingVisitId] = useState<string | null>(null);
  const [selectedPropertyId, setSelectedPropertyId] = useState<string>("");

  // Search & Selector State
  const [searchQuery, setSearchQuery] = useState("");
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    return deferEffectUpdate(() => {
      if (defaultGuestName) setGuestName(defaultGuestName);
      if (defaultPhone) setPhone(defaultPhone);
      if (defaultEmail) setEmail(defaultEmail);
    });
  }, [defaultGuestName, defaultPhone, defaultEmail]);

  // Click outside listener for dropdown
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsDropdownOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const selectedLead = useMemo(() => {
    if (!selectedLeadId || !leadOptions) return null;
    return leadOptions.find((l) => l.id === selectedLeadId) || null;
  }, [selectedLeadId, leadOptions]);

  const filteredLeads = useMemo(() => {
    if (!leadOptions || leadOptions.length === 0) return [];
    const q = searchQuery.toLowerCase().trim();
    if (!q) return leadOptions;
    return leadOptions.filter((l) => 
      l.name.toLowerCase().includes(q) ||
      (l.phone && l.phone.toLowerCase().includes(q)) ||
      (l.email && l.email.toLowerCase().includes(q))
    );
  }, [leadOptions, searchQuery]);

  const sortedVisits = useMemo(() => {
    return [...visits].sort((a, b) => new Date(a.scheduledAt).getTime() - new Date(b.scheduledAt).getTime());
  }, [visits]);

  function handleSelectLead(lead: Lead) {
    setSelectedLeadId(lead.id);
    setGuestName(lead.name);
    setPhone(lead.phone ?? "");
    setEmail(lead.email ?? "");
    setSearchQuery("");
    setIsDropdownOpen(false);
    setError("");
  }

  function handleClearLeadSelection() {
    setSelectedLeadId(undefined);
    setGuestName("");
    setPhone("");
    setEmail("");
    setSearchQuery("");
  }

  function handleSubmit(event: React.SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    const finalName = guestName.trim() || searchQuery.trim();
    if (!finalName) { setError("Ingresá el nombre del visitante o seleccioná un lead."); return; }
    if (!scheduledAt) { setError("Seleccioná fecha y hora."); return; }

    const visit: Visit = {
      id: `visit-${Date.now()}`,
      leadId: selectedLeadId,
      leadName: finalName,
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
    if (!defaultGuestName) {
      handleClearLeadSelection();
    }
    toast.success("Visita agendada correctamente");
  }

  return (
    <div className="w-full space-y-8">
      {/* Header Section */}
      <div className="flex items-start justify-between">
        <div className="space-y-1">
          <h2 className="text-xl font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
            <CalendarDays className="h-5 w-5 text-blue-600" />
            {title}
          </h2>
          <p className="text-sm text-slate-500 dark:text-slate-400">{subtitle}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        {/* Formulario de Agendamiento */}
        <div className="lg:col-span-5">
          <form onSubmit={handleSubmit} className="space-y-4 p-6 sm:p-7 rounded-2xl border border-slate-200 bg-white shadow-xs dark:bg-card dark:border-border">
            {propertyOptions && propertyOptions.length > 0 && (
              <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-600 uppercase tracking-wider dark:text-slate-400">¿Qué propiedad van a visitar?</label>
                  <select 
                      value={selectedPropertyId} 
                      onChange={(e) => setSelectedPropertyId(e.target.value)}
                      className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-800 shadow-2xs focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200"
                  >
                      <option value="">Seleccionar propiedad...</option>
                      {propertyOptions.map(p => (
                          <option key={p.id} value={p.id}>{p.title}</option>
                      ))}
                  </select>
              </div>
            )}
            
            {/* Selector de Lead con Búsqueda entre Todos los Leads */}
            <div className="space-y-1.5" ref={dropdownRef}>
              <div className="flex items-center justify-between">
                <label className="text-xs font-bold text-slate-600 uppercase tracking-wider dark:text-slate-400">
                  Visitante / Interesado
                </label>
                {leadOptions && leadOptions.length > 0 && (
                  <span className="text-[11px] font-semibold text-slate-400">
                    {leadOptions.length} leads disponibles
                  </span>
                )}
              </div>

              {selectedLead ? (
                /* Ficha del Lead Seleccionado */
                <div className="flex items-center justify-between gap-3 p-3 rounded-xl border border-blue-200 bg-blue-50/70 dark:bg-blue-950/30 dark:border-blue-900/60">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-blue-600 text-white shadow-2xs">
                      <UserCheck className="size-4" />
                    </span>
                    <div className="min-w-0">
                      <p className="text-xs font-bold text-slate-900 dark:text-slate-100 truncate">
                        {selectedLead.name}
                      </p>
                      <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                        {selectedLead.phone || selectedLead.email || "Lead registrado"}
                      </p>
                    </div>
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={handleClearLeadSelection}
                    className="h-8 px-2 text-xs font-semibold text-slate-600 hover:text-rose-600 dark:text-slate-400 dark:hover:text-rose-400"
                    title="Cambiar o desvincular lead"
                  >
                    <X className="size-3.5 mr-1" />
                    Cambiar
                  </Button>
                </div>
              ) : (
                /* Buscador y Selector Desplegable */
                <div className="relative">
                  <div className="relative">
                    <Search className="absolute left-3.5 top-3.5 size-4 text-slate-400" />
                    <Input
                      value={searchQuery || guestName}
                      onChange={(e) => {
                        const val = e.target.value;
                        setSearchQuery(val);
                        setGuestName(val);
                        setIsDropdownOpen(true);
                      }}
                      onFocus={() => setIsDropdownOpen(true)}
                      placeholder={
                        leadOptions && leadOptions.length > 0
                          ? "Buscar lead por nombre, teléfono o email..."
                          : "Nombre y apellido del visitante..."
                      }
                      className="h-11 bg-white border-slate-200 rounded-xl pl-9 pr-8 shadow-2xs focus-visible:ring-blue-500 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200"
                    />
                    {leadOptions && leadOptions.length > 0 && (
                      <button
                        type="button"
                        onClick={() => setIsDropdownOpen((prev) => !prev)}
                        className="absolute right-2.5 top-3 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-0.5"
                        title="Ver todos los leads"
                      >
                        <ChevronDown className={cn("size-4 transition-transform", isDropdownOpen && "rotate-180")} />
                      </button>
                    )}
                  </div>

                  {/* Dropdown flotante con todos los leads o filtrados */}
                  {leadOptions && leadOptions.length > 0 && isDropdownOpen && (
                    <div className="absolute z-40 mt-1.5 w-full overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl animate-in fade-in zoom-in-95 dark:border-slate-800 dark:bg-slate-900">
                      <div className="max-h-56 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800">
                        {filteredLeads.length > 0 ? (
                          filteredLeads.map((l) => (
                            <button
                              key={l.id}
                              type="button"
                              onClick={() => handleSelectLead(l)}
                              className="flex w-full items-center justify-between px-3.5 py-2.5 text-left text-sm hover:bg-slate-50 transition-colors dark:hover:bg-slate-800/80 group"
                            >
                              <div className="min-w-0 flex items-center gap-2.5">
                                <span className="flex size-7 shrink-0 items-center justify-center rounded-md bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300 group-hover:bg-blue-100 group-hover:text-blue-700 transition-colors">
                                  <User className="size-3.5" />
                                </span>
                                <div className="truncate">
                                  <p className="font-semibold text-slate-900 dark:text-slate-100 group-hover:text-blue-600 transition-colors">
                                    {l.name}
                                  </p>
                                  <p className="text-xs text-slate-400 truncate">
                                    {l.phone || l.email || "Sin contacto registrado"}
                                  </p>
                                </div>
                              </div>
                              <span className="ml-2 text-[10px] font-bold uppercase tracking-wider text-slate-400 bg-slate-100 px-2 py-0.5 rounded-full dark:bg-slate-800 dark:text-slate-400 shrink-0">
                                {l.stage}
                              </span>
                            </button>
                          ))
                        ) : (
                          <div className="p-4 text-center">
                            <p className="text-xs text-slate-500 dark:text-slate-400">
                              No se encontraron leads con &quot;{searchQuery}&quot;
                            </p>
                            {searchQuery.trim() && (
                              <button
                                type="button"
                                onClick={() => {
                                  setGuestName(searchQuery.trim());
                                  setIsDropdownOpen(false);
                                }}
                                className="mt-2 text-xs font-bold text-blue-600 hover:underline dark:text-blue-400"
                              >
                                Usar &quot;{searchQuery.trim()}&quot; como visitante nuevo
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-600 uppercase tracking-wider dark:text-slate-400">Teléfono / WhatsApp</label>
              <Input 
                value={phone} 
                onChange={(e) => setPhone(e.target.value)} 
                placeholder="Ej: +54 9 11..." 
                className="h-11 bg-white border-slate-200 rounded-xl px-3.5 shadow-2xs dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200" 
              />
            </div>

            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label className="text-xs font-bold text-slate-600 uppercase tracking-wider dark:text-slate-400">Fecha y Hora de la Visita</label>
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
              <Input 
                type="datetime-local" 
                value={scheduledAt} 
                onChange={(e) => setScheduledAt(e.target.value)} 
                className="h-11 bg-white border-slate-200 rounded-xl px-3 shadow-2xs dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200" 
              />
              <QuickScheduleButtons
                value={scheduledAt}
                onChange={setScheduledAt}
                label="Agendar visita rápido para:"
                className="pt-1"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-600 uppercase tracking-wider dark:text-slate-400">Notas u Observaciones</label>
              <Textarea 
                value={notes} 
                onChange={(e) => setNotes(e.target.value)} 
                placeholder="Ej: Trae seña de reserva, viene con arquitecto, interesado en financiación..." 
                className="min-h-[90px] bg-white border-slate-200 rounded-xl p-3 shadow-2xs dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200 text-sm"
              />
            </div>

            {error && <p className="text-xs text-rose-600 font-medium px-1">{error}</p>}

            <Button type="submit" className="min-h-11 w-full bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl shadow-xs transition-colors">
              <Plus className="mr-2 h-4 w-4" />
              Confirmar Visita
            </Button>
          </form>
        </div>

        {/* Lista de Visitas (Timeline) */}
        <div className="lg:col-span-7 space-y-4">
          <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest px-2">Cronograma de Visitas</h3>
          
          {sortedVisits.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 border-2 border-dashed border-slate-100 rounded-3xl bg-slate-50/30 dark:border-slate-800 dark:bg-slate-900/30">
                <CalendarDays className="h-10 w-10 text-slate-200 dark:text-slate-700 mb-2" />
                <p className="text-sm text-slate-400">No hay visitas programadas</p>
            </div>
          ) : (
            <div className="grid gap-3">
              {sortedVisits.map((visit) => {
                const dateInfo = formatVisitDate(visit.scheduledAt);
                return (
                  <div key={visit.id} className="group relative flex items-center gap-4 p-4 rounded-2xl border border-slate-100 bg-white hover:border-blue-200 hover:shadow-md transition-all dark:bg-card dark:border-border dark:hover:border-blue-500">
                    {/* Indicador de Fecha */}
                    <div className="flex flex-col items-center justify-center min-w-[60px] py-2 px-1 bg-slate-50 rounded-xl border border-slate-100 group-hover:bg-blue-50 group-hover:border-blue-100 transition-colors dark:bg-slate-900 dark:border-slate-800 dark:group-hover:bg-blue-950 dark:group-hover:border-blue-900">
                        <span className="text-[10px] font-bold uppercase text-slate-400 group-hover:text-blue-400">{dateInfo.day}</span>
                        <span className="text-lg font-black text-slate-700 group-hover:text-blue-700 dark:text-slate-200 dark:group-hover:text-blue-400">{dateInfo.time}</span>
                    </div>

                    <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-0.5">
                            <p className="font-bold text-slate-900 dark:text-slate-100 truncate">{visit.leadName}</p>
                            <Badge className="bg-emerald-50 text-emerald-700 hover:bg-emerald-50 border-none text-[10px] px-2 py-0 dark:bg-emerald-950/50 dark:text-emerald-300">
                                Programada
                            </Badge>
                        </div>
                        <div className="flex items-center gap-4 text-xs text-slate-400">
                            <span className="flex items-center gap-1"><Phone className="h-3 w-3" /> {visit.phone || 'N/A'}</span>
                            <span className="flex items-center gap-1"><Mail className="h-3 w-3" /> {visit.email || 'N/A'}</span>
                        </div>
                        {visit.notes && (
                            <div className="mt-2 flex items-start gap-1.5 p-2 bg-amber-50/50 rounded-lg border border-amber-100/50 dark:bg-amber-950/20 dark:border-amber-900/40">
                                <StickyNote className="h-3 w-3 text-amber-500 mt-0.5" />
                                <p className="text-[11px] text-amber-700 dark:text-amber-400 line-clamp-2">{visit.notes}</p>
                            </div>
                        )}
                    </div>

                    {/* Acciones */}
                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <Button 
                            variant="ghost" 
                            size="icon" 
                            onClick={() => setDeletingVisitId(visit.id)}
                            className="text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-full dark:hover:bg-red-950/50"
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
        <DialogContent className="rounded-3xl dark:bg-card dark:border-border">
          <DialogHeader>
            <DialogTitle className="dark:text-slate-100">¿Eliminar esta visita?</DialogTitle>
            <DialogDescription className="dark:text-slate-400">
              Se cancelará la cita agendada. Esta acción no se puede deshacer.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setDeletingVisitId(null)} className="rounded-xl dark:border-slate-800">Cancelar</Button>
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
