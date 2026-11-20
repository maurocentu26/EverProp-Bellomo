"use client";

import { useEffect, useState } from "react";
import { Save } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import type { Project } from "@/data/admin-sample";
import { apiFetch, EverpropApiError, updateEverpropProject } from "@/lib/everprop-api";
import { emptyIntakeBasics, intakeBasics, projectEditPayload, publishesProject, type IntakeBasics, type IntakeProject } from "@/lib/project-intake";
import { ProjectBasicsFields, projectFieldClass } from "@/components/admin/ProjectBasicsFields";

type Props = { projectId: string; open: boolean; onOpenChange: (open: boolean) => void; onSaved: (project: Project) => void };

/** EVP-171: editar los datos de un proyecto existente (también los importados del Excel) desde su ficha. */
export function ProjectEditDialog({ projectId, open, onOpenChange, onSaved }: Props) {
  const [form, setForm] = useState<IntakeBasics>(emptyIntakeBasics);
  const [description, setDescription] = useState("");
  const [originalStatus, setOriginalStatus] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [confirmPublish, setConfirmPublish] = useState(false);
  const [error, setError] = useState("");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({});

  // The page mounts this dialog only while it is open, so every opening starts from a fresh load.
  useEffect(() => {
    const controller = new AbortController();
    apiFetch<{ data: IntakeProject & { description?: string | null } }>(`/api/v1/admin/projects/${encodeURIComponent(projectId)}`, { signal: controller.signal })
      .then(({ data }) => { setForm(intakeBasics(data)); setDescription(data.description ?? ""); setOriginalStatus(data.status); })
      .catch((reason) => { if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : "No se pudo cargar el proyecto."); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [projectId]);

  function change(key: keyof IntakeBasics, value: string) {
    setForm((previous) => ({ ...previous, [key]: value }));
    if (key === "status") setConfirmPublish(false);
  }

  async function save(event: React.FormEvent) {
    event.preventDefault();
    if (saving) return;
    setError(""); setFieldErrors({});
    let payload;
    try { payload = projectEditPayload(form, description); } catch (reason) { setError(reason instanceof Error ? reason.message : "Revisá los datos."); return; }
    if (publishesProject(originalStatus, form.status) && !confirmPublish) { setConfirmPublish(true); return; }
    setSaving(true);
    try {
      onSaved(await updateEverpropProject(projectId, payload));
      onOpenChange(false);
    } catch (reason) {
      if (reason instanceof EverpropApiError && reason.status === 403) setError("Tu perfil no tiene permiso para editar o publicar este proyecto.");
      else {
        setError(reason instanceof Error ? reason.message : "No se pudo guardar el proyecto.");
        if (reason instanceof EverpropApiError) setFieldErrors(reason.errors ?? {});
      }
    } finally { setSaving(false); }
  }

  return <Dialog open={open} onOpenChange={(next) => { if (!saving) onOpenChange(next); }}>
    <DialogContent className="admin-workspace w-[calc(100%-2rem)] sm:max-w-2xl max-h-[calc(100dvh-2rem)] overflow-y-auto rounded-2xl p-6">
      <DialogHeader>
        <DialogTitle>Editar datos del proyecto</DialogTitle>
        <DialogDescription>Los cambios se ven en el panel apenas se guardan. Las unidades se editan desde la lista de unidades.</DialogDescription>
      </DialogHeader>
      {loading ? <p role="status" className="py-6">Cargando proyecto…</p> : <form onSubmit={save} className="space-y-5">
        {error && <p role="alert" className="rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-900 dark:bg-red-950 dark:text-red-100">{error}</p>}
        <fieldset disabled={saving} className="grid gap-5 sm:grid-cols-2">
          <ProjectBasicsFields form={form} onChange={change} fieldErrors={fieldErrors} />
          <label className="block text-sm font-medium sm:col-span-2" htmlFor="project-description">Descripción<textarea id="project-description" rows={4} maxLength={100000} className={projectFieldClass} value={description} onChange={(event) => setDescription(event.target.value)} aria-invalid={!!fieldErrors.description} />{fieldErrors.description && <span role="alert" className="mt-1 block text-sm text-red-700 dark:text-red-300">{fieldErrors.description.join(" ")}</span>}</label>
        </fieldset>
        {confirmPublish && <p role="alert" className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900 dark:bg-amber-950 dark:text-amber-100">Con esta etapa el proyecto queda publicado: sus unidades disponibles pasan a verse como oferta. Guardá de nuevo para confirmar.</p>}
        <div className="flex flex-wrap justify-end gap-3">
          <Button type="button" variant="outline" disabled={saving} onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button type="submit" disabled={saving}><Save className="mr-2 size-4" aria-hidden="true" />{saving ? "Guardando…" : confirmPublish ? "Confirmar y publicar" : "Guardar cambios"}</Button>
        </div>
      </form>}
    </DialogContent>
  </Dialog>;
}
