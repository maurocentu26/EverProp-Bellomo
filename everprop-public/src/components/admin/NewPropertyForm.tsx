"use client";

import { useAuth } from "@/lib/auth-context";
import { canManageInventory } from "@/lib/demo-permissions";
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
import { properties as sampleProperties, type Property, JUJUY_CITIES } from "@/data/admin-sample";
import { loadPropertyList, savePropertyList } from "@/lib/admin-storage";
import { isMockDataMode } from "@/lib/data-mode";
import { createEverpropProperty } from "@/lib/everprop-api";
import { Car, Store, Map, Building2, Home, ArrowLeft, Layers } from "lucide-react";
import { cn } from "@/lib/utils";
import { deferEffectUpdate } from "@/lib/deferred-effect";

import { isLocalDemo, demoCatalog } from "@/lib/demo-catalog";

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
  const { currentUser } = useAuth();
  const router = useRouter();
  const { isAdvisor } = useCurrentSession();
  const searchParams = useSearchParams();
  const paramCategory = searchParams.get("category") as Category | null;
  const paramType = searchParams.get("type") as "Casa" | "Departamento" | "Lote" | "Cochera" | "Local" | null;

  const [error, setError] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [savedProperty, setSavedProperty] = useState<Property | null>(null);
  const [publishOnSave, setPublishOnSave] = useState(true);
  
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
      spaceType: "Abierto",
      operation: "sale",
    },
  });

  // When category changes, update the default active tab
  useEffect(() => {
    return deferEffectUpdate(() => {
      if (category === "tradicional") setActiveTab("Casa");
      if (category === "loteo") setActiveTab("Lote");
      if (category === "comercial") setActiveTab("Local");
    });
  }, [category]);

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
        published: publishOnSave,
        title: data.title.trim(),
        operation: data.operation || "sale",
        propertyType: data.propertyType,
        price: Number(data.price),
        currency: "USD",
        city: data.city.trim(),
        neighborhood: data.neighborhood.trim(),
        bedrooms: data.bedrooms ? Number(data.bedrooms) : 0,
        bathrooms: data.bathrooms ? Number(data.bathrooms) : 0,
        area_m2: data.area_m2 ? Number(data.area_m2) : undefined,
        description: data.description,
        sectorName: data.propertyType === "Lote" ? data.sectorName : undefined,
        unitNumber: data.floor ? `${data.floor}-${data.unitNumber}` : data.unitNumber,
        status: "available",
        landFeatures: data.propertyType === "Lote" ? {
          water: !!data.water,
          electricity: !!data.electricity,
          curb: !!data.curb,
          gravel: !!data.gravel,
          sewage: !!data.sewage,
          spaceType: data.spaceType,
        } : undefined,
      };

      if (isLocalDemo) {
        const saved = await demoCatalog("POST", nextProperty) as Property;
        setSavedProperty(saved);
        setIsSaving(false);
        return;
      } else if (!isMockDataMode) {
        await createEverpropProperty({
          title: nextProperty.title,
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

  if (isLocalDemo && !canManageInventory(currentUser)) return <p role="alert">Tu perfil no tiene permiso para agregar propiedades.</p>;

  if (savedProperty) return <section className="mx-auto max-w-3xl space-y-5 rounded-2xl border border-emerald-200 bg-white p-6">
    <h1 className="text-2xl font-bold text-slate-900">{savedProperty.published ? "Propiedad guardada y publicada" : "Propiedad guardada como oculta"}</h1>
    <p className="text-slate-600"><strong>{savedProperty.title}</strong> {savedProperty.published ? "ya está en la web de Bellomo y Bellomito puede mostrarla." : "quedó guardada en el panel. No aparece en la web ni en Bellomito hasta que la publiques."} La cargaste una sola vez.</p>
    <div className="flex flex-wrap gap-3">
      <a href={`http://127.0.0.1:3002/?propiedad=${encodeURIComponent(savedProperty.id)}#inmueble-${encodeURIComponent(savedProperty.id)}`} target="_blank" rel="noreferrer" className="rounded-xl bg-blue-600 px-5 py-3 font-semibold text-white">Ver propiedad en la web</a>
      <button type="button" onClick={() => router.push("/admin/properties")} className="rounded-xl border border-slate-300 px-5 py-3 font-semibold">Volver al inventario</button>
      <button type="button" onClick={() => { setSavedProperty(null); reset(); setStep(1); }} className="rounded-xl border border-slate-300 px-5 py-3 font-semibold">Cargar otra propiedad</button>
    </div>
    <p className="text-sm text-slate-500">Podés ocultarla o volver a publicarla desde el panel. Esta es una demostración local.</p>
  </section>;

  const connectionNotice = isLocalDemo && <div className="mx-auto mb-6 max-w-4xl rounded-xl border border-blue-200 bg-blue-50 p-4 text-sm text-blue-950"><strong>Conectado con la web de Bellomo y Bellomito.</strong> Cargás la propiedad una sola vez y elegís si se muestra en la web.<label className="mt-3 flex items-center gap-2 font-semibold"><input type="checkbox" checked={publishOnSave} onChange={e=>setPublishOnSave(e.target.checked)}/>Mostrar en la web al guardar</label></div>;

  if (step === 1) {
    return <>{connectionNotice}<CategorySelector onSelect={handleCategorySelect} /></>;
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {connectionNotice}
      <button onClick={() => setStep(1)} className="flex items-center gap-2 text-sm font-semibold text-slate-500 hover:text-slate-900 transition-colors">
        <ArrowLeft className="h-4 w-4" /> Volver a categorías
      </button>

      <Card className="w-full overflow-hidden border border-slate-200 bg-white shadow-lg rounded-2xl p-0">
        <div className="bg-slate-950 px-6 py-6 text-white flex flex-col items-center">
          <CardTitle className="text-xl font-bold mb-1">
            {category === "tradicional" && "Añadir Propiedad Tradicional"}
            {category === "loteo" && "Añadir Lote o Terreno"}
            {category === "comercial" && "Añadir Activo Comercial"}
          </CardTitle>
          <CardDescription className="text-xs text-slate-400">
            Completá los datos requeridos para ingresar la unidad al inventario.
          </CardDescription>

          {/* Sub-Tabs based on category */}
          <div className="flex gap-2 mt-4 p-1 bg-slate-900 rounded-lg overflow-x-auto w-full sm:w-auto">
            {category === "tradicional" && (
              <>
                <button type="button" onClick={() => setActiveTab("Casa")} className={cn("flex items-center gap-2 px-4 py-2 rounded-md text-xs font-semibold transition-all whitespace-nowrap", activeTab === "Casa" ? "bg-indigo-600 text-white shadow-sm" : "text-slate-400 hover:text-slate-200 hover:bg-slate-800")}>
                  <Home className="w-3.5 h-3.5" /> Casa
                </button>
                <button type="button" onClick={() => setActiveTab("Departamento")} className={cn("flex items-center gap-2 px-4 py-2 rounded-md text-xs font-semibold transition-all whitespace-nowrap", activeTab === "Departamento" ? "bg-indigo-600 text-white shadow-sm" : "text-slate-400 hover:text-slate-200 hover:bg-slate-800")}>
                  <Building2 className="w-3.5 h-3.5" /> Departamento
                </button>
              </>
            )}

            {category === "loteo" && (
              <button type="button" onClick={() => setActiveTab("Lote")} className={cn("flex items-center gap-2 px-4 py-2 rounded-md text-xs font-semibold transition-all whitespace-nowrap", activeTab === "Lote" ? "bg-emerald-600 text-white shadow-sm" : "text-slate-400 hover:text-slate-200 hover:bg-slate-800")}>
                <Map className="w-3.5 h-3.5" /> Lote
              </button>
            )}

            {category === "comercial" && (
              <>
                <button type="button" onClick={() => setActiveTab("Local")} className={cn("flex items-center gap-2 px-4 py-2 rounded-md text-xs font-semibold transition-all whitespace-nowrap", activeTab === "Local" ? "bg-amber-600 text-white shadow-sm" : "text-slate-400 hover:text-slate-200 hover:bg-slate-800")}>
                  <Store className="w-3.5 h-3.5" /> Local Comercial
                </button>
                <button type="button" onClick={() => setActiveTab("Cochera")} className={cn("flex items-center gap-2 px-4 py-2 rounded-md text-xs font-semibold transition-all whitespace-nowrap", activeTab === "Cochera" ? "bg-amber-600 text-white shadow-sm" : "text-slate-400 hover:text-slate-200 hover:bg-slate-800")}>
                  <Car className="w-3.5 h-3.5" /> Cochera
                </button>
              </>
            )}
          </div>
        </div>

        <CardContent className="px-6 py-6">
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

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
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
                <FieldLabel htmlFor="price" className="text-xs font-semibold text-slate-700">Precio (USD) <span className="text-rose-500">*</span></FieldLabel>
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
