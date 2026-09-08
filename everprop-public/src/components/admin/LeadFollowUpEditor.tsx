"use client";

import { useState, type FormEvent } from "react";
import { ClipboardCheck, Loader2, X } from "lucide-react";

import type { Lead, LeadFollowUp, LeadFollowUpType } from "@/data/admin-sample";
import { MOCK_USERS, REAL_ADVISORS } from "@/data/auth-sample";
import { isMockDataMode } from "@/lib/data-mode";
import { useAuth } from "@/lib/auth-context";
import {
  argentinaDateTimeInputToIso,
  toArgentinaDateTimeInputValue,
} from "@/lib/lead-follow-up";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { QuickScheduleButtons } from "@/components/admin/QuickScheduleButtons";

const FOLLOW_UP_TYPES: { value: LeadFollowUpType; label: string }[] = [
  { value: "call", label: "Llamada" },
  { value: "whatsapp", label: "WhatsApp" },
  { value: "email", label: "Email" },
  { value: "meeting", label: "Reunión" },
  { value: "visit", label: "Visita" },
  { value: "note", label: "Nota interna" },
];

type LeadFollowUpEditorProps = {
  lead: Lead;
  onClose: () => void;
  onConfirm: (followUp: LeadFollowUp) => void;
};

export function LeadFollowUpEditor({
  lead,
  onClose,
  onConfirm,
}: LeadFollowUpEditorProps) {
  const { currentUser } = useAuth();
  const advisors = isMockDataMode
    ? MOCK_USERS.filter((user) => user.role === "ADVISOR")
    : REAL_ADVISORS;
  const [agentId, setAgentId] = useState(
    currentUser?.role === "ADVISOR" ? currentUser.id : lead.agentId ?? "",
  );
  const [type, setType] = useState<LeadFollowUpType>("call");
  const [occurredAt, setOccurredAt] = useState(() => toArgentinaDateTimeInputValue());
  const [summary, setSummary] = useState("");
  const [result, setResult] = useState("");
  const [nextAction, setNextAction] = useState("");
  const [nextContactAt, setNextContactAt] = useState("");
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isSubmitting) return;

    const occurredAtIso = argentinaDateTimeInputToIso(occurredAt);
    const nextContactAtIso = nextContactAt
      ? argentinaDateTimeInputToIso(nextContactAt)
      : undefined;

    if (!lead.agentId) {
      setError("El lead debe tener un asesor asignado antes de registrar un seguimiento.");
      return;
    }
    if (!agentId) {
      setError("Seleccioná el asesor que realizó el seguimiento.");
      return;
    }
    if (!occurredAtIso) {
      setError("Ingresá una fecha y hora válidas.");
      return;
    }
    if (!summary.trim()) {
      setError("Escribí un resumen breve del seguimiento.");
      return;
    }
    if (!result.trim()) {
      setError("Indicá el resultado del seguimiento.");
      return;
    }
    if (nextContactAt && !nextContactAtIso) {
      setError("La próxima fecha de contacto no es válida.");
      return;
    }

    setIsSubmitting(true);
    try {
      await onConfirm({
        id: crypto.randomUUID(),
        companyId: lead.companyId,
        leadId: lead.id,
        agentId,
        type,
        occurredAt: occurredAtIso,
        summary: summary.trim(),
        result: result.trim(),
        nextAction: nextAction.trim() || undefined,
        nextContactAt: nextContactAtIso,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al registrar el seguimiento.");
      setIsSubmitting(false);
    }
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent 
        showCloseButton={false} 
        className="w-full sm:max-w-2xl max-h-[90vh] overflow-hidden p-0 rounded-2xl border border-slate-200 bg-white shadow-2xl flex flex-col"
      >
        <form onSubmit={handleSubmit} className="flex min-h-0 w-full flex-col">
          {/* Header Compacto y Corporativo */}
          <header className="shrink-0 border-b border-slate-100 bg-white px-6 py-4 flex items-center justify-between gap-4">
            <div className="flex items-center gap-3 min-w-0">
              <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-blue-600 text-white shadow-xs">
                <ClipboardCheck className="size-5" aria-hidden="true" />
              </span>
              <div className="min-w-0">
                <DialogTitle className="text-lg font-bold text-slate-950 truncate">
                  Registrar seguimiento
                </DialogTitle>
                <DialogDescription className="text-xs text-slate-500 truncate">
                  Contacto comercial con {lead.name}
                </DialogDescription>
              </div>
            </div>
            <Button 
              type="button" 
              variant="ghost" 
              size="icon" 
              onClick={onClose} 
              className="h-9 w-9 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg"
              aria-label="Cerrar modal"
            >
              <X className="size-5" aria-hidden="true" />
            </Button>
          </header>

          {/* Formulario con tamaño proporcionado */}
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-6 py-5 space-y-4">
            <div className="rounded-xl bg-slate-50 border border-slate-200/80 p-3 text-xs text-slate-600 leading-relaxed">
              Llamadas, WhatsApp, emails, reuniones y visitas reinician el plazo de 10 días. Las notas internas quedan en el historial pero no cuentan como contacto directo.
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <label className="block text-xs font-bold text-slate-700">
                Tipo de contacto
                <select 
                  value={type} 
                  onChange={(event) => setType(event.target.value as LeadFollowUpType)} 
                  className="mt-1.5 h-10 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm text-slate-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100"
                >
                  {FOLLOW_UP_TYPES.map((item) => (
                    <option key={item.value} value={item.value}>{item.label}</option>
                  ))}
                </select>
              </label>

              <label className="block text-xs font-bold text-slate-700">
                Fecha y hora
                <Input 
                  type="datetime-local" 
                  required 
                  value={occurredAt} 
                  onChange={(event) => setOccurredAt(event.target.value)} 
                  className="mt-1.5 h-10 border-slate-300 px-3 text-sm rounded-xl" 
                />
              </label>

              <label className="block text-xs font-bold text-slate-700 sm:col-span-2">
                Asesor responsable
                {currentUser?.role === "ADVISOR" ? (
                  <Input 
                    value={currentUser.name} 
                    readOnly 
                    className="mt-1.5 h-10 border-slate-200 bg-slate-50 px-3 text-sm rounded-xl text-slate-600" 
                  />
                ) : (
                  <select 
                    value={agentId} 
                    onChange={(event) => setAgentId(event.target.value)} 
                    className="mt-1.5 h-10 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm text-slate-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100"
                  >
                    <option value="">Seleccionar asesor</option>
                    {advisors.map((advisor) => (
                      <option key={advisor.id} value={advisor.id}>{advisor.name}</option>
                    ))}
                  </select>
                )}
              </label>

              <label className="block text-xs font-bold text-slate-700 sm:col-span-2">
                Resumen
                <Textarea 
                  required 
                  value={summary} 
                  onChange={(event) => setSummary(event.target.value)} 
                  rows={2} 
                  className="mt-1.5 min-h-20 border-slate-300 px-3 py-2 text-sm rounded-xl" 
                  placeholder="Qué se conversó o realizó..." 
                />
              </label>

              <label className="block text-xs font-bold text-slate-700 sm:col-span-2">
                Resultado
                <Textarea 
                  required 
                  value={result} 
                  onChange={(event) => setResult(event.target.value)} 
                  rows={2} 
                  className="mt-1.5 min-h-20 border-slate-300 px-3 py-2 text-sm rounded-xl" 
                  placeholder="Cómo quedó la conversación..." 
                />
              </label>

              <label className="block text-xs font-bold text-slate-700 sm:col-span-2 dark:text-slate-300">
                Próxima acción <span className="font-normal text-slate-400">(opcional)</span>
                <Input 
                  value={nextAction} 
                  onChange={(event) => setNextAction(event.target.value)} 
                  className="mt-1.5 h-10 border-slate-300 px-3 text-sm rounded-xl dark:border-slate-800 dark:bg-slate-950 dark:text-slate-100" 
                  placeholder="Ej: Enviar propuesta de cuotas, llamar para coordinar seña..." 
                />
              </label>

              <div className="space-y-1.5 sm:col-span-2">
                <div className="flex items-center justify-between">
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300">
                    Próximo contacto / Fecha de la siguiente acción <span className="font-normal text-slate-400">(opcional)</span>
                  </label>
                  {nextContactAt && (
                    <button
                      type="button"
                      onClick={() => setNextContactAt("")}
                      className="text-[11px] font-medium text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors"
                    >
                      Limpiar fecha
                    </button>
                  )}
                </div>
                <Input 
                  type="datetime-local" 
                  value={nextContactAt} 
                  onChange={(event) => setNextContactAt(event.target.value)} 
                  className="h-10 border-slate-300 px-3 text-sm rounded-xl dark:border-slate-800 dark:bg-slate-950 dark:text-slate-100" 
                />
                <QuickScheduleButtons
                  value={nextContactAt}
                  onChange={setNextContactAt}
                  label="Fijar siguiente acción en:"
                  className="pt-1"
                />
              </div>

              {error && (
                <p className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs font-semibold text-rose-800 sm:col-span-2" role="alert">
                  {error}
                </p>
              )}
            </div>
          </div>

          {/* Footer Proporcionado */}
          <footer className="shrink-0 border-t border-slate-100 bg-slate-50/60 px-6 py-3.5 flex justify-end gap-2.5">
            <Button 
              type="button" 
              variant="outline" 
              onClick={onClose} 
              disabled={isSubmitting}
              className="h-10 px-4 text-xs font-semibold rounded-xl border-slate-300 hover:bg-slate-100 disabled:opacity-50"
            >
              Cancelar
            </Button>
            <Button 
              type="submit" 
              disabled={isSubmitting}
              className="h-10 gap-1.5 bg-blue-600 px-5 text-xs font-bold text-white hover:bg-blue-700 rounded-xl shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                  Guardando seguimiento...
                </>
              ) : (
                <>
                  <ClipboardCheck className="size-4" aria-hidden="true" />
                  Guardar seguimiento
                </>
              )}
            </Button>
          </footer>
        </form>
      </DialogContent>
    </Dialog>
  );
}
