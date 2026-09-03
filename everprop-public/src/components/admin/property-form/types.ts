import { UseFormRegister } from "react-hook-form";
import { z } from "zod";

export type Category = "tradicional" | "loteo" | "comercial" | null;

export const formSchema = z.object({
  propertyType: z.enum(["Casa", "Departamento", "Lote", "Cochera", "Local"]),
  title: z.string().min(1, "El título es requerido"),
  price: z.string().min(1, "El precio es requerido"),
  city: z.string().min(1, "La ciudad es requerida"),
  neighborhood: z.string().min(1, "La ubicación/barrio es requerida"),
  description: z.string().optional(),
  
  // Traditional
  operation: z.enum(["sale", "rent", "temporal"]).optional(),
  bedrooms: z.string().optional(),
  bathrooms: z.string().optional(),

  // Enterprise/Commercial specifics
  area_m2: z.string().optional(),
  sectorName: z.string().optional(), // Manzana
  unitNumber: z.string().optional(), // Lote/Cochera/Local num
  floor: z.string().optional(), // Piso
  spaceType: z.enum(["Abierto", "Semiabierto", "Cerrado"]).optional(),
  
  // Agrimensura / Lotes
  frente_m: z.string().optional(),
  fondo_m: z.string().optional(),
  ochava_m2: z.string().optional(),
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
