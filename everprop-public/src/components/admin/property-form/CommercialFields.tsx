import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { type FieldProps } from "./types";

type Props = FieldProps & {
  activeTab: string;
};

export default function CommercialFields({ register, activeTab }: Props) {
  return (
    <>
      <Field>
        <FieldLabel htmlFor="floor" className="text-sm font-bold text-slate-800">Piso (Opcional)</FieldLabel>
        <Input id="floor" {...register("floor")} placeholder="PB" className="h-11 rounded-xl bg-slate-50" />
      </Field>
      <Field>
        <FieldLabel htmlFor="unitNumber" className="text-sm font-bold text-slate-800">
          Nro de {activeTab} <span className="text-rose-500">*</span>
        </FieldLabel>
        <Input id="unitNumber" {...register("unitNumber")} placeholder={activeTab === 'Cochera' ? "A-12" : "Local 4"} className="h-11 rounded-xl bg-slate-50" />
      </Field>
      <Field>
        <FieldLabel htmlFor="area_m2" className="text-sm font-bold text-slate-800">Superficie (m²)</FieldLabel>
        <Input id="area_m2" type="number" {...register("area_m2")} placeholder="45" className="h-11 rounded-xl bg-slate-50" />
      </Field>
    </>
  );
}
