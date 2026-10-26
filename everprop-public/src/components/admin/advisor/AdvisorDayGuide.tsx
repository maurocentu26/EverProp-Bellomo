"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ArrowRight, Check, ClipboardCheck, Phone } from "lucide-react";
import type { Lead, LeadFollowUp } from "@/data/admin-sample";
import { dayPriorities, leadInitials, priorityReason, type DayPriority } from "@/lib/advisor-day-guide";
import { LeadFollowUpEditor } from "@/components/admin/LeadFollowUpEditor";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle, DialogTrigger } from "@/components/ui/dialog";

export function AdvisorDayGuide({ userId, day, queue, ready, onSave }: {
  userId: string; day: string; queue: DayPriority[]; ready: boolean;
  onSave: (followUp: LeadFollowUp, lead: Lead) => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [round, setRound] = useState<DayPriority[]>([]);
  const [step, setStep] = useState(-1);
  const [results, setResults] = useState<Record<string, "recorded" | "skipped">>({});
  const [recording, setRecording] = useState<Lead | null>(null);
  function openGuide() {
    setRound(dayPriorities(queue));
    setResults({});
    setStep(-1);
    setOpen(true);
  }

  void userId;
  void day;
  const pendingCount = queue.filter(entry => entry.priorityWeight > 0).length;
  const item = round[step];
  const phone = item?.lead.phone?.replace(/[^+0-9]/g, "");
  const recordedCount = Object.values(results).filter(result => result === "recorded").length;
  const skippedCount = Object.values(results).filter(result => result === "skipped").length;
  const recorded = item && results[item.lead.id] === "recorded";
  const stepHeading = useRef<HTMLDivElement>(null);
  useEffect(() => { if (open) stepHeading.current?.focus(); }, [step, open]);

  return (
    <Dialog open={open} onOpenChange={value => { if (value && ready) openGuide(); else if (!recording) setOpen(false); }}>
      <DialogTrigger disabled={!ready} render={<Button className="day-guide-trigger" />}>
        Empezar a llamar <ArrowRight aria-hidden />
      </DialogTrigger>
      <DialogContent showCloseButton={false} className={`admin-workspace mi-day mi-day-guide ${step < 0 ? "day-guide-welcome" : ""}`}>
        <div className="day-guide-top"><Button variant="ghost" onClick={() => setOpen(false)}>‹ Atrás</Button><span>{item ? `Paso ${step + 1} de ${round.length}` : "Modo guiado"}</span></div>
        <div key={step} className="day-guide-body" ref={stepHeading} tabIndex={-1}>
          {!item && <><DialogTitle>{step < 0 ? round.length === 1 ? "Empezamos por tu prioridad" : `Empezamos por tus ${round.length} prioridades` : "Terminaste la ronda"}</DialogTitle>
          <DialogDescription>
            {step < 0 ? `${round.length} ${round.length === 1 ? "prioridad" : "prioridades"} de ${pendingCount} ${pendingCount === 1 ? "pendiente" : "pendientes"}. Te mostramos de a una, la más urgente primero.`
              : `${recordedCount} ${recordedCount === 1 ? "seguimiento registrado" : "seguimientos registrados"} · ${skippedCount} ${skippedCount === 1 ? "contacto saltado" : "contactos saltados"}. Quedan ${pendingCount} contactos prioritarios en tu tablero.`}
          </DialogDescription></>}
          <ol className="day-guide-steps" aria-label="Progreso de la ronda">
            {round.map((entry, index) => <li key={entry.lead.id} aria-current={step === index ? "step" : undefined} data-result={results[entry.lead.id]} aria-label={`${entry.lead.name}: ${results[entry.lead.id] === "recorded" ? "seguimiento registrado" : results[entry.lead.id] === "skipped" ? "saltado" : step === index ? "actual" : "pendiente"}`}>
              {results[entry.lead.id] === "skipped" ? "–" : results[entry.lead.id] === "recorded" ? <ClipboardCheck aria-hidden /> : step < 0 ? leadInitials(entry.lead.name) : index + 1}
            </li>)}
          </ol>
          {step < 0 && <>
            {round.length > 0 ? <Button className="mi-day-primary" onClick={() => setStep(0)}>Empezar <ArrowRight aria-hidden /></Button> : <p>No tenés contactos prioritarios pendientes. Podés revisar tu agenda.</p>}
            <Button variant="outline" className="mi-day-secondary" onClick={() => setOpen(false)}>Ver el tablero completo</Button>
          </>}
          {item && <>
            <div className="day-guide-client"><span className="day-avatar day-blue" aria-hidden>{leadInitials(item.lead.name)}</span><DialogTitle>{item.lead.name}</DialogTitle><DialogDescription className={`day-chip ${item.isOverdue ? "day-rose" : "day-amber"}`}>{priorityReason(item)}</DialogDescription><p className="day-muted">{item.lead.phone || "Sin teléfono registrado"}</p></div>
            {recorded ? <><p role="status" className="day-save-success"><Check aria-hidden />Listo · seguimiento guardado</p><Button className="mi-day-primary day-guide-complete" onClick={() => setStep(step + 1)}>Listo · seguir <ArrowRight aria-hidden /></Button></> : <>
              {phone ? <a className="mi-day-primary day-guide-action" href={`tel:${phone}`} onClick={() => setRecording(item.lead)}><Phone aria-hidden />Llamar a {item.lead.name.split(" ")[0]}</a> : <Link className="mi-day-primary" href={`/admin/leads/${item.lead.id}`}>Completar datos del cliente</Link>}
              <Button className="mi-day-secondary" onClick={() => setRecording(item.lead)}>¿Qué pasó? Registrar resultado</Button>
              <Button variant="ghost" onClick={() => { setResults(previous => ({ ...previous, [item.lead.id]: "skipped" })); setStep(step + 1); }}>Saltar por ahora</Button>
            </>}
          </>}
          {step >= round.length && step >= 0 && <><p className="day-muted">Los resultados quedaron en el historial de cada cliente. Los contactos pendientes siguen en «Tu próximo paso».</p><Button className="mi-day-primary" onClick={() => setOpen(false)}>Volver a Mi Día</Button></>}
        </div>
        {recording && <LeadFollowUpEditor className="mi-day day-guide-editor" title="¿Qué pasó?" lead={recording} onClose={() => setRecording(null)} onConfirm={async followUp => {
          await onSave(followUp, recording);
          setResults(previous => ({ ...previous, [recording.id]: "recorded" }));
          setRecording(null);
        }} />}
      </DialogContent>
    </Dialog>
  );
}
