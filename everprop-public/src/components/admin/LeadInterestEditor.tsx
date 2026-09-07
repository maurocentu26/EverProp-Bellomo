"use client";

import { useMemo, useState, type FormEvent } from "react";
import { Building2, Layers3, Save, SlidersHorizontal, X } from "lucide-react";

import {
  type LeadInterest,
  type LeadInterestCategory,
  type Project,
  type Property,
} from "@/data/admin-sample";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";

const CATEGORY_OPTIONS: { value: LeadInterestCategory; label: string }[] = [
  { value: "loteo", label: "Loteo" },
  { value: "local", label: "Local" },
  { value: "cochera", label: "Cochera" },
  { value: "tradicional", label: "Tradicional" },
];

type LeadInterestEditorProps = {
  interest?: LeadInterest;
  projects: Project[];
  properties: Property[];
  companyId: string;
  onClose: () => void;
  onSave: (interest: LeadInterest) => void;
};

type DraftInterest = {
  category?: LeadInterestCategory | "";
  projectId?: string;
  propertyId?: string;
  unitId?: string;
  preferences?: string;
  notes?: string;
};

export function LeadInterestEditor({
  interest,
  projects,
  properties,
  companyId,
  onClose,
  onSave,
}: LeadInterestEditorProps) {
  const isEditing = Boolean(interest);
  const [draft, setDraft] = useState<DraftInterest>(() => ({
    category: interest?.category ?? "",
    projectId: interest?.projectId ?? "",
    propertyId: interest?.propertyId ?? "",
    unitId: interest?.unitId ?? "",
    preferences: interest?.preferences ?? "",
    notes: interest?.notes ?? "",
  }));

  const filteredProperties = useMemo(() => {
    return properties.filter((property) => {
      if (draft.projectId && property.projectId !== draft.projectId) return false;
      if (draft.category === "local" && property.propertyType !== "Local") return false;
      if (draft.category === "cochera" && property.propertyType !== "Cochera") return false;
      if (draft.category === "loteo" && property.propertyType !== "Lote") return false;
      if (draft.category === "tradicional" && !["Casa", "Departamento", "Propiedad"].includes(property.propertyType)) return false;
      return true;
    });
  }, [draft.category, draft.projectId, properties]);

  const unitOptions = useMemo(() => {
    if (!draft.propertyId) return [];
    return properties.filter((property) => property.id === draft.propertyId && property.unitNumber);
  }, [draft.propertyId, properties]);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const now = new Date().toISOString();

    onSave({
      id: interest?.id ?? crypto.randomUUID(),
      companyId,
      category: draft.category || undefined,
      projectId: draft.projectId || undefined,
      propertyId: draft.propertyId || undefined,
      unitId: draft.unitId || undefined,
      preferences: draft.preferences?.trim() || undefined,
      notes: draft.notes?.trim() || undefined,
      createdAt: interest?.createdAt ?? now,
      updatedAt: now,
    });
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent 
        showCloseButton={false} 
        className="w-full sm:max-w-4xl max-h-[90vh] overflow-hidden p-0 rounded-2xl border border-slate-200 bg-white shadow-2xl flex flex-col"
      >
        <form id="lead-interest-form" onSubmit={handleSubmit} className="flex min-h-0 w-full flex-col">
          {/* Header Compacto */}
          <header className="shrink-0 border-b border-slate-100 bg-white px-6 py-4 flex items-center justify-between gap-4">
            <div className="flex items-center gap-3 min-w-0">
              <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-blue-600 text-white shadow-xs">
                <Layers3 className="size-5" aria-hidden="true" />
              </span>
              <div className="min-w-0">
                <DialogTitle className="text-lg font-bold text-slate-950 truncate">
                  {isEditing ? "Editar interés" : "Agregar interés"}
                </DialogTitle>
                <DialogDescription className="text-xs text-slate-500 truncate">
                  Cada ficha es independiente. Podés completar solamente los datos que conozcas.
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

          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-6 py-5">
            <div className="grid gap-6 md:grid-cols-2">
              {/* Sección 1: Activo */}
              <section className="space-y-4 rounded-xl border border-slate-200 bg-slate-50/50 p-4" aria-labelledby="interest-asset-title">
                <div className="flex items-center gap-2 border-b border-slate-200/80 pb-3">
                  <Building2 className="size-4 text-blue-700" aria-hidden="true" />
                  <h2 id="interest-asset-title" className="text-sm font-bold text-slate-950">Activo de interés</h2>
                </div>

                <label className="block text-xs font-bold text-slate-700">
                  Categoría
                  <select
                    value={draft.category}
                    onChange={(event) => setDraft((current) => ({ ...current, category: event.target.value as LeadInterestCategory | "" }))}
                    className="mt-1.5 h-10 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm text-slate-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                  >
                    <option value="">Sin categoría definida</option>
                    {CATEGORY_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>{option.label}</option>
                    ))}
                  </select>
                </label>

                <label className="block text-xs font-bold text-slate-700">
                  Proyecto / Desarrollo
                  <select
                    value={draft.projectId}
                    onChange={(event) => setDraft((current) => ({ ...current, projectId: event.target.value }))}
                    className="mt-1.5 h-10 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm text-slate-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                  >
                    <option value="">Cualquier proyecto o sin desarrollo</option>
                    {projects.map((project) => (
                      <option key={project.id} value={project.id}>{project.name}</option>
                    ))}
                  </select>
                </label>

                <label className="block text-xs font-bold text-slate-700">
                  Propiedad
                  <select
                    value={draft.propertyId}
                    onChange={(event) => setDraft((current) => ({ ...current, propertyId: event.target.value }))}
                    className="mt-1.5 h-10 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm text-slate-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                  >
                    <option value="">Seleccionar propiedad</option>
                    {filteredProperties.map((property) => (
                      <option key={property.id} value={property.id}>{property.title}</option>
                    ))}
                  </select>
                </label>

                {unitOptions.length > 0 && (
                  <label className="block text-xs font-bold text-slate-700">
                    Unidad / Lote específico
                    <select
                      value={draft.unitId}
                      onChange={(event) => setDraft((current) => ({ ...current, unitId: event.target.value }))}
                      className="mt-1.5 h-10 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm text-slate-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                    >
                      <option value="">Sin unidad específica</option>
                      {unitOptions.map((unit) => (
                        <option key={unit.id} value={unit.id}>Unidad {unit.unitNumber}</option>
                      ))}
                    </select>
                  </label>
                )}
              </section>

              {/* Sección 2: Preferencias y Notas */}
              <section className="space-y-4 rounded-xl border border-slate-200 bg-slate-50/50 p-4" aria-labelledby="interest-notes-title">
                <div className="flex items-center gap-2 border-b border-slate-200/80 pb-3">
                  <SlidersHorizontal className="size-4 text-blue-700" aria-hidden="true" />
                  <h2 id="interest-notes-title" className="text-sm font-bold text-slate-950">Preferencias y notas</h2>
                </div>

                <label className="block text-xs font-bold text-slate-700">
                  Preferencias del cliente
                  <Textarea
                    value={draft.preferences}
                    onChange={(event) => setDraft((current) => ({ ...current, preferences: event.target.value }))}
                    rows={3}
                    placeholder="Ubicación, superficie, presupuesto o características buscadas..."
                    className="mt-1.5 min-h-24 border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-500 rounded-xl"
                  />
                </label>

                <label className="block text-xs font-bold text-slate-700">
                  Notas internas del interés
                  <Textarea
                    value={draft.notes}
                    onChange={(event) => setDraft((current) => ({ ...current, notes: event.target.value }))}
                    rows={3}
                    placeholder="Conversaciones, acuerdos u observaciones de este interés..."
                    className="mt-1.5 min-h-24 border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-500 rounded-xl"
                  />
                </label>

                <div className="rounded-xl border border-slate-200 bg-white p-3 text-xs text-slate-500">
                  Los datos vacíos aparecerán como pendientes, pero no bloquean el guardado.
                </div>
              </section>
            </div>
          </div>

          {/* Footer Compacto */}
          <footer className="shrink-0 border-t border-slate-100 bg-slate-50/60 px-6 py-3.5 flex justify-end gap-2.5">
            <Button type="button" variant="outline" onClick={onClose} className="h-10 px-4 text-xs font-semibold rounded-xl border-slate-300 hover:bg-slate-100">
              Cancelar
            </Button>
            <Button type="submit" className="h-10 gap-1.5 bg-blue-600 px-5 text-xs font-bold text-white hover:bg-blue-700 rounded-xl shadow-sm">
              <Save className="size-4" aria-hidden="true" />
              {isEditing ? "Guardar cambios" : "Agregar interés"}
            </Button>
          </footer>
        </form>
      </DialogContent>
    </Dialog>
  );
}
