"use client";

import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { getAssistantTrace, type AssistantRun } from "@/lib/conversations-api";

const DECISION: Record<string, string> = { REPLY: "Respondió", HANDOFF: "Derivó a un asesor", BLOCK: "Bloqueada", IGNORE: "Ignoró", ASK_CLARIFICATION: "Pidió aclaración" };

/** EVP-24: tenant-admin view of what the assistant did on each turn. Everything renders as plain text.
 *  Invariant: excerpts and tool names are attacker-controlled; never pass them to markdown, innerHTML or href. */
export function AssistantTrace({ conversation, open, onOpenChange }: { conversation: string; open: boolean; onOpenChange: (open: boolean) => void }) {
  const [runs, setRuns] = useState<AssistantRun[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    let alive = true;
    setRuns(null); setError(null);
    getAssistantTrace(conversation).then(({ data }) => { if (alive) setRuns(data); })
      .catch(() => { if (alive) setError("No se pudo cargar la traza. Probá de nuevo en un momento."); });
    return () => { alive = false; };
  }, [conversation, open]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="assistant-trace max-h-[85dvh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Traza del asistente</DialogTitle>
          <DialogDescription>Qué preguntó el cliente, qué consultó el asistente y qué respondió. Últimos 20 turnos.</DialogDescription>
        </DialogHeader>
        {error && <p role="alert">{error}</p>}
        {!runs && !error && <p role="status">Cargando…</p>}
        {runs?.length === 0 && <p>El asistente todavía no intervino en esta conversación.</p>}
        <ol className="space-y-4">
          {runs?.map((run, i) => (
            <li key={i} className="rounded-xl border border-border p-4">
              <p className="font-semibold">
                {new Date(run.started_at).toLocaleString("es-AR", { dateStyle: "short", timeStyle: "short" })} · {run.mode === "COPILOT" ? "Borrador para el asesor" : "Automático"} · {DECISION[run.decision] ?? run.decision}
                {run.status !== "SUCCEEDED" && ` · ${run.status}${run.error_code ? ` (${run.error_code})` : ""}`}
              </p>
              <dl className="mt-2 space-y-2">
                <div><dt className="text-muted-foreground">Cliente</dt><dd className="whitespace-pre-wrap break-words">{run.question?.text ?? "—"}</dd></div>
                <div><dt className="text-muted-foreground">Respuesta</dt><dd className="whitespace-pre-wrap break-words">{run.reply?.text ?? "Sin respuesta enviada"}</dd></div>
                <div><dt className="text-muted-foreground">Conocimiento usado</dt><dd>
                  {run.sources.length === 0 ? "Ninguno" : <ul className="list-disc pl-5">{run.sources.map(s => (
                    <li key={s.id} className="break-words">{s.document ? `${s.document}${s.heading ? ` · ${s.heading}` : ""}` : `${s.id} (documento ya no disponible)`}
                      {s.excerpt && <span className="block text-muted-foreground">{s.excerpt}</span>}</li>))}</ul>}
                </dd></div>
                <div><dt className="text-muted-foreground">Herramientas</dt><dd>
                  {run.tools.length === 0 ? "Ninguna" : run.tools.map(t => `${t.name}: ${t.ok ? "ok" : t.code ?? "error"}${t.replayed ? " (repetida)" : ""}`).join(" · ")}
                </dd></div>
                {run.guard.length > 0 && <div><dt className="text-muted-foreground">Control de salida</dt><dd>Frenó la respuesta: {run.guard.join(", ")}</dd></div>}
                <div><dt className="text-muted-foreground">Modelo y costo</dt><dd className="break-words">
                  {[run.model.name, run.model.prompt_version && `prompt ${run.model.prompt_version}`, `${run.usage.calls} llamadas`,
                    run.usage.input_tokens != null && `${run.usage.input_tokens} + ${run.usage.output_tokens ?? 0} tokens`,
                    run.usage.cost != null && `${run.usage.currency ?? ""} ${Number(run.usage.cost).toFixed(4)}`].filter(Boolean).join(" · ")}
                </dd></div>
              </dl>
            </li>
          ))}
        </ol>
      </DialogContent>
    </Dialog>
  );
}
