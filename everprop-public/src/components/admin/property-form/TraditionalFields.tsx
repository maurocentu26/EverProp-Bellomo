import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { type FieldProps } from "./types";

export default function TraditionalFields({ register }: FieldProps) {
  return (
    <>
      <Field>
        <FieldLabel htmlFor="operation" className="text-sm font-bold text-slate-800">Operación</FieldLabel>
        <select
          id="operation"
          {...register("operation")}
          className="h-11 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
        >
          <option value="sale">Venta</option>
          <option value="rent">Alquiler</option>
          <option value="temporal">Alquiler Temporal</option>
        </select>
      </Field>
      <Field>
        <FieldLabel htmlFor="rooms" className="text-sm font-bold text-slate-800">Ambientes</FieldLabel>
        <Input id="rooms" type="number" min="0" step="1" {...register("rooms")} placeholder="3" className="h-11 rounded-xl bg-slate-50" />
      </Field>
      <Field>
        <FieldLabel htmlFor="bedrooms" className="text-sm font-bold text-slate-800">Dormitorios</FieldLabel>
        <Input id="bedrooms" type="number" min="0" step="1" {...register("bedrooms")} placeholder="2" className="h-11 rounded-xl bg-slate-50" />
      </Field>
      <Field>
        <FieldLabel htmlFor="bathrooms" className="text-sm font-bold text-slate-800">Baños</FieldLabel>
        <Input id="bathrooms" type="number" min="0" step="1" {...register("bathrooms")} placeholder="2" className="h-11 rounded-xl bg-slate-50" />
      </Field>
      <Field>
        <FieldLabel htmlFor="area_m2" className="text-sm font-bold text-slate-800">Superficie total (m²)</FieldLabel>
        <Input id="area_m2" type="number" min="0" step="0.01" {...register("area_m2")} placeholder="120" className="h-11 rounded-xl bg-slate-50" />
      </Field>
      <Field>
        <FieldLabel htmlFor="covered_area_m2" className="text-sm font-bold text-slate-800">Superficie cubierta (m²)</FieldLabel>
        <Input id="covered_area_m2" type="number" min="0" step="0.01" {...register("covered_area_m2")} placeholder="90" className="h-11 rounded-xl bg-slate-50" />
      </Field>
      <Field>
        <FieldLabel htmlFor="uncovered_area_m2" className="text-sm font-bold text-slate-800">Superficie descubierta (m²)</FieldLabel>
        <Input id="uncovered_area_m2" type="number" min="0" step="0.01" {...register("uncovered_area_m2")} placeholder="30" className="h-11 rounded-xl bg-slate-50" />
      </Field>
      <Field>
        <FieldLabel htmlFor="floor" className="text-sm font-bold text-slate-800">Piso</FieldLabel>
        <Input id="floor" {...register("floor")} placeholder="Ej.: 2 o Planta baja" className="h-11 rounded-xl bg-slate-50" />
      </Field>
      <Field>
        <FieldLabel htmlFor="orientation" className="text-sm font-bold text-slate-800">Orientación</FieldLabel>
        <Input id="orientation" {...register("orientation")} placeholder="Ej.: Norte" className="h-11 rounded-xl bg-slate-50" />
      </Field>
      <Field>
        <FieldLabel htmlFor="disposition" className="text-sm font-bold text-slate-800">Disposición</FieldLabel>
        <Input id="disposition" {...register("disposition")} placeholder="Ej.: Frente" className="h-11 rounded-xl bg-slate-50" />
      </Field>
      <Field>
        <FieldLabel htmlFor="parkingSpaces" className="text-sm font-bold text-slate-800">Cocheras</FieldLabel>
        <Input id="parkingSpaces" type="number" min="0" step="1" {...register("parkingSpaces")} placeholder="1" className="h-11 rounded-xl bg-slate-50" />
      </Field>
      <Field>
        <FieldLabel htmlFor="expenses" className="text-sm font-bold text-slate-800">Expensas</FieldLabel>
        <Input id="expenses" type="number" min="0" step="0.01" {...register("expenses")} placeholder="Monto" className="h-11 rounded-xl bg-slate-50" />
      </Field>
      <Field>
        <FieldLabel htmlFor="expensesCurrency" className="text-sm font-bold text-slate-800">Moneda de expensas</FieldLabel>
        <select id="expensesCurrency" {...register("expensesCurrency")} className="h-11 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm">
          <option value="">Sin expensas informadas</option><option value="ARS">Pesos (ARS)</option><option value="USD">Dólares (USD)</option>
        </select>
      </Field>
    </>
  );
}
