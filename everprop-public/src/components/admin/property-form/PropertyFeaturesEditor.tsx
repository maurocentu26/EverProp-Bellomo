import { useId } from "react";
import type { PropertyFeature } from "@/data/admin-sample";
import type { PropertyFeatureInput } from "@/lib/everprop-api";

export type FeatureDraft = {
  key: string;
  id?: number;
  code?: string;
  group: PropertyFeature["group"];
  label: string;
  valueText: string;
  originalValue?: unknown;
};

const groups: { value: FeatureDraft["group"]; label: string }[] = [
  { value: "SERVICE", label: "Servicio" },
  { value: "AMENITY", label: "Comodidad" },
  { value: "STRUCTURAL", label: "Construcción" },
  { value: "COMMERCIAL", label: "Comercial" },
  { value: "OTHER", label: "Otra" },
];

export function draftFromFeature(feature: PropertyFeature): FeatureDraft {
  return {
    key: `saved-${feature.id}`, id: feature.id, code: feature.code,
    group: feature.group, label: feature.label,
    valueText: feature.value === true ? "" : typeof feature.value === "string" ? feature.value : JSON.stringify(feature.value),
    originalValue: feature.value,
  };
}

export function featureInput(draft: FeatureDraft): PropertyFeatureInput {
  const label = draft.label.trim();
  if (!label) throw new Error("Cada característica necesita un nombre.");
  const normalized = label.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase()
    .replace(/[^A-Z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 64);
  const code = draft.code || `${draft.group}_${normalized || "DETALLE"}`;
  const originalText = draft.originalValue === true ? "" : typeof draft.originalValue === "string"
    ? draft.originalValue : JSON.stringify(draft.originalValue);
  return { group: draft.group, code, label,
    value: draft.id && draft.valueText === originalText ? draft.originalValue : draft.valueText.trim() || true,
    isFilterable: true };
}

export function validateFeatureDrafts(drafts: FeatureDraft[]): PropertyFeatureInput[] {
  const features = drafts.map(featureInput);
  const codes = features.map(feature => feature.code);
  if (new Set(codes).size !== codes.length) throw new Error("Hay características repetidas. Cambiá el nombre o eliminá la duplicada.");
  return features;
}

export default function PropertyFeaturesEditor({ value, onChange, disabled = false }: {
  value: FeatureDraft[];
  onChange: (next: FeatureDraft[]) => void;
  disabled?: boolean;
}) {
  const id = useId();
  const update = (key: string, patch: Partial<FeatureDraft>) =>
    onChange(value.map(feature => feature.key === key ? { ...feature, ...patch } : feature));

  return (
    <section className="md:col-span-2 space-y-3 rounded-xl border border-slate-200 bg-slate-50/70 p-4 dark:border-slate-700 dark:bg-slate-950/40" aria-labelledby={`${id}-heading`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 id={`${id}-heading`} className="font-semibold text-slate-900 dark:text-slate-100">Características de la unidad</h3>
          <p className="text-sm text-slate-600 dark:text-slate-400">Sumá servicios, comodidades y detalles propios de esta propiedad.</p>
        </div>
        <button type="button" disabled={disabled} onClick={() => onChange([...value, { key: crypto.randomUUID(), group: "AMENITY", label: "", valueText: "" }])}
          className="min-h-10 rounded-lg border border-blue-300 bg-white px-3 text-sm font-semibold text-blue-800 hover:bg-blue-50 focus-visible:outline-2 focus-visible:outline-blue-600 disabled:opacity-50 dark:bg-slate-900 dark:text-blue-200">
          Agregar característica
        </button>
      </div>
      {value.map(feature => (
        <div key={feature.key} className="grid gap-2 rounded-lg border border-slate-200 bg-white p-3 dark:border-slate-700 dark:bg-slate-900 sm:grid-cols-[minmax(0,10rem)_minmax(0,1fr)_minmax(0,1fr)_auto]">
          <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">Grupo
            <select disabled={disabled} value={feature.group} onChange={event => update(feature.key, { group: event.target.value as FeatureDraft["group"] })}
              className="mt-1 h-10 w-full rounded-lg border border-slate-300 bg-white px-2 text-sm dark:border-slate-600 dark:bg-slate-950">
              {groups.map(group => <option key={group.value} value={group.value}>{group.label}</option>)}
            </select>
          </label>
          <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">Característica
            <input disabled={disabled} value={feature.label} maxLength={160} onChange={event => update(feature.key, { label: event.target.value })}
              placeholder="Ej.: Balcón" className="mt-1 h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm dark:border-slate-600 dark:bg-slate-950" />
          </label>
          <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">Detalle (opcional)
            <input disabled={disabled} value={feature.valueText} onChange={event => update(feature.key, { valueText: event.target.value })}
              placeholder="Ej.: 12 m²" className="mt-1 h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm dark:border-slate-600 dark:bg-slate-950" />
          </label>
          <button type="button" disabled={disabled} onClick={() => onChange(value.filter(item => item.key !== feature.key))}
            className="min-h-10 self-end rounded-lg px-3 text-sm font-semibold text-rose-700 hover:bg-rose-50 focus-visible:outline-2 focus-visible:outline-rose-600 disabled:opacity-50"
            aria-label={`Quitar ${feature.label || "característica"}`}>Quitar</button>
        </div>
      ))}
    </section>
  );
}
