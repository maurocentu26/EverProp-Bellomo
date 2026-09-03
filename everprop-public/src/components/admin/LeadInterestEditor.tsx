"use client";

import { useMemo, useState, type FormEvent } from "react";
import { Building2, Home, Layers3, Save, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import type {
  LeadInterest,
  LeadInterestCategory,
  Project,
  Property,
} from "@/data/admin-sample";
import { createLeadInterest } from "@/lib/lead-interests";

const CATEGORY_OPTIONS: Array<{ value: LeadInterestCategory; label: string }> = [
  { value: "loteo", label: "Loteos" },
  { value: "local", label: "Locales" },
  { value: "cochera", label: "Cocheras" },
  { value: "tradicional", label: "Inmobiliaria tradicional" },
];

type InterestDraft = {
  category: LeadInterestCategory | "";
  projectId: string;
  propertyId: string;
  unitId: string;
  preferences: string;
  notes: string;
};

type LeadInterestEditorProps = {
  companyId: string;
  interest?: LeadInterest;
  projects: Project[];
  properties: Property[];
  onClose: () => void;
  onSave: (interest: LeadInterest) => void;
};

function initialDraft(interest?: LeadInterest): InterestDraft {
  return {
    category: interest?.category ?? "",
    projectId: interest?.projectId ?? "",
    propertyId: interest?.propertyId ?? "",
    unitId: interest?.unitId ?? "",
    preferences: interest?.preferences ?? "",
    notes: interest?.notes ?? "",
  };
}

function optionalText(value: string) {
  return value.trim() || undefined;
}

export function LeadInterestEditor({
  companyId,
  interest,
  projects,
  properties,
  onClose,
  onSave,
}: LeadInterestEditorProps) {
  const [draft, setDraft] = useState<InterestDraft>(() => initialDraft(interest));
  const isEditing = Boolean(interest);

  const standaloneProperties = useMemo(
    () => properties.filter((property) => !property.projectId),
    [properties],
  );
  const projectUnits = useMemo(
    () => properties.filter((property) => property.projectId === draft.projectId),
    [draft.projectId, properties],
  );

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const now = new Date().toISOString();
    const values = {
      category: draft.category || undefined,
      projectId: optionalText(draft.projectId),
      propertyId: optionalText(draft.propertyId),
      unitId: optionalText(draft.unitId),
      preferences: optionalText(draft.preferences),
      notes: optionalText(draft.notes),
    };

    onSave(
      interest
        ? { ...interest, ...values, companyId, updatedAt: now }
        : createLeadInterest(companyId, values, now),
    );
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent fullScreen showCloseButton={false} className="flex bg-slate-50">
        <form id="lead-interest-form" onSubmit={handleSubmit} className="flex h-dvh min-h-0 w-full flex-col">
          <header className="shrink-0 border-b border-slate-200 bg-white px-4 pb-5 pt-[max(1rem,env(safe-area-inset-top))] sm:px-8 lg:px-12">
            <div className="mx-auto flex w-full max-w-[min(94vw,2200px)] items-start justify-between gap-5">
              <div className="flex min-w-0 items-start gap-4">
                <span className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-blue-600 text-white shadow-lg shadow-blue-600/20 sm:size-14">
                  <Layers3 className="size-6" aria-hidden="true" />
                </span>
                <div>
                  <DialogTitle className="text-2xl font-bold tracking-tight text-slate-950 sm:text-3xl">
                    {isEditing ? "Editar interés" : "Agregar interés"}
                  </DialogTitle>
                  <DialogDescription className="mt-2 text-base leading-7 text-slate-600 sm:text-lg">
                    Cada ficha es independiente. Podés completar solamente los datos que conozcas.
                  </DialogDescription>
                </div>
              </div>
              <Button type="button" variant="outline" onClick={onClose} className="h-12 shrink-0 gap-2 px-4 text-base font-semibold sm:h-14">
                <X className="size-5" aria-hidden="true" />
                <span className="hidden sm:inline">Cerrar</span>
              </Button>
            </div>
          </header>

          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-6 sm:px-8 sm:py-8 lg:px-12 lg:py-10">
            <div className="mx-auto grid w-full max-w-[min(94vw,2200px)] gap-6 lg:grid-cols-2 xl:gap-8">
              <section className="space-y-6 rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-7 lg:p-8" aria-labelledby="interest-asset-title">
                <div className="flex items-start gap-4 border-b border-slate-200 pb-5">
                  <span className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-700">
                    <Building2 className="size-6" aria-hidden="true" />
                  </span>
                  <div>
                    <h2 id="interest-asset-title" className="text-2xl font-bold text-slate-950">Activo de interés</h2>
                    <p className="mt-1 text-base leading-7 text-slate-600">Proyecto, propiedad y unidad son opcionales.</p>
                  </div>
                </div>

                <label className="block text-base font-bold text-slate-800">
                  Categoría
                  <select
                    value={draft.category}
                    onChange={(event) => setDraft((current) => ({ ...current, category: event.target.value as LeadInterestCategory | "" }))}
                    className="mt-2 h-14 w-full rounded-xl border border-slate-300 bg-white px-4 text-lg font-normal text-slate-900 outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-500/15"
                  >
                    <option value="">Sin categoría informada</option>
                    {CATEGORY_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                  </select>
                </label>

                <label className="block text-base font-bold text-slate-800">
                  Proyecto
                  <select
                    value={draft.projectId}
                    onChange={(event) => {
                      const projectId = event.target.value;
                      setDraft((current) => {
                        const selectedUnit = properties.find((property) => property.id === current.unitId);
                        return {
                          ...current,
                          projectId,
                          unitId: selectedUnit?.projectId === projectId ? current.unitId : "",
                        };
                      });
                    }}
                    className="mt-2 h-14 w-full rounded-xl border border-slate-300 bg-white px-4 text-lg font-normal text-slate-900 outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-500/15"
                  >
                    <option value="">Sin proyecto informado</option>
                    {projects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}
                  </select>
                </label>

                <label className="block text-base font-bold text-slate-800">
                  Propiedad independiente
                  <select
                    value={draft.propertyId}
                    onChange={(event) => setDraft((current) => ({ ...current, propertyId: event.target.value }))}
                    className="mt-2 h-14 w-full rounded-xl border border-slate-300 bg-white px-4 text-lg font-normal text-slate-900 outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-500/15"
                  >
                    <option value="">Sin propiedad informada</option>
                    {standaloneProperties.map((property) => (
                      <option key={property.id} value={property.id}>{property.title} · {property.neighborhood}</option>
                    ))}
                  </select>
                </label>

                <label className="block text-base font-bold text-slate-800">
                  Unidad del proyecto
                  <select
                    value={draft.unitId}
                    disabled={!draft.projectId}
                    onChange={(event) => setDraft((current) => ({ ...current, unitId: event.target.value }))}
                    className="mt-2 h-14 w-full rounded-xl border border-slate-300 bg-white px-4 text-lg font-normal text-slate-900 outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-500/15 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-500"
                  >
                    <option value="">{draft.projectId ? "Sin unidad informada" : "Seleccioná primero un proyecto"}</option>
                    {projectUnits.map((property) => (
                      <option key={property.id} value={property.id}>{property.unitNumber || property.title} · {property.sectorName || property.neighborhood}</option>
                    ))}
                  </select>
                </label>
              </section>

              <section className="space-y-6 rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-7 lg:p-8" aria-labelledby="interest-qualification-title">
                <div className="flex items-start gap-4 border-b border-slate-200 pb-5">
                  <span className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-emerald-50 text-emerald-700">
                    <Home className="size-6" aria-hidden="true" />
                  </span>
                  <div>
                    <h2 id="interest-qualification-title" className="text-2xl font-bold text-slate-950">Calificación</h2>
                    <p className="mt-1 text-base leading-7 text-slate-600">Registrá preferencias y observaciones solamente para este interés.</p>
                  </div>
                </div>

                <label className="block text-base font-bold text-slate-800">
                  Preferencias
                  <Textarea
                    value={draft.preferences}
                    onChange={(event) => setDraft((current) => ({ ...current, preferences: event.target.value }))}
                    rows={7}
                    placeholder="Ejemplo: ubicación, superficie, presupuesto o características buscadas"
                    className="mt-2 min-h-44 border-slate-300 bg-white px-4 py-3 text-lg leading-7 text-slate-900 placeholder:text-slate-500 focus:border-blue-500"
                  />
                </label>

                <label className="block text-base font-bold text-slate-800">
                  Notas del interés
                  <Textarea
                    value={draft.notes}
                    onChange={(event) => setDraft((current) => ({ ...current, notes: event.target.value }))}
                    rows={7}
                    placeholder="Conversaciones, acuerdos u observaciones de este interés"
                    className="mt-2 min-h-44 border-slate-300 bg-white px-4 py-3 text-lg leading-7 text-slate-900 placeholder:text-slate-500 focus:border-blue-500"
                  />
                </label>

                <div className="rounded-2xl border border-blue-200 bg-blue-50 p-5 text-base leading-7 text-blue-900">
                  Los datos vacíos aparecerán como pendientes, pero no bloquean el guardado.
                </div>
              </section>
            </div>
          </div>

          <footer className="shrink-0 border-t border-slate-200 bg-white px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-4 sm:px-8 lg:px-12">
            <div className="mx-auto flex w-full max-w-[min(94vw,2200px)] flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-end">
              <Button type="button" variant="outline" onClick={onClose} className="h-14 w-full px-6 text-lg font-semibold sm:w-auto">Cancelar</Button>
              <Button type="submit" className="h-14 w-full gap-2 bg-blue-600 px-8 text-lg font-bold text-white hover:bg-blue-700 sm:w-auto sm:min-w-56">
                <Save className="size-5" aria-hidden="true" /> {isEditing ? "Guardar cambios" : "Agregar interés"}
              </Button>
            </div>
          </footer>
        </form>
      </DialogContent>
    </Dialog>
  );
}
