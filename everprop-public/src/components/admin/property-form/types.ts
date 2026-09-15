import { UseFormRegister } from "react-hook-form";
import { z } from "zod";

export type Category = "tradicional" | "loteo" | "comercial" | null;

const positiveOptional = z.string().optional().refine(v => !v || (Number.isFinite(Number(v)) && Number(v) > 0), "Ingresá un valor mayor a cero.");
const nonnegativeOptional = z.string().optional().refine(v => !v || (Number.isFinite(Number(v)) && Number(v) >= 0), "Ingresá un valor mayor o igual a cero.");

export const formSchema = z.object({
  propertyType: z.enum(["Casa", "Departamento", "Lote", "Cochera", "Local"]),
  title: z.string().min(1, "El título es requerido"),
  price: z.string().min(1, "El precio es requerido").refine(v => Number.isFinite(Number(v)) && Number(v) >= 0, "Ingresá un precio válido mayor o igual a cero."),
  currency: z.enum(["USD", "ARS"]),
  city: z.string().min(1, "La ciudad es requerida"),
  neighborhood: z.string().min(1, "La ubicación/barrio es requerida"),
  description: z.string().optional(),
  
  // Traditional
  operation: z.enum(["sale", "rent", "temporal"]).optional(),
  bedrooms: z.string().optional(),
  bathrooms: z.string().optional(),

  // Enterprise/Commercial specifics
  area_m2: positiveOptional,
  sectorName: z.string().optional(), // Manzana
  unitNumber: z.string().optional(), // Lote/Cochera/Local num
  floor: z.string().optional(), // Piso
  spaceType: z.enum(["Abierto", "Semiabierto", "Cerrado"]).optional(),
  
  // Agrimensura / Lotes
  frente_m: positiveOptional,
  fondo_m: positiveOptional,
  ochava_m2: nonnegativeOptional,
  padron: z.string().optional(),

  // Checkboxes
  water: z.boolean().optional(),
  electricity: z.boolean().optional(),
  curb: z.boolean().optional(),
  gravel: z.boolean().optional(),
  sewage: z.boolean().optional(),
  gas: z.boolean().optional(),
  lighting: z.boolean().optional(),
});

export type FormData = z.infer<typeof formSchema>;

export type FieldProps = {
  register: UseFormRegister<FormData>;
};
