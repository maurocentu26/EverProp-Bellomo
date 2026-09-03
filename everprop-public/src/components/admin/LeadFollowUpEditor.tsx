"use client";

import { useState, type FormEvent } from "react";
import { ClipboardCheck, X } from "lucide-react";

import type { Lead, LeadFollowUp, LeadFollowUpType } from "@/data/admin-sample";
import { MOCK_USERS } from "@/data/auth-sample";
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
  const advisors = MOCK_USERS.filter((user) => user.role === "ADVISOR");
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

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const occurredAtIso = argentinaDateTimeInputToIso(occurredAt);
    const nextContactAtIso = nextContactAt
      ? argentinaDateTimeInputToIso(nextContactAt)
      : undefined;

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

    onConfirm({
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
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent fullScreen showCloseButton={false} className="flex bg-slate-50">
        <form onSubmit={handleSubmit} className="flex h-dvh min-h-0 w-full flex-col">
          <header className="shrink-0 border-b border-slate-200 bg-white px-4 pb-5 pt-[max(1rem,env(safe-area-inset-top))] sm:px-8 lg:px-12">
            <div className="mx-auto flex w-full max-w-[min(94vw,1800px)] items-start justify-between gap-5">
              <div className="flex min-w-0 items-start gap-4">
                <span className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-blue-600 text-white sm:size-14">
                  <ClipboardCheck className="size-6" aria-hidden="true" />
                </span>
                <div className="min-w-0">
                  <DialogTitle className="text-2xl font-bold tracking-tight text-slate-950 sm:text-3xl">
                    Registrar seguimiento
                  </DialogTitle>
                  <DialogDescription className="mt-2 text-base leading-7 text-slate-600 sm:text-lg">
                    Dejá constancia del contacto comercial con {lead.name}.
                  </DialogDescription>
                </div>
              </div>
              <Button type="button" variant="outline" onClick={onClose} className="h-12 shrink-0 gap-2 px-4 text-base font-semibold sm:h-14">
                <X className="size-5" aria-hidden="true" />
                <span className="hidden sm:inline">Cerrar</span>
              </Button>
            </div>
          </header>

          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-6 sm:px-8 lg:px-12 lg:py-10">
            <div className="mx-auto w-full max-w-[min(94vw,1800px)]">
              <section className="grid gap-6 rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-8 lg:grid-cols-2 lg:p-10" aria-labelledby="follow-up-fields-title">
                <div className="lg:col-span-2">
                  <p className="text-sm font-bold uppercase tracking-[0.12em] text-blue-700">Contacto comercial</p>
                  <h2 id="follow-up-fields-title" className="mt-2 text-3xl font-bold tracking-tight text-slate-950">Datos del seguimiento</h2>
                  <p className="mt-3 max-w-4xl text-base leading-7 text-slate-600">
                    Llamadas, WhatsApp, emails, reuniones y visitas reinician el plazo de 10 días. Una nota interna queda en el historial, pero no cuenta como contacto con el cliente.
                  </p>
                </div>

                <label className="block text-base font-bold text-slate-800">
                  Tipo
                  <select value={type} onChange={(event) => setType(event.target.value as LeadFollowUpType)} className="mt-2 h-14 w-full rounded-xl border border-slate-300 bg-white px-4 text-lg font-normal text-slate-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200">
                    {FOLLOW_UP_TYPES.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
                  </select>
                </label>

                <label className="block text-base font-bold text-slate-800">
                  Fecha y hora
                  <Input type="datetime-local" required value={occurredAt} onChange={(event) => setOccurredAt(event.target.value)} className="mt-2 h-14 border-slate-300 px-4 text-lg" />
                  <span className="mt-2 block text-sm font-normal text-slate-500">Hora de Argentina (UTC−3).</span>
                </label>

                <label className="block text-base font-bold text-slate-800 lg:col-span-2">
                  Asesor
                  {currentUser?.role === "ADVISOR" ? (
                    <Input value={currentUser.name} readOnly className="mt-2 h-14 border-slate-200 bg-slate-100 px-4 text-lg" />
                  ) : (
                    <select value={agentId} onChange={(event) => setAgentId(event.target.value)} className="mt-2 h-14 w-full rounded-xl border border-slate-300 bg-white px-4 text-lg font-normal text-slate-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200">
                      <option value="">Seleccionar asesor</option>
                      {advisors.map((advisor) => <option key={advisor.id} value={advisor.id}>{advisor.name}</option>)}
                    </select>
                  )}
                </label>

                <label className="block text-base font-bold text-slate-800 lg:col-span-2">
                  Resumen
                  <Textarea required value={summary} onChange={(event) => setSummary(event.target.value)} rows={4} className="mt-2 min-h-32 border-slate-300 px-4 py-3 text-lg leading-7" placeholder="Qué se conversó o realizó" />
                </label>

                <label className="block text-base font-bold text-slate-800 lg:col-span-2">
                  Resultado
                  <Textarea required value={result} onChange={(event) => setResult(event.target.value)} rows={3} className="mt-2 min-h-28 border-slate-300 px-4 py-3 text-lg leading-7" placeholder="Cómo quedó la conversación" />
                </label>

                <label className="block text-base font-bold text-slate-800">
                  Próxima acción <span className="font-normal text-slate-500">(opcional)</span>
                  <Input value={nextAction} onChange={(event) => setNextAction(event.target.value)} className="mt-2 h-14 border-slate-300 px-4 text-lg" placeholder="Ej: enviar propuesta" />
                </label>

                <label className="block text-base font-bold text-slate-800">
                  Próximo contacto <span className="font-normal text-slate-500">(opcional)</span>
                  <Input type="datetime-local" value={nextContactAt} onChange={(event) => setNextContactAt(event.target.value)} className="mt-2 h-14 border-slate-300 px-4 text-lg" />
                </label>

                {error && (
                  <p className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-base font-semibold text-rose-800 lg:col-span-2" role="alert">{error}</p>
                )}
              </section>
            </div>
          </div>

          <footer className="shrink-0 border-t border-slate-200 bg-white px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-4 sm:px-8 lg:px-12">
            <div className="mx-auto flex w-full max-w-[min(94vw,1800px)] flex-col-reverse gap-3 sm:flex-row sm:justify-end">
              <Button type="button" variant="outline" onClick={onClose} className="h-14 w-full px-6 text-lg font-semibold sm:w-auto">Cancelar</Button>
              <Button type="submit" className="h-14 w-full gap-2 bg-blue-600 px-8 text-lg font-bold text-white hover:bg-blue-700 sm:w-auto sm:min-w-64">
                <ClipboardCheck className="size-5" aria-hidden="true" /> Guardar seguimiento
              </Button>
            </div>
          </footer>
        </form>
      </DialogContent>
    </Dialog>
  );
}
