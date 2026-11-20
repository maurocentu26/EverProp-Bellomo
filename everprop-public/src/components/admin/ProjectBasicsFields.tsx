"use client";

import { JUJUY_CITIES } from "@/data/admin-sample";
import type { IntakeBasics } from "@/lib/project-intake";

export const projectFieldClass = "mt-2 min-h-11 w-full rounded-lg border border-border bg-background px-3 py-2 text-base focus-visible:outline-2 focus-visible:outline-ring";

type Props = {
  form: IntakeBasics;
  onChange: (key: keyof IntakeBasics, value: string) => void;
  fieldErrors: Record<string, string[]>;
};

/** EVP-171: datos básicos del proyecto, compartidos por el ingreso guiado y la edición de la ficha. */
export function ProjectBasicsFields({ form, onChange, fieldErrors }: Props) {
  function input(label: string, key: keyof IntakeBasics, type = "text", max?: number) {
    return <label className="block text-sm font-medium" htmlFor={`intake-${key}`}>{label}<input id={`intake-${key}`} type={type} value={form[key]} onChange={(event) => onChange(key, event.target.value)} className={projectFieldClass} min={type === "number" ? 0 : undefined} max={max} step={type === "number" ? 1 : undefined} maxLength={type === "text" ? (key === "name" ? 200 : key === "address" ? 500 : 160) : undefined} aria-invalid={!!fieldErrors[key]} aria-describedby={fieldErrors[key] ? `intake-${key}-error` : undefined} />{fieldErrors[key] && <span id={`intake-${key}-error`} className="mt-1 block text-sm text-red-700 dark:text-red-300">{fieldErrors[key].join(" ")}</span>}</label>;
  }

  return <>
    {input("Nombre del proyecto *", "name")}
    <label className="block text-sm font-medium">Tipo de proyecto *<select required className={projectFieldClass} value={form.project_type} onChange={(event) => onChange("project_type", event.target.value)}><option value="">Seleccionar tipo</option><option value="LAND_DEVELOPMENT">Loteo / urbanización</option><option value="BUILDING">Edificio</option><option value="COMMERCIAL">Locales / cocheras</option></select>{fieldErrors.project_type && <span role="alert">{fieldErrors.project_type.join(" ")}</span>}</label>
    <label className="block text-sm font-medium" htmlFor="intake-city">Ciudad / localidad *<input id="intake-city" list="intake-cities" className={projectFieldClass} value={form.city} maxLength={160} onChange={(event) => onChange("city", event.target.value)} aria-invalid={!!fieldErrors.city} /><datalist id="intake-cities">{JUJUY_CITIES.map((city) => <option key={city} value={city} />)}</datalist>{fieldErrors.city && <span role="alert">{fieldErrors.city.join(" ")}</span>}</label>
    {input("Provincia *", "province")}{input("Dirección", "address")}
    <label className="block text-sm font-medium">Etapa del desarrollo<select className={projectFieldClass} value={form.status} onChange={(event) => onChange("status", event.target.value)}><option value="UNKNOWN">Sin confirmar</option><option value="PLANNING">En planificación</option><option value="PRE_SALE">Preventa</option><option value="UNDER_CONSTRUCTION">En construcción</option><option value="COMPLETED">Finalizado</option><option value="AVAILABLE">Disponible (inventario heredado)</option></select>{fieldErrors.status && <span role="alert">{fieldErrors.status.join(" ")}</span>}</label>
    <div>{input("Avance de obra (%)", "progress", "number", 100)}<p className="mt-1 text-xs text-muted-foreground">Dejalo vacío si todavía no fue confirmado.</p></div>
    <div>{input("Unidades totales declaradas", "total_units", "number", 4294967295)}<p className="mt-1 text-xs text-muted-foreground">Opcional. Este dato no crea unidades.</p></div>
  </>;
}
