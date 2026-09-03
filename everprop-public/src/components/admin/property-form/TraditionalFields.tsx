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
        <FieldLabel htmlFor="bedrooms" className="text-sm font-bold text-slate-800">Habitaciones</FieldLabel>
        <Input id="bedrooms" type="number" {...register("bedrooms")} placeholder="3" className="h-11 rounded-xl bg-slate-50" />
      </Field>
      <Field>
        <FieldLabel htmlFor="bathrooms" className="text-sm font-bold text-slate-800">Baños</FieldLabel>
        <Input id="bathrooms" type="number" {...register("bathrooms")} placeholder="2" className="h-11 rounded-xl bg-slate-50" />
      </Field>
      <Field>
        <FieldLabel htmlFor="area_m2" className="text-sm font-bold text-slate-800">Superficie (m²)</FieldLabel>
        <Input id="area_m2" type="number" {...register("area_m2")} placeholder="120" className="h-11 rounded-xl bg-slate-50" />
      </Field>
    </>
  );
}
