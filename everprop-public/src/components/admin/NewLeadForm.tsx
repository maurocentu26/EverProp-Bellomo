"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { zodResolver } from "@hookform/resolvers/zod";
import { Controller, useForm } from "react-hook-form";
import { toast } from "sonner";
import * as z from "zod";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { leads as sampleLeads, properties as sampleProperties, type Lead } from "@/data/admin-sample";
import { loadLeadList, loadPropertyList, saveLeadList } from "@/lib/admin-storage";
import { isMockDataMode } from "@/lib/data-mode";
import { createEverpropLead, loadEverpropCatalog } from "@/lib/everprop-api";

type Props = {
  companyId?: string;
};

const ORIGINS = ["Web", "WhatsApp", "Portal", "Referido", "Instagram"];
const STAGES: Lead["stage"][] = ["new", "contacted", "visiting", "negotiation", "closing"];
const STAGE_LABELS: Record<Lead["stage"], string> = {
  new: "Nuevo",
  contacted: "Contactado",
  visiting: "Visitando",
  negotiation: "Negociación",
  closing: "Cierre",
};

const formSchema = z.object({
  name: z.string().trim().min(2, "El nombre debe tener al menos 2 caracteres.").max(60, "El nombre no puede superar 60 caracteres."),
  origin: z.string().min(1, "Seleccioná un origen."),
  email: z.string().trim().max(100, "El email no puede superar 100 caracteres.").optional().or(z.literal("")),
  phone: z.string().trim().max(25, "El teléfono no puede superar 25 caracteres.").optional().or(z.literal("")),
  propertyId: z.string().optional(),
  stage: z.enum(STAGES as [Lead["stage"], ...Lead["stage"][]]),
  notes: z.string().trim().max(250, "Las notas no pueden superar 250 caracteres.").optional().or(z.literal("")),
});

export function NewLeadForm({ companyId = "c1" }: Props) {
  const router = useRouter();
  const [propertyOptions, setPropertyOptions] = useState<Array<{ id: string; title: string }>>([]);

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: "",
      origin: ORIGINS[0],
      email: "",
      phone: "",
      propertyId: "",
      stage: "new",
      notes: "",
    },
  });

  useEffect(() => {
    let active = true;
    async function loadProps() {
      if (!isMockDataMode) {
        try {
          const cat = await loadEverpropCatalog();
          if (!active) return;
          const options = cat.properties.map((p) => ({ id: p.id, title: p.title }));
          setPropertyOptions(options);
          if (options[0] && !form.getValues("propertyId")) {
            form.setValue("propertyId", options[0].id, { shouldValidate: true });
          }
          return;
        } catch {
          // fallback below
        }
      }
      if (!active) return;
      const nextProperties = loadPropertyList(sampleProperties, companyId);
      const options = nextProperties.map((property) => ({ id: property.id, title: property.title }));
      setPropertyOptions(options);

      const currentPropertyId = form.getValues("propertyId");
      if (!currentPropertyId && options[0]) {
        form.setValue("propertyId", options[0].id, { shouldValidate: true });
      }
    }
    void loadProps();
    return () => {
      active = false;
    };
  }, [companyId, form]);

  async function onSubmit(data: z.infer<typeof formSchema>) {
    const trimmedName = data.name.trim();
    const email = data.email?.trim() ?? "";
    const phone = data.phone?.trim() ?? "";

    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      form.setError("email", { type: "validate", message: "Ingresá un email válido." });
      return;
    }

    if (phone && !/^\+?[0-9\s().-]{7,20}$/.test(phone)) {
      form.setError("phone", { type: "validate", message: "Ingresá un teléfono válido." });
      return;
    }

    const nextLead: Lead = {
      id: crypto.randomUUID(),
      companyId,
      name: trimmedName,
      origin: data.origin,
      propertyIds: data.propertyId ? [data.propertyId] : [],
      stage: data.stage,
      lastActivity: new Date().toISOString(),
      phone: phone || undefined,
      email: email || undefined,
    };

    if (!isMockDataMode) {
      try {
        const stageApiMap: Record<string, string> = {
          new: "NEW",
          contacted: "CONTACTED",
          visiting: "VISIT_SCHEDULED",
          negotiation: "NEGOTIATION",
          closing: "WON",
        };
        await createEverpropLead({
          name: trimmedName,
          email: email || undefined,
          phone: phone || undefined,
          stage: stageApiMap[data.stage] || "NEW",
          notes: data.notes || undefined,
        });
      } catch (e: any) {
        toast.error("Error al guardar lead en base de datos: " + (e.message || "Error de red"));
        return;
      }
    } else {
      const existingLeads = loadLeadList(sampleLeads, companyId);
      saveLeadList([...existingLeads, nextLead]);
    }

    toast.success("Lead creado", {
      description: `${trimmedName} se agregó al pipeline correctamente.`,
    });

    router.push("/admin/leads");
  }

  return (
    <Card className="w-full overflow-hidden border border-slate-200 bg-white shadow-[0_16px_50px_-24px_rgba(15,23,42,0.35)] max-w-4xl ml-auto mr-auto py-0">
      <div className="bg-slate-950/95 px-6 py-5 text-white">
        <CardHeader className="p-0">
          <CardTitle className="text-xl font-semibold text-white">Agregar nuevo lead</CardTitle>
          <CardDescription className="mt-2 text-sm text-slate-300">
            Completá los datos del contacto para incorporarlo al pipeline de ventas.
          </CardDescription>
        </CardHeader>
      </div>

      <CardContent className="px-6 py-6">
        <form id="new-lead-form" onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
          <FieldGroup className="grid gap-4 md:grid-cols-2">
            <Controller
              name="name"
              control={form.control}
              render={({ field, fieldState }) => (
                <Field className="md:col-span-2" data-invalid={fieldState.invalid}>
                  <FieldLabel htmlFor="lead-name" className="text-sm font-medium text-slate-800">
                    Nombre completo <span className="text-rose-500">*</span>
                  </FieldLabel>
                  <Input
                    {...field}
                    id="lead-name"
                    placeholder="Carla Méndez"
                    autoComplete="name"
                    aria-invalid={fieldState.invalid}
                    className="h-11 border-slate-300 bg-white text-slate-900 placeholder:text-slate-400 focus:border-slate-500 focus:ring-slate-200"
                  />
                  {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
                </Field>
              )}
            />

            <Controller
              name="origin"
              control={form.control}
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <FieldLabel htmlFor="lead-origin" className="text-sm font-medium text-slate-800">
                    Origen <span className="text-rose-500">*</span>
                  </FieldLabel>
                  <select
                    {...field}
                    id="lead-origin"
                    className="h-11 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm outline-none transition focus:border-slate-500 focus:ring-2 focus:ring-slate-200"
                    aria-invalid={fieldState.invalid}
                  >
                    {ORIGINS.map((origin) => (
                      <option key={origin} value={origin}>
                        {origin}
                      </option>
                    ))}
                  </select>
                  {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
                </Field>
              )}
            />

            <Controller
              name="stage"
              control={form.control}
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <FieldLabel htmlFor="lead-stage" className="text-sm font-medium text-slate-800">
                    Estado inicial
                  </FieldLabel>
                  <select
                    {...field}
                    id="lead-stage"
                    className="h-11 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm outline-none transition focus:border-slate-500 focus:ring-2 focus:ring-slate-200"
                    aria-invalid={fieldState.invalid}
                  >
                    {STAGES.map((stage) => (
                      <option key={stage} value={stage}>
                        {STAGE_LABELS[stage]}
                      </option>
                    ))}
                  </select>
                  {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
                </Field>
              )}
            />

            <Controller
              name="email"
              control={form.control}
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <FieldLabel htmlFor="lead-email" className="text-sm font-medium text-slate-800">
                    Email
                  </FieldLabel>
                  <Input
                    {...field}
                    id="lead-email"
                    type="email"
                    placeholder="carla@example.com"
                    autoComplete="email"
                    aria-invalid={fieldState.invalid}
                    className="h-11 border-slate-300 bg-white text-slate-900 placeholder:text-slate-400 focus:border-slate-500 focus:ring-slate-200"
                  />
                  {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
                </Field>
              )}
            />

            <Controller
              name="phone"
              control={form.control}
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <FieldLabel htmlFor="lead-phone" className="text-sm font-medium text-slate-800">
                    Teléfono
                  </FieldLabel>
                  <Input
                    {...field}
                    id="lead-phone"
                    placeholder="+54 9 11 1234 5678"
                    autoComplete="tel"
                    aria-invalid={fieldState.invalid}
                    className="h-11 border-slate-300 bg-white text-slate-900 placeholder:text-slate-400 focus:border-slate-500 focus:ring-slate-200"
                  />
                  {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
                </Field>
              )}
            />

            <Controller
              name="propertyId"
              control={form.control}
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <FieldLabel htmlFor="lead-property" className="text-sm font-medium text-slate-800">
                    Propiedad de interés
                  </FieldLabel>
                  <select
                    {...field}
                    id="lead-property"
                    className="h-11 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm outline-none transition focus:border-slate-500 focus:ring-2 focus:ring-slate-200"
                    aria-invalid={fieldState.invalid}
                  >
                    <option value="">Sin propiedad asociada</option>
                    {propertyOptions.map((property) => (
                      <option key={property.id} value={property.id}>
                        {property.title}
                      </option>
                    ))}
                  </select>
                  <FieldDescription className="text-slate-500">
                    {propertyOptions.length > 0
                      ? "Podés vincular el lead con una propiedad disponible."
                      : "No hay propiedades cargadas todavía; podés guardar el lead sin asociarlo."}
                  </FieldDescription>
                  {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
                </Field>
              )}
            />

            <Controller
              name="notes"
              control={form.control}
              render={({ field, fieldState }) => (
                <Field className="md:col-span-2" data-invalid={fieldState.invalid}>
                  <FieldLabel htmlFor="lead-notes" className="text-sm font-medium text-slate-800">
                    Notas
                  </FieldLabel>
                  <Textarea
                    {...field}
                    id="lead-notes"
                    rows={5}
                    placeholder="Contexto del contacto, preferencias, próximos pasos..."
                    aria-invalid={fieldState.invalid}
                    className="min-h-24 border-slate-300 bg-white text-slate-900 placeholder:text-slate-400 focus:border-slate-500 focus:ring-slate-200"
                  />
                  {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
                </Field>
              )}
            />
          </FieldGroup>
        </form>
      </CardContent>

      <CardFooter className="flex flex-col gap-3 border-t border-slate-200 bg-slate-50 px-6 py-4 sm:flex-row sm:justify-end">
        <Button
          type="button"
          variant="outline"
          className="border-slate-300 text-slate-700 hover:bg-slate-100"
          onClick={() => router.push("/admin/leads")}
        >
          Cancelar
        </Button>
        <Button type="submit" form="new-lead-form" className="bg-slate-950 text-white shadow-sm transition hover:bg-slate-800">
          Guardar lead
        </Button>
      </CardFooter>
    </Card>
  );
}
