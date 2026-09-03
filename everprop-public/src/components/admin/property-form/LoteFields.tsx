import { Droplets, Zap, Route, Waves, LayoutTemplate, Flame, Lightbulb, Compass, FileText } from "lucide-react";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { type FieldProps } from "./types";

export default function LoteFields({ register }: FieldProps) {
  return (
    <>
      <Field>
        <FieldLabel htmlFor="sectorName" className="text-xs font-semibold text-slate-700">
          Manzana / Sector <span className="text-rose-500">*</span>
        </FieldLabel>
        <Input id="sectorName" {...register("sectorName")} placeholder="ej: Manzana AP7 o B" className="h-10 rounded-lg bg-slate-50 text-sm" />
      </Field>

      <Field>
        <FieldLabel htmlFor="unitNumber" className="text-xs font-semibold text-slate-700">
          N° de Lote / Parcela <span className="text-rose-500">*</span>
        </FieldLabel>
        <Input id="unitNumber" {...register("unitNumber")} placeholder="ej: 15" className="h-10 rounded-lg bg-slate-50 text-sm" />
      </Field>

      <Field>
        <FieldLabel htmlFor="frente_m" className="text-xs font-semibold text-slate-700">Frente (metros)</FieldLabel>
        <Input id="frente_m" type="number" step="0.1" {...register("frente_m")} placeholder="10" className="h-10 rounded-lg bg-slate-50 text-sm" />
      </Field>

      <Field>
        <FieldLabel htmlFor="fondo_m" className="text-xs font-semibold text-slate-700">Fondo (metros)</FieldLabel>
        <Input id="fondo_m" type="number" step="0.1" {...register("fondo_m")} placeholder="25" className="h-10 rounded-lg bg-slate-50 text-sm" />
      </Field>

      <Field>
        <FieldLabel htmlFor="area_m2" className="text-xs font-semibold text-slate-700">
          Superficie Total (m²) <span className="text-rose-500">*</span>
        </FieldLabel>
        <Input id="area_m2" type="number" step="0.01" {...register("area_m2")} placeholder="250" className="h-10 rounded-lg bg-slate-50 text-sm font-bold" />
      </Field>

      <Field>
        <FieldLabel htmlFor="ochava_m2" className="text-xs font-semibold text-slate-700">
          Ochava (m²) <span className="text-[10px] text-slate-400">(si es esquina)</span>
        </FieldLabel>
        <Input id="ochava_m2" type="number" step="0.01" {...register("ochava_m2")} placeholder="4.79" className="h-10 rounded-lg bg-slate-50 text-sm" />
      </Field>

      <Field className="md:col-span-2">
        <FieldLabel htmlFor="padron" className="text-xs font-semibold text-slate-700">
          Padrón Inmobiliario / Matrícula Catastral
        </FieldLabel>
        <Input id="padron" {...register("padron")} placeholder="ej: A-12849 / Circunscripción 1" className="h-10 rounded-lg bg-slate-50 text-sm" />
      </Field>

      <div className="md:col-span-2 pt-3 border-t border-slate-100">
        <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider mb-2.5 flex items-center gap-1.5">
          <Zap className="size-3.5 text-blue-600" /> Infraestructura y Servicios de Red
        </h4>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          <label className="flex items-center gap-2 p-2.5 rounded-lg border border-slate-200 hover:bg-slate-50 cursor-pointer transition-colors text-xs font-semibold text-slate-700">
            <input type="checkbox" {...register("water")} className="w-4 h-4 text-blue-600 rounded" />
            <Droplets className="w-3.5 h-3.5 text-blue-500" /> Agua de Red
          </label>
          <label className="flex items-center gap-2 p-2.5 rounded-lg border border-slate-200 hover:bg-slate-50 cursor-pointer transition-colors text-xs font-semibold text-slate-700">
            <input type="checkbox" {...register("electricity")} className="w-4 h-4 text-amber-600 rounded" />
            <Zap className="w-3.5 h-3.5 text-amber-500" /> Electricidad
          </label>
          <label className="flex items-center gap-2 p-2.5 rounded-lg border border-slate-200 hover:bg-slate-50 cursor-pointer transition-colors text-xs font-semibold text-slate-700">
            <input type="checkbox" {...register("lighting")} className="w-4 h-4 text-amber-600 rounded" />
            <Lightbulb className="w-3.5 h-3.5 text-amber-500" /> Alumbrado Público
          </label>
          <label className="flex items-center gap-2 p-2.5 rounded-lg border border-slate-200 hover:bg-slate-50 cursor-pointer transition-colors text-xs font-semibold text-slate-700">
            <input type="checkbox" {...register("curb")} className="w-4 h-4 text-slate-600 rounded" />
            <LayoutTemplate className="w-3.5 h-3.5 text-slate-500" /> Cordón Cuneta
          </label>
          <label className="flex items-center gap-2 p-2.5 rounded-lg border border-slate-200 hover:bg-slate-50 cursor-pointer transition-colors text-xs font-semibold text-slate-700">
            <input type="checkbox" {...register("gas")} className="w-4 h-4 text-orange-600 rounded" />
            <Flame className="w-3.5 h-3.5 text-orange-500" /> Gas Natural
          </label>
          <label className="flex items-center gap-2 p-2.5 rounded-lg border border-slate-200 hover:bg-slate-50 cursor-pointer transition-colors text-xs font-semibold text-slate-700">
            <input type="checkbox" {...register("sewage")} className="w-4 h-4 text-cyan-600 rounded" />
            <Waves className="w-3.5 h-3.5 text-cyan-500" /> Cloacas
          </label>
        </div>
      </div>
    </>
  );
}
