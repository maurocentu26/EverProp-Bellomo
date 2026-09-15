"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { properties as sampleProperties, type Property, type Project, projects as sampleProjects, JUJUY_CITIES } from "@/data/admin-sample";
import { loadPropertyList, savePropertyList, loadProjectList } from "@/lib/admin-storage";
import { isMockDataMode } from "@/lib/data-mode";
import { createEverpropProperty, loadEverpropCatalog } from "@/lib/everprop-api";
import { Car, Store, Map, Building2, Home, ArrowLeft, Layers } from "lucide-react";
import { cn } from "@/lib/utils";
import { deferEffectUpdate } from "@/lib/deferred-effect";

import CategorySelector from "./property-form/CategorySelector";
import TraditionalFields from "./property-form/TraditionalFields";
import LoteFields from "./property-form/LoteFields";
import CommercialFields from "./property-form/CommercialFields";
import { formSchema, type FormData, type Category } from "./property-form/types";
import { GenerateLotsModal } from "./GenerateLotsModal";
import { useCurrentSession } from "@/hooks/use-current-session";
import { toast } from "sonner";

type Props = {
  companyId?: string;
};

export default function NewPropertyForm({ companyId = "c1" }: Props) {
  const router = useRouter();
  const { isAdvisor } = useCurrentSession();
  const searchParams = useSearchParams();
  const paramCategory = searchParams.get("category") as Category | null;
  const paramType = searchParams.get("type") as "Casa" | "Departamento" | "Lote" | "Cochera" | "Local" | null;

  const [error, setError] = useState("");
  const [projects, setProjects] = useState<Project[]>([]);
  const [projectId, setProjectId] = useState("");
  const [projectsError, setProjectsError] = useState("");
  useEffect(() => {
    let active = true;
    if (isMockDataMode) setProjects(loadProjectList(sampleProjects, companyId));
    else loadEverpropCatalog().then(catalog => { if (active) setProjects(catalog.projects); }).catch(() => { if (active) setProjectsError("No se pudieron cargar los desarrollos. Recargá el formulario para reintentar."); });
    return () => { active = false; };
  }, [companyId]);
  const [isSaving, setIsSaving] = useState(false);
  
  // Stepper State
  const [step, setStep] = useState<1 | 2>(() => (paramCategory ? 2 : 1));
  const [category, setCategory] = useState<Category>(() => paramCategory || null);
  
  // Active Tab within category
  const [activeTab, setActiveTab] = useState<"Casa" | "Departamento" | "Lote" | "Cochera" | "Local">(() => {
    if (paramType) return paramType;
    if (paramCategory === "comercial") return "Local";
    if (paramCategory === "loteo") return "Lote";
    return "Casa";
  });
  const [isGenerateLotsOpen, setIsGenerateLotsOpen] = useState(false);

  useEffect(() => {
    if (paramCategory) {
      setCategory(paramCategory);
      setStep(2);
      if (paramType) {
        setActiveTab(paramType);
      } else if (paramCategory === "comercial") {
        setActiveTab("Local");
      } else if (paramCategory === "loteo") {
        setActiveTab("Lote");
      }
    }
  }, [paramCategory, paramType]);

  const { register, handleSubmit, watch, setValue, formState: { errors }, reset } = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      propertyType: "Casa",
      currency: "USD",
      spaceType: "Abierto",
      operation: "sale",
    },
  });

  // When category changes, update the default active tab
  useEffect(() => {
    return deferEffectUpdate(() => {
      if (paramType && category === paramCategory) { setActiveTab(paramType); return; }
      if (category === "tradicional") setActiveTab("Casa");
      if (category === "loteo") setActiveTab("Lote");
      if (category === "comercial") setActiveTab("Local");
    });
  }, [category, paramCategory, paramType]);

  // Sync activeTab to form
  useEffect(() => {
    setValue("propertyType", activeTab);
  }, [activeTab, setValue]);

  const onSubmit = async (data: FormData) => {
    if (isAdvisor) {
      setError("Acceso no autorizado: Los asesores no tienen permisos para crear propiedades.");
      toast.error("Acceso restringido: Los asesores no tienen permisos para crear propiedades.");
      return;
    }
    if (projectsError) { setError(projectsError); return; }
    setError("");
    setIsSaving(true);

    try {
      if (data.propertyType === "Lote" && (!data.area_m2 || !data.sectorName || !data.unitNumber)) {
        throw new Error("Completá Superficie, Manzana y Nro de Lote.");
      }
      if (["Cochera", "Local"].includes(data.propertyType) && !data.unitNumber) {
        throw new Error("Completá el número de la unidad.");
      }

      const nextProperty: Property = {
        id: crypto.randomUUID(),
        companyId,
        projectId: projectId || undefined,
        title: data.title.trim(),
        operation: data.operation || "sale",
        propertyType: data.propertyType,
        price: Number(data.price),
        currency: data.currency,
        city: data.city.trim(),
        neighborhood: data.neighborhood.trim(),
        bedrooms: data.bedrooms ? Number(data.bedrooms) : 0,
        bathrooms: data.bathrooms ? Number(data.bathrooms) : 0,
        area_m2: data.area_m2 ? Number(data.area_m2) : undefined,
        description: data.description,
        sectorName: data.propertyType === "Lote" ? data.sectorName : undefined,
        unitNumber: data.floor ? `${data.floor}-${data.unitNumber}` : data.unitNumber,
        status: "available",
        commercialFeatures: data.propertyType === "Lote" ? { land: {
          frente_m: data.frente_m ? Number(data.frente_m) : undefined,
          fondo_m: data.fondo_m ? Number(data.fondo_m) : undefined,
          ochava_m2: data.ochava_m2 ? Number(data.ochava_m2) : undefined,
          padron: data.padron?.trim() || undefined,
          curb: Boolean(data.curb), gravel: Boolean(data.gravel), lighting: Boolean(data.lighting),
          spaceType: data.spaceType,
        }} : undefined,
        landFeatures: data.propertyType === "Lote" ? {
          water: !!data.water,
          electricity: !!data.electricity,
          curb: !!data.curb,
          gravel: !!data.gravel,
          sewage: !!data.sewage,
          spaceType: data.spaceType,
        } : undefined,
      };

      if (!isMockDataMode) {
        await createEverpropProperty({
          title: nextProperty.title,
          projectId: nextProperty.projectId,
          commercialFeatures: nextProperty.commercialFeatures,
          services: {water: Boolean(data.water), electricity: Boolean(data.electricity), gas: Boolean(data.gas), sewage: Boolean(data.sewage)},
          operation: nextProperty.operation,
          propertyType: nextProperty.propertyType,
          price: nextProperty.price,
          currency: nextProperty.currency,
          city: nextProperty.city,
          neighborhood: nextProperty.neighborhood,
          sectorName: nextProperty.sectorName,
          unitNumber: nextProperty.unitNumber,
          area_m2: nextProperty.area_m2,
          bedrooms: nextProperty.bedrooms,
          bathrooms: nextProperty.bathrooms,
          description: nextProperty.description,
        });
      } else {
        const existingProperties = loadPropertyList(sampleProperties, companyId);
        savePropertyList([nextProperty, ...existingProperties]);
      }

      router.push("/admin/properties");
    } catch (e: any) {
      setError(e.message || "Error al guardar el activo.");
      setIsSaving(false);
    }
  };

  const handleCategorySelect = (cat: Category) => {
    setCategory(cat);
    setStep(2);
  };

  if (step === 1) {
    return <CategorySelector onSelect={handleCategorySelect} />;
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <button onClick={() => setStep(1)} className="flex items-center gap-2 text-sm font-semibold text-slate-500 hover:text-slate-900 transition-colors">
        <ArrowLeft className="h-4 w-4" /> Volver a categorías
      </button>

      <Card className="w-full overflow-hidden border border-slate-200 bg-white shadow-lg rounded-2xl p-0">
        <div className="border-b border-border bg-card px-4 py-5 text-card-foreground sm:px-6 sm:py-6">
          <h1 className="text-xl font-bold leading-tight mb-2">
            {category === "tradicional" && "Añadir Propiedad Tradicional"}
            {category === "loteo" && "Añadir Lote o Terreno"}
            {category === "comercial" && "Añadir Activo Comercial"}
          </h1>
          <CardDescription className="text-sm leading-relaxed text-muted-foreground">
            Completá los datos requeridos para ingresar la unidad al inventario.
          </CardDescription>

          {/* Sub-Tabs based on category */}
          <div role="group" aria-label="Tipo de propiedad" className="grid grid-cols-1 min-[380px]:grid-cols-2 sm:flex gap-1 mt-5 p-1 bg-muted rounded-xl w-full">
            {category === "tradicional" && (
              <>
                <button type="button" aria-pressed={activeTab === "Casa"} onClick={() => setActiveTab("Casa")} className={cn("flex min-h-11 min-w-0 items-center justify-center gap-2 px-2 py-2.5 rounded-lg text-sm font-semibold transition-colors sm:flex-1", activeTab === "Casa" ? "bg-indigo-600 text-white shadow-sm" : "text-muted-foreground hover:text-foreground hover:bg-background")}>
                  <Home aria-hidden="true" className="hidden size-4 shrink-0 sm:block" /> Casa
                </button>
                <button type="button" aria-pressed={activeTab === "Departamento"} onClick={() => setActiveTab("Departamento")} className={cn("flex min-h-11 min-w-0 items-center justify-center gap-2 px-2 py-2.5 rounded-lg text-sm font-semibold transition-colors sm:flex-1", activeTab === "Departamento" ? "bg-indigo-600 text-white shadow-sm" : "text-muted-foreground hover:text-foreground hover:bg-background")}>
                  <Building2 aria-hidden="true" className="hidden size-4 shrink-0 sm:block" /> Departamento
                </button>
              </>
            )}

            {category === "loteo" && (
              <button type="button" aria-pressed={activeTab === "Lote"} onClick={() => setActiveTab("Lote")} className={cn("flex min-h-11 min-w-0 items-center justify-center gap-2 px-2 py-2.5 rounded-lg text-sm font-semibold transition-colors sm:flex-1", activeTab === "Lote" ? "bg-emerald-600 text-white shadow-sm" : "text-muted-foreground hover:text-foreground hover:bg-background")}>
                <Map aria-hidden="true" className="hidden size-4 shrink-0 sm:block" /> Lote
              </button>
            )}

            {category === "comercial" && (
              <>
                <button type="button" aria-pressed={activeTab === "Local"} onClick={() => setActiveTab("Local")} className={cn("flex min-h-11 min-w-0 items-center justify-center gap-2 px-2 py-2.5 rounded-lg text-sm font-semibold transition-colors sm:flex-1", activeTab === "Local" ? "bg-amber-600 text-white shadow-sm" : "text-muted-foreground hover:text-foreground hover:bg-background")}>
                  <Store aria-hidden="true" className="hidden size-4 shrink-0 sm:block" /> Local Comercial
                </button>
                <button type="button" aria-pressed={activeTab === "Cochera"} onClick={() => setActiveTab("Cochera")} className={cn("flex min-h-11 min-w-0 items-center justify-center gap-2 px-2 py-2.5 rounded-lg text-sm font-semibold transition-colors sm:flex-1", activeTab === "Cochera" ? "bg-amber-600 text-white shadow-sm" : "text-muted-foreground hover:text-foreground hover:bg-background")}>
                  <Car aria-hidden="true" className="hidden size-4 shrink-0 sm:block" /> Cochera
                </button>
              </>
            )}
          </div>
        </div>

        <CardContent className="px-4 py-5 sm:px-6 sm:py-6">
          {category === "loteo" && (
            <div className="mb-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 p-3.5 rounded-xl border border-emerald-200 bg-emerald-50/70 text-xs text-emerald-900">
              <div className="flex items-center gap-2.5">
                <span className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-emerald-600 text-white shadow-sm">
                  <Layers className="size-4" />
                </span>
                <div>
                  <p className="font-bold text-emerald-950">¿Necesitás cargar una manzana completa?</p>
                  <p className="text-emerald-800 text-[11px]">Creá de forma instantánea todos los lotes de la manzana de una sola vez.</p>
                </div>
              </div>
              <Button
                type="button"
                size="sm"
                onClick={() => setIsGenerateLotsOpen(true)}
                className="h-8 px-3 text-xs font-semibold bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg shrink-0"
              >
                Abrir Carga Masiva
              </Button>
            </div>
          )}

          <form onSubmit={handleSubmit(onSubmit, invalid => setError(Object.values(invalid).map(field => field?.message).filter(Boolean).join(" ")))} className="space-y-5">
            <Field><FieldLabel htmlFor="property-project">Desarrollo / Proyecto</FieldLabel><select id="property-project" value={projectId} onChange={e => setProjectId(e.target.value)} className="h-11 w-full rounded-lg border border-border bg-background px-3 text-sm"><option value="">Propiedad independiente</option>{projects.map(project => <option key={project.id} value={project.id}>{project.name}</option>)}</select>{projectsError && <p role="alert" className="text-sm text-red-600">{projectsError}</p>}</Field>
            <FieldGroup className="grid gap-4 md:grid-cols-2">
              
              <Field className="md:col-span-2">
                <FieldLabel htmlFor="title" className="text-xs font-semibold text-slate-700">
                  Título Público <span className="text-rose-500">*</span>
                </FieldLabel>
                <Input
                  id="title"
                  {...register("title")}
                  placeholder={
                    category === 'tradicional' ? "Casa minimalista de 3 dormitorios" :
                    category === 'loteo' ? "Lote Central en Manzana A" : "Unidad Comercial 12A"
                  }
                  className={cn("h-10 rounded-lg bg-slate-50 text-sm", errors.title && "border-rose-500")}
                />
                {errors.title && <FieldError>{errors.title.message}</FieldError>}
              </Field>

              <Field>
                <FieldLabel htmlFor="city" className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                  Ciudad / Localidad <span className="text-rose-500">*</span>
                </FieldLabel>
                <select
                  id="city"
                  {...register("city")}
                  className={cn(
                    "h-10 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 text-sm text-slate-800 outline-none focus:border-blue-500 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-100",
                    errors.city && "border-rose-500"
                  )}
                  defaultValue=""
                >
                  <option value="">-- Seleccionar Ciudad --</option>
                  {JUJUY_CITIES.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
                {errors.city && <FieldError>{errors.city.message}</FieldError>}
              </Field>

              <Field>
                <FieldLabel htmlFor="neighborhood" className="text-xs font-semibold text-slate-700">Ubicación / Zona</FieldLabel>
                <Input id="neighborhood" {...register("neighborhood")} placeholder="Alto Comedero" className="h-10 rounded-lg bg-slate-50 text-sm" />
                {errors.neighborhood && <FieldError>{errors.neighborhood.message}</FieldError>}
              </Field>

              <Field>
                <FieldLabel htmlFor="price" className="text-xs font-semibold text-slate-700">Precio <span className="text-rose-500">*</span></FieldLabel>
                <select aria-label="Moneda del precio" {...register("currency")} className="mb-2 h-10 rounded-lg border border-border bg-background px-3 text-sm"><option value="USD">USD · Dólares</option><option value="ARS">ARS · Pesos</option></select>
                <Input id="price" type="number" step="0.01" {...register("price")} placeholder="15000" className="h-10 rounded-lg bg-slate-50 text-sm" />
                {errors.price && <FieldError>{errors.price.message}</FieldError>}
              </Field>

              {category === "tradicional" && <TraditionalFields register={register} />}
              {category === "loteo" && <LoteFields register={register} />}
              {category === "comercial" && <CommercialFields register={register} activeTab={activeTab} />}

              <Field className="md:col-span-2 border-t border-slate-100 pt-3">
                <FieldLabel htmlFor="description" className="text-xs font-semibold text-slate-700">Descripción / Referencia</FieldLabel>
                <Textarea
                  id="description"
                  {...register("description")}
                  placeholder="Añade detalles adicionales..."
                  rows={2}
                  className="rounded-lg bg-slate-50 border-slate-200 text-sm"
                />
              </Field>

            </FieldGroup>

            {error && <div className="p-3 bg-rose-50 border border-rose-200 text-rose-600 rounded-lg text-xs font-semibold">{error}</div>}

            <div className="flex justify-end gap-2 pt-4 border-t border-slate-100">
              <Button type="button" variant="outline" size="sm" className="rounded-lg px-4 h-9 text-xs font-semibold" onClick={() => setStep(1)}>
                Cancelar
              </Button>
              <Button type="submit" size="sm" disabled={isSaving} className="rounded-lg bg-blue-600 hover:bg-blue-700 text-white px-5 h-9 text-xs font-semibold shadow-sm">
                {isSaving ? "Guardando..." : `Guardar ${activeTab}`}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <GenerateLotsModal
        open={isGenerateLotsOpen}
        onOpenChange={setIsGenerateLotsOpen}
        onSuccess={() => {
          router.push("/admin/properties");
        }}
      />
    </div>
  );
}
