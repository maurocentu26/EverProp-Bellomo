"use client";

import { useCallback, useEffect, useState } from "react";
import { BookOpenCheck, Plus, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { useCurrentSession } from "@/hooks/use-current-session";
import {
  KNOWLEDGE_STATUS_LABELS,
  approveKnowledge,
  createKnowledge,
  listKnowledge,
  revokeKnowledge,
  type KnowledgeDocument,
} from "@/lib/assistant-api";

const WRITERS = ["TENANT_ADMIN", "SALES_MANAGER", "SUPER_ADMIN"];

const inputClass = "min-h-11 w-full rounded-xl border border-border bg-background px-3 text-sm";

export function KnowledgeManager() {
  const { user } = useCurrentSession();
  const canWrite = WRITERS.includes(user?.apiRole ?? "");
  const [docs, setDocs] = useState<KnowledgeDocument[]>([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({ title: "", body: "", audience: "PUBLIC" as "PUBLIC" | "INTERNAL", validUntil: "" });

  const refresh = useCallback(async () => {
    try {
      setDocs((await listKnowledge()).data);
      setError("");
    } catch {
      setError("No se pudo cargar la base de conocimiento.");
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function create(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    try {
      await createKnowledge({
        title: form.title.trim(),
        body: form.body.trim(),
        audience: form.audience,
        valid_until: form.validUntil ? new Date(`${form.validUntil}T23:59:59`).toISOString() : undefined,
      });
      setForm({ title: "", body: "", audience: "PUBLIC", validUntil: "" });
      toast.success("Guardada como borrador. Revisala y aprobala para que el asistente la use.");
      await refresh();
    } catch {
      toast.error("No se pudo guardar. Revisá el título, el texto y la fecha de vigencia.");
    } finally {
      setBusy(false);
    }
  }

  async function act(doc: KnowledgeDocument, action: "approve" | "revoke") {
    if (action === "revoke" && !window.confirm(`¿Revocar "${doc.title}"? El asistente deja de usarla de inmediato.`)) return;
    try {
      await (action === "approve" ? approveKnowledge(doc.id) : revokeKnowledge(doc.id));
      toast.success(action === "approve" ? "Aprobada: el asistente ya puede citarla." : "Revocada.");
      await refresh();
    } catch {
      toast.error("No se pudo actualizar.");
    }
  }

  return (
    <section className="mx-auto flex w-full max-w-5xl min-w-0 flex-col gap-4 pb-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Conocimiento del asistente</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Preguntas frecuentes, financiación y promociones. El asistente solo usa lo aprobado y vigente, y nunca saca de acá precios ni disponibilidad: eso lo lee del inventario.
          </p>
        </div>
        <button type="button" onClick={() => void refresh()} className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-border bg-card px-4 text-sm font-semibold">
          <RefreshCw className="h-4 w-4" aria-hidden /> Actualizar
        </button>
      </header>

      {canWrite && (
        <form onSubmit={create} className="grid gap-3 rounded-2xl border border-border bg-card p-4">
          <h2 className="flex items-center gap-2 font-semibold"><Plus className="h-4 w-4" aria-hidden /> Nueva entrada</h2>
          <label className="grid gap-1 text-sm font-medium">
            Título
            <input required maxLength={200} value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} className={inputClass} placeholder="Promoción primavera" />
          </label>
          <label className="grid gap-1 text-sm font-medium">
            Texto (podés usar títulos con ##)
            <textarea required maxLength={60000} rows={8} value={form.body} onChange={(e) => setForm({ ...form, body: e.target.value })}
              className="w-full rounded-xl border border-border bg-background p-3 text-sm" placeholder={"## Financiación\n\nHasta 36 cuotas fijas en pesos..."} />
          </label>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="grid gap-1 text-sm font-medium">
              Audiencia
              <select value={form.audience} onChange={(e) => setForm({ ...form, audience: e.target.value as "PUBLIC" | "INTERNAL" })} className={inputClass}>
                <option value="PUBLIC">Pública (el asistente puede decirla)</option>
                <option value="INTERNAL">Interna (solo equipo)</option>
              </select>
            </label>
            <label className="grid gap-1 text-sm font-medium">
              Vigente hasta (opcional)
              <input type="date" value={form.validUntil} onChange={(e) => setForm({ ...form, validUntil: e.target.value })} className={inputClass} />
            </label>
          </div>
          <button type="submit" disabled={busy} className="min-h-11 justify-self-start rounded-xl bg-blue-600 px-5 text-sm font-semibold text-white disabled:opacity-60">
            Guardar borrador
          </button>
        </form>
      )}

      {error && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-800 dark:bg-red-500/10 dark:text-red-200">{error}</p>}
      <ul role="list" className="divide-y divide-border rounded-2xl border border-border bg-card">
        {docs.length === 0 && !error && <li className="p-6 text-center text-sm text-muted-foreground">Todavía no hay entradas.</li>}
        {docs.map((doc) => {
          const expired = doc.valid_until !== null && new Date(doc.valid_until) < new Date();
          return (
            <li key={doc.id} className="flex flex-wrap items-center justify-between gap-3 p-4">
              <div className="min-w-0">
                <p className="flex items-center gap-2 font-semibold"><BookOpenCheck className="h-4 w-4 shrink-0" aria-hidden /> <span className="truncate">{doc.title}</span></p>
                <p className="text-xs text-muted-foreground">
                  {KNOWLEDGE_STATUS_LABELS[doc.status]} · {doc.audience === "PUBLIC" ? "Pública" : "Interna"}
                  {doc.valid_until && ` · vigente hasta ${new Date(doc.valid_until).toLocaleDateString("es-AR")}`}
                  {expired && " · vencida (el asistente no la usa)"}
                </p>
              </div>
              {canWrite && doc.status !== "REVOKED" && (
                <div className="flex gap-2">
                  {doc.status === "DRAFT" && (
                    <button type="button" onClick={() => void act(doc, "approve")} className="min-h-10 rounded-lg bg-emerald-600 px-3 text-sm font-semibold text-white">Aprobar</button>
                  )}
                  <button type="button" onClick={() => void act(doc, "revoke")} className="min-h-10 rounded-lg border border-border px-3 text-sm font-semibold">Revocar</button>
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
