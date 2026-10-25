"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Archive, ArrowLeft, BookOpenCheck, CheckCircle2, FileText, Gauge, Pencil, Plus, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { useCurrentSession } from "@/hooks/use-current-session";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { isMockDataMode } from "@/lib/data-mode";
import { knowledgeSample } from "@/data/knowledge-sample";
import { approveKnowledge, createKnowledge, listKnowledge, revokeKnowledge, type KnowledgeDocument } from "@/lib/assistant-api";

const WRITERS = ["TENANT_ADMIN", "SALES_MANAGER", "SUPER_ADMIN"];
type DocumentView = KnowledgeDocument & { body?: string; topic?: string; kind?: string };
type Pending = { action: "approve" | "revoke"; doc: DocumentView } | { action: "create" };
const emptyForm = { title: "", body: "", audience: "PUBLIC" as "PUBLIC" | "INTERNAL", validUntil: "" };
const dateLabel = (value: string) => new Date(value).toLocaleDateString("es-AR", { timeZone: "America/Argentina/Buenos_Aires" });
const statusLabel = (doc: DocumentView) => doc.status === "REVOKED" ? "Archivado · el asistente no lo usa" : doc.status === "DRAFT" ? "Borrador · pendiente de publicar" : doc.valid_until && new Date(doc.valid_until) < new Date() ? "Vencido · el asistente no lo usa" : "Publicado";

function DocumentDetails({ doc }: { doc: DocumentView }) {
  const StatusIcon = doc.status === "REVOKED" ? Archive : doc.status === "DRAFT" ? Pencil : CheckCircle2;
  return <>
    <p className="knowledge-status"><StatusIcon size={20} aria-hidden />{statusLabel(doc)}</p>
    <dl className="knowledge-meta">
      <div><dt>Tipo</dt><dd>{doc.kind ?? "Sin informar"}</dd></div>
      <div><dt>Proyecto o tema</dt><dd>{doc.topic ?? "Sin informar"}</dd></div>
      <div><dt>Versión</dt><dd>{doc.version}</dd></div>
      <div><dt>Actualizado</dt><dd>{dateLabel(doc.updated_at)}</dd></div>
      <div><dt>Quién puede consultarlo</dt><dd>{doc.audience === "PUBLIC" ? "Público" : "Solo el equipo"}</dd></div>
      <div><dt>Vigente hasta</dt><dd>{doc.valid_until ? dateLabel(doc.valid_until) : "Sin fecha de vencimiento"}</dd></div>
      {doc.approved_at && <div><dt>Publicado</dt><dd>{dateLabel(doc.approved_at)}</dd></div>}
    </dl>
    <details className="knowledge-content"><summary>Ver contenido</summary><p>{doc.body ?? "El contenido de este documento no está disponible para consultar desde el panel."}</p></details>
  </>;
}

export function KnowledgeManager() {
  const { user, isAdvisor } = useCurrentSession();
  const canWrite = WRITERS.includes(user?.apiRole ?? "");
  const [docs, setDocs] = useState<DocumentView[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [pending, setPending] = useState<Pending | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      setDocs(isMockDataMode ? knowledgeSample.map(doc => ({ ...doc })) : (await listKnowledge()).data);
      setError("");
    } catch {
      setError("No pudimos cargar los documentos. Volvé a intentarlo.");
    } finally { setLoading(false); }
  }, []);
  useEffect(() => { void refresh(); }, [refresh]);

  async function confirm() {
    if (!canWrite || !pending || busy) return;
    setBusy(true);
    try {
      if (isMockDataMode) {
        if (pending.action === "create") {
          setDocs(current => [...current, { id: `mock-${Date.now()}`, title: form.title.trim(), body: form.body.trim(), audience: form.audience, status: "DRAFT", version: 1, updated_at: new Date().toISOString(), approved_at: null, valid_until: form.validUntil ? new Date(`${form.validUntil}T23:59:59`).toISOString() : null, kind: "Texto" }]);
        } else {
          setDocs(current => current.map(doc => doc.id === pending.doc.id ? { ...doc, status: pending.action === "approve" ? "APPROVED" : "REVOKED" } : doc));
        }
      } else {
        if (pending.action === "create") await createKnowledge({ title: form.title.trim(), body: form.body.trim(), audience: form.audience, valid_until: form.validUntil ? new Date(`${form.validUntil}T23:59:59`).toISOString() : undefined });
        else await (pending.action === "approve" ? approveKnowledge(pending.doc.id) : revokeKnowledge(pending.doc.id));
        await refresh();
      }
      toast.success(pending.action === "create" ? "Borrador guardado. Revisalo antes de publicarlo." : pending.action === "approve" ? "Documento publicado." : "Documento archivado.");
      if (pending.action === "create") { setForm(emptyForm); setEditing(false); }
      setPending(null);
    } catch { toast.error("No pudimos guardar el cambio. Revisá los datos y volvé a intentarlo."); }
    finally { setBusy(false); }
  }

  return <section className="knowledge-view mx-auto flex w-full max-w-6xl flex-col gap-6 pb-6">
    {!isAdvisor && <Link href="/admin" className="knowledge-back"><ArrowLeft size={20} aria-hidden />Atrás</Link>}
    <header><div><h1>Conocimiento IA</h1><p>Lo que el asistente puede consultar para responder</p></div>
      <div className="knowledge-actions">
        {user?.apiRole === "SUPER_ADMIN" && <Link href="/admin/conocimiento/uso" className="knowledge-button"><Gauge size={20} aria-hidden />Uso de la IA</Link>}
        <button type="button" disabled={loading || busy} onClick={() => void refresh()}><RefreshCw size={20} aria-hidden />Actualizar</button>
        {canWrite && <button type="button" className="inventory-cta" onClick={() => setEditing(true)}><Plus size={20} aria-hidden />Agregar documento</button>}
      </div>
    </header>
    <p>Precios y disponibilidad se consultan siempre en el inventario. Los borradores y documentos archivados o vencidos no se usan para responder.</p>
    {canWrite && editing && <form className="knowledge-card knowledge-form" onSubmit={event => { event.preventDefault(); if (form.title.trim() && form.body.trim()) setPending({ action: "create" }); }}>
      <h2>Nuevo documento</h2>
      <label>Título<input required maxLength={200} value={form.title} onChange={event => setForm({ ...form, title: event.target.value })} placeholder="Preguntas frecuentes de Las Moras" /></label>
      <label>Contenido<textarea required maxLength={60000} rows={8} value={form.body} onChange={event => setForm({ ...form, body: event.target.value })} /></label>
      <label>Quién puede consultarlo<select value={form.audience} onChange={event => setForm({ ...form, audience: event.target.value as "PUBLIC" | "INTERNAL" })}><option value="PUBLIC">Público</option><option value="INTERNAL">Solo el equipo</option></select></label>
      <label>Vigente hasta (opcional)<input type="date" value={form.validUntil} onChange={event => setForm({ ...form, validUntil: event.target.value })} /></label>
      <div className="knowledge-actions"><button type="submit" disabled={busy} className="inventory-cta">Guardar borrador</button><button type="button" onClick={() => setEditing(false)}>Cerrar formulario</button></div>
    </form>}
    {loading ? <p role="status">Cargando documentos…</p> : error ? <div role="alert" className="knowledge-card"><p>{error}</p><button type="button" onClick={() => void refresh()}>Reintentar</button></div> : <>
      <h2>{docs.length.toLocaleString("es-AR")} {docs.length === 1 ? "documento" : "documentos"}</h2>
      {docs.length === 0 ? <div className="knowledge-card"><BookOpenCheck size={32} aria-hidden /><h3>Todavía no hay documentos</h3><p>{canWrite ? "Agregá las respuestas y condiciones que el asistente puede consultar." : "Cuando el equipo agregue documentos, vas a poder consultarlos acá."}</p></div> : <ul className="knowledge-grid">{docs.map(doc => <li key={doc.id} className="knowledge-card">
        <h3><FileText size={24} aria-hidden />{doc.title}</h3>
        <DocumentDetails doc={doc} />
        {canWrite && doc.status !== "REVOKED" && <div className="knowledge-actions">
          {doc.status === "DRAFT" && <button type="button" disabled={busy} className="inventory-cta" onClick={() => setPending({ action: "approve", doc })}>Publicar</button>}
          <button type="button" disabled={busy} onClick={() => setPending({ action: "revoke", doc })}>Archivar</button>
        </div>}
      </li>)}</ul>}
    </>}
    {canWrite && <Dialog open={Boolean(pending)} onOpenChange={open => { if (!open && !busy) setPending(null); }}>
      <DialogContent showCloseButton={false} className="knowledge-view knowledge-dialog admin-workspace sm:max-w-2xl">
        <DialogTitle>{pending?.action === "create" ? "¿Guardar este borrador?" : pending?.action === "approve" ? "¿Publicar este documento?" : "¿Archivar este documento?"}</DialogTitle>
        <DialogDescription className="knowledge-description">{pending?.action === "create" ? "El asistente no lo usará hasta que lo publiques." : pending?.action === "approve" ? "El asistente podrá consultarlo mientras esté vigente. Revisá los datos antes de continuar." : "El asistente dejará de usarlo de inmediato. El documento seguirá visible en el panel."}</DialogDescription>
        {pending?.action === "create" ? <><h3>{form.title}</h3><p className="knowledge-body">{form.body}</p><p>{form.audience === "PUBLIC" ? "Público" : "Solo el equipo"} · {form.validUntil ? `Vigente hasta ${dateLabel(`${form.validUntil}T23:59:59`)}` : "Sin fecha de vencimiento"}</p></> : pending && <><h3>{pending.doc.title}</h3><DocumentDetails doc={pending.doc} /></>}
        <div className="knowledge-actions"><button type="button" disabled={busy} onClick={() => setPending(null)}>Cancelar</button><button type="button" className="inventory-cta" disabled={busy} onClick={() => void confirm()}>{busy ? "Guardando…" : "Confirmar"}</button></div>
      </DialogContent>
    </Dialog>}
  </section>;
}
