"use client";

import { useEffect, useMemo, useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { Controller, useForm } from "react-hook-form";
import { toast } from "sonner";
import * as z from "zod";
import {
  Building2,
  Car,
  Check,
  Home,
  Mail,
  MapPin,
  Phone,
  Search,
  Sparkles,
  Store,
  User,
  X,
  type LucideIcon,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field";
import {
  inferLeadInterestCategory,
  leads as sampleLeads,
  projects as sampleProjects,
  properties as sampleProperties,
  type Lead,
  type LeadInterestCategory,
  type Project,
  type Property,
} from "@/data/admin-sample";
import { MOCK_USERS } from "@/data/auth-sample";
import { appendLeadToStorage, loadLeadList, loadProjectList, loadPropertyList, saveLeadList } from "@/lib/admin-storage";
import { useAuth } from "@/lib/auth-context";
import { deferEffectUpdate } from "@/lib/deferred-effect";
import { createLeadInterest, isProjectUnit } from "@/lib/lead-interests";
import { isMockDataMode } from "@/lib/data-mode";
import { updateEverpropLead } from "@/lib/everprop-api";
import { cn } from "@/lib/utils";

export type AssetCategory = LeadInterestCategory;

interface AssetCategoryOption {
  id: AssetCategory;
  title: string;
  subtitle: string;
  icon: LucideIcon;
  color: string;
}

const CATEGORIES: AssetCategoryOption[] = [
  {
    id: "loteo",
    title: "Loteos",
    subtitle: "Lotes en barrios privados y desarrollos",
    icon: MapPin,
    color: "text-emerald-300 border-emerald-700 bg-emerald-950/60",
  },
  {
    id: "local",
    title: "Locales",
    subtitle: "Locales comerciales y espacios gastronómicos",
    icon: Store,
    color: "text-indigo-300 border-indigo-700 bg-indigo-950/60",
  },
  {
    id: "cochera",
    title: "Cocheras",
    subtitle: "Espacios de estacionamiento por piso o número",
    icon: Car,
    color: "text-blue-300 border-blue-700 bg-blue-950/60",
  },
  {
    id: "tradicional",
    title: "Inmobiliaria tradicional",
    subtitle: "Casas, departamentos, reventa y alquileres",
    icon: Home,
    color: "text-amber-300 border-amber-700 bg-amber-950/60",
  },
];

const ORIGINS = ["Web", "WhatsApp", "Portal", "Referido", "Instagram"];

const leadSchema = z.object({
  name: z.string().trim().min(2, "El nombre debe tener al menos 2 caracteres.").max(60, "El nombre no puede superar 60 caracteres."),
  origin: z.string().min(1, "Seleccioná un origen."),
  email: z
    .string()
    .trim()
    .optional()
    .refine((value) => !value || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value), "Ingresá un email válido."),
  phone: z
    .string()
    .trim()
    .optional()
    .refine((value) => !value || /^\+?[0-9\s().-]{7,20}$/.test(value), "Ingresá un teléfono válido."),
  stage: z.enum(["new", "contacted", "visiting", "negotiation", "closing"]),
  notes: z.string().trim().max(250, "Las notas no pueden superar 250 caracteres.").optional().or(z.literal("")),
  agentId: z.string().optional(),
});

type FormValues = z.infer<typeof leadSchema>;

interface NewLeadDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  companyId?: string;
  initialLead?: Lead | null;
  isCompleting?: boolean;
  onSuccess?: () => void;
  onLeadUpdated?: (lead: Lead) => void;
}

export function NewLeadDrawer({
  open,
  onOpenChange,
  companyId = "c1",
  initialLead = null,
  isCompleting = false,
  onSuccess,
  onLeadUpdated,
}: NewLeadDrawerProps) {
  const { currentUser } = useAuth();
  const [selectedCategory, setSelectedCategory] = useState<AssetCategory | null>(null);
  const [selectedProjectId, setSelectedProjectId] = useState("");
  const [selectedAsset, setSelectedAsset] = useState<Property | null>(null);
  const [assetSearchQuery, setAssetSearchQuery] = useState("");
  const [allProperties, setAllProperties] = useState<Property[]>([]);
  const [allProjects, setAllProjects] = useState<Project[]>([]);

  useEffect(() => {
    return deferEffectUpdate(() => {
      if (!open) return;
      setAllProperties(loadPropertyList(sampleProperties, companyId));
      setAllProjects(loadProjectList(sampleProjects, companyId));
    });
  }, [open, companyId]);

  const form = useForm<FormValues>({
    resolver: zodResolver(leadSchema),
    defaultValues: {
      name: "",
      origin: "WhatsApp",
      email: "",
      phone: "",
      stage: "new",
      notes: "",
      agentId: currentUser?.role === "ADVISOR" ? currentUser.id : "",
    },
  });

  useEffect(() => {
    if (open && initialLead) {
      form.reset({
        name: initialLead.name || "",
        origin: initialLead.origin || "WhatsApp",
        email: initialLead.email || "",
        phone: initialLead.phone || "",
        stage: initialLead.stage || "new",
        notes: initialLead.notes || "",
        agentId: initialLead.agentId || (currentUser?.role === "ADVISOR" ? currentUser.id : ""),
      });
      if (initialLead.interestCategory) {
        setSelectedCategory(initialLead.interestCategory);
      }
      if (initialLead.projectId) {
        setSelectedProjectId(initialLead.projectId);
      }
      if (initialLead.propertyIds && initialLead.propertyIds.length > 0) {
        const prop = allProperties.find((p) => p.id === initialLead.propertyIds[0]);
        if (prop) setSelectedAsset(prop);
      }
    } else if (open && !initialLead) {
      handleReset();
    }
  }, [open, initialLead, allProperties]);

  const availableAssets = useMemo(() => {
    const query = assetSearchQuery.toLowerCase().trim();

    return allProperties
      .filter((property) => !selectedCategory || inferLeadInterestCategory(property) === selectedCategory)
      .filter((property) => !selectedProjectId || property.projectId === selectedProjectId)
      .filter((property) => {
        if (!query) return true;
        const project = property.projectId ? allProjects.find((candidate) => candidate.id === property.projectId) : null;
        return [property.title, property.unitNumber, property.sectorName, property.neighborhood, project?.name]
          .filter((value): value is string => Boolean(value))
          .some((value) => value.toLowerCase().includes(query));
      });
  }, [allProjects, allProperties, assetSearchQuery, selectedCategory, selectedProjectId]);

  const selectedProject = allProjects.find((project) => project.id === selectedProjectId);

  const handleCategorySelect = (category: AssetCategory) => {
    const nextCategory = selectedCategory === category ? null : category;
    setSelectedCategory(nextCategory);

    if (selectedAsset && nextCategory && inferLeadInterestCategory(selectedAsset) !== nextCategory) {
      setSelectedAsset(null);
    }
  };

  const handleProjectSelect = (projectId: string) => {
    setSelectedProjectId(projectId);
    if (selectedAsset && selectedAsset.projectId !== projectId) setSelectedAsset(null);
  };

  const handleAssetSelect = (asset: Property) => {
    setSelectedAsset(asset);
    setSelectedCategory(inferLeadInterestCategory(asset));
    setSelectedProjectId(asset.projectId ?? "");
  };

  const handleReset = () => {
    if (isCompleting && initialLead) {
      form.reset({
        name: initialLead.name || "",
        origin: initialLead.origin || "WhatsApp",
        email: initialLead.email || "",
        phone: initialLead.phone || "",
        stage: initialLead.stage || "new",
        notes: initialLead.notes || "",
        agentId: initialLead.agentId || (currentUser?.role === "ADVISOR" ? currentUser.id : ""),
      });
      setSelectedCategory(initialLead.interestCategory ?? null);
      setSelectedProjectId(initialLead.projectId ?? "");
      setSelectedAsset(null);
      setAssetSearchQuery("");
      return;
    }
    setSelectedCategory(null);
    setSelectedProjectId("");
    setSelectedAsset(null);
    setAssetSearchQuery("");
    form.reset({
      name: "",
      origin: "WhatsApp",
      email: "",
      phone: "",
      stage: "new",
      notes: "",
      agentId: currentUser?.role === "ADVISOR" ? currentUser.id : "",
    });
  };

  const handleClose = () => {
    handleReset();
    onOpenChange(false);
  };

  const onSubmit = async (data: FormValues) => {
    const trimmedName = data.name.trim();
    const projectId = selectedAsset?.projectId ?? (selectedProjectId || initialLead?.projectId || undefined);
    const selectedAssetIsUnit = isProjectUnit(selectedAsset ?? undefined);
    const firstInterest = selectedCategory || projectId || selectedAsset
      ? createLeadInterest(companyId, {
          category: selectedCategory ?? undefined,
          projectId,
          propertyId: selectedAsset && !selectedAssetIsUnit ? selectedAsset.id : undefined,
          unitId: selectedAsset && selectedAssetIsUnit ? selectedAsset.id : undefined,
        })
      : undefined;

    if (isCompleting && initialLead) {
      const updatedLead: Lead = {
        ...initialLead,
        name: trimmedName || initialLead.name,
        phone: data.phone?.trim() || initialLead.phone,
        email: data.email?.trim() || initialLead.email,
        origin: data.origin || initialLead.origin,
        stage: data.stage || initialLead.stage,
        notes: data.notes?.trim() || initialLead.notes,
        agentId: data.agentId || initialLead.agentId,
        projectId,
        propertyIds: selectedAsset ? [selectedAsset.id] : initialLead.propertyIds,
        unitIds: selectedAsset && selectedAssetIsUnit ? [selectedAsset.id] : initialLead.unitIds,
        interestCategory: selectedCategory ?? initialLead.interestCategory,
        interests: firstInterest ? [...(initialLead.interests || []), firstInterest] : initialLead.interests,
        lastActivity: new Date().toISOString(),
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
          await updateEverpropLead(initialLead.id, {
            name: updatedLead.name,
            email: updatedLead.email,
            phone: updatedLead.phone,
            stage: stageApiMap[updatedLead.stage] || "NEW",
            notes: updatedLead.notes,
          });
          toast.success("Ficha completada y actualizada en la base de datos.");
        } catch (e: any) {
          toast.error("Error al actualizar lead: " + (e.message || "Error desconocido"));
          return;
        }
      } else {
        const stored = loadLeadList(sampleLeads, companyId);
        const nextLeads = stored.map((l) => (l.id === updatedLead.id ? updatedLead : l));
        saveLeadList(nextLeads, companyId);
        toast.success("Ficha del lead completada con éxito.");
      }

      onLeadUpdated?.(updatedLead);
      handleReset();
      onOpenChange(false);
      onSuccess?.();
      return;
    }

    const nextLead: Lead = {
      id: crypto.randomUUID(),
      companyId,
      name: trimmedName,
      origin: data.origin,
      propertyIds: selectedAsset ? [selectedAsset.id] : [],
      unitIds: selectedAsset && selectedAssetIsUnit ? [selectedAsset.id] : undefined,
      projectId,
      interestCategory: selectedCategory ?? undefined,
      stage: data.stage,
      lastActivity: new Date().toISOString(),
      phone: data.phone?.trim() || undefined,
      email: data.email?.trim() || undefined,
      notes: data.notes?.trim() || undefined,
      interests: firstInterest ? [firstInterest] : [],
      agentId: currentUser?.role === "ADVISOR" ? currentUser.id : data.agentId,
    };

    try {
      appendLeadToStorage(nextLead, sampleLeads, companyId);

      toast.success("Lead registrado con éxito", {
        description: selectedAsset
          ? `${trimmedName} fue asociado a ${selectedAsset.title}.`
          : `${trimmedName} se registró sin una propiedad asociada. Podés completar el interés después.`,
      });

      handleReset();
      onOpenChange(false);
      onSuccess?.();
    } catch {
      toast.error("No pudimos guardar el lead", {
        description: "Revisá el almacenamiento del navegador e intentá nuevamente.",
      });
    }
  };

  return (
    <Sheet
      open={open}
      onOpenChange={(nextOpen) => {
        onOpenChange(nextOpen);
        if (!nextOpen) handleReset();
      }}
    >
      <SheetContent
        side="right"
        data-theme-panel="lead"
        showCloseButton={false}
        className="inset-0 h-dvh !w-screen !max-w-none gap-0 border-0 bg-slate-950 p-0 text-white shadow-none data-[side=right]:!left-0 data-[side=right]:!right-0 data-[side=right]:!w-screen data-[side=right]:sm:!max-w-none motion-reduce:transition-none"
      >
        <SheetHeader className="shrink-0 border-b border-slate-800 bg-slate-900 px-6 py-4">
          <div className="mx-auto flex w-full max-w-7xl items-center justify-between gap-4">
            <div className="flex min-w-0 items-center gap-3">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-blue-600 text-white shadow-sm">
                <Sparkles size={18} aria-hidden="true" />
              </span>
              <div className="min-w-0">
                <SheetTitle className="text-xl font-bold tracking-tight text-white">
                  {isCompleting ? `Completar Ficha: ${initialLead?.name || ""}` : "Alta de nuevo lead"}
                </SheetTitle>
                <SheetDescription className="text-xs text-slate-400 mt-0.5">
                  {isCompleting
                    ? "Completá los datos pendientes del contacto y sus preferencias de inventario."
                    : "Registrá el contacto y su interés inmobiliario opcional."}
                </SheetDescription>
              </div>
            </div>

            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleClose}
              className="h-8 shrink-0 border-slate-700 bg-slate-800 px-3 text-xs font-semibold text-white hover:bg-slate-700 hover:text-white"
            >
              <X size={16} aria-hidden="true" className="mr-1" />
              Cerrar
            </Button>
          </div>
        </SheetHeader>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain bg-slate-950 p-6 sm:p-8">
          <form id="drawer-lead-form" onSubmit={form.handleSubmit(onSubmit)} className="mx-auto w-full max-w-7xl">
            <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-2">
              <section className="space-y-4 rounded-2xl border border-slate-800 bg-slate-900/90 p-5 shadow-sm" aria-labelledby="lead-basic-data">
                <div className="flex items-center gap-2.5 border-b border-slate-800 pb-3">
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-blue-950 text-blue-300">
                    <User size={16} aria-hidden="true" />
                  </span>
                  <div>
                    <h2 id="lead-basic-data" className="text-sm font-bold text-white">Datos básicos del lead</h2>
                  </div>
                </div>

                <Controller
                  name="name"
                  control={form.control}
                  render={({ field, fieldState }) => (
                    <Field data-invalid={fieldState.invalid}>
                      <FieldLabel htmlFor="lead-name" className="text-xs font-semibold text-slate-200 flex items-center justify-between">
                        <span>Nombre completo <span className="text-rose-400">*</span></span>
                        {isCompleting && initialLead?.name && (
                          <span className="text-[10px] font-medium text-emerald-400 bg-emerald-950/70 border border-emerald-800/80 px-1.5 py-0.5 rounded">Registrado</span>
                        )}
                      </FieldLabel>
                      <Input
                        {...field}
                        id="lead-name"
                        autoComplete="name"
                        autoFocus={!isCompleting}
                        disabled={isCompleting && Boolean(initialLead?.name)}
                        aria-invalid={fieldState.invalid}
                        placeholder="Ejemplo: Marcos Gallardo"
                        className="h-10 border-slate-700 bg-slate-950 px-3 text-sm text-white placeholder:text-slate-500 focus:border-blue-500 rounded-lg disabled:opacity-60 disabled:cursor-not-allowed disabled:bg-slate-900"
                      />
                      {fieldState.invalid && <FieldError errors={[fieldState.error]} className="text-xs font-medium text-rose-400" />}
                    </Field>
                  )}
                />

                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <Controller
                    name="phone"
                    control={form.control}
                    render={({ field, fieldState }) => (
                      <Field data-invalid={fieldState.invalid}>
                        <FieldLabel htmlFor="lead-phone" className="text-xs font-semibold text-slate-200 flex items-center justify-between">
                          <span>WhatsApp / Teléfono</span>
                          {isCompleting && initialLead?.phone ? (
                            <span className="text-[10px] font-medium text-emerald-400 bg-emerald-950/70 border border-emerald-800/80 px-1.5 py-0.5 rounded">Registrado</span>
                          ) : isCompleting ? (
                            <span className="text-[10px] font-medium text-amber-400 bg-amber-950/70 border border-amber-800/80 px-1.5 py-0.5 rounded">Pendiente</span>
                          ) : null}
                        </FieldLabel>
                        <div className="relative">
                          <Phone size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" aria-hidden="true" />
                          <Input
                            {...field}
                            id="lead-phone"
                            type="tel"
                            inputMode="tel"
                            autoComplete="tel"
                            disabled={isCompleting && Boolean(initialLead?.phone)}
                            aria-invalid={fieldState.invalid}
                            placeholder="+54 9 11..."
                            className="h-10 border-slate-700 bg-slate-950 pl-9 pr-3 text-sm text-white placeholder:text-slate-500 focus:border-blue-500 rounded-lg disabled:opacity-60 disabled:cursor-not-allowed disabled:bg-slate-900"
                          />
                        </div>
                        {fieldState.invalid && <FieldError errors={[fieldState.error]} className="text-xs font-medium text-rose-400" />}
                      </Field>
                    )}
                  />

                  <Controller
                    name="email"
                    control={form.control}
                    render={({ field, fieldState }) => (
                      <Field data-invalid={fieldState.invalid}>
                        <FieldLabel htmlFor="lead-email" className="text-xs font-semibold text-slate-200 flex items-center justify-between">
                          <span>Email</span>
                          {isCompleting && initialLead?.email ? (
                            <span className="text-[10px] font-medium text-emerald-400 bg-emerald-950/70 border border-emerald-800/80 px-1.5 py-0.5 rounded">Registrado</span>
                          ) : isCompleting ? (
                            <span className="text-[10px] font-medium text-amber-400 bg-amber-950/70 border border-amber-800/80 px-1.5 py-0.5 rounded">Pendiente</span>
                          ) : null}
                        </FieldLabel>
                        <div className="relative">
                          <Mail size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" aria-hidden="true" />
                          <Input
                            {...field}
                            id="lead-email"
                            type="email"
                            inputMode="email"
                            autoComplete="email"
                            disabled={isCompleting && Boolean(initialLead?.email)}
                            aria-invalid={fieldState.invalid}
                            placeholder="lead@ejemplo.com"
                            className="h-10 border-slate-700 bg-slate-950 pl-9 pr-3 text-sm text-white placeholder:text-slate-500 focus:border-blue-500 rounded-lg disabled:opacity-60 disabled:cursor-not-allowed disabled:bg-slate-900"
                          />
                        </div>
                        {fieldState.invalid && <FieldError errors={[fieldState.error]} className="text-xs font-medium text-rose-400" />}
                      </Field>
                    )}
                  />
                </div>

                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <Controller
                    name="origin"
                    control={form.control}
                    render={({ field, fieldState }) => (
                      <Field data-invalid={fieldState.invalid}>
                        <FieldLabel htmlFor="lead-origin" className="text-xs font-semibold text-slate-200 flex items-center justify-between">
                          <span>Origen del contacto</span>
                          {isCompleting && initialLead?.origin && (
                            <span className="text-[10px] font-medium text-emerald-400 bg-emerald-950/70 border border-emerald-800/80 px-1.5 py-0.5 rounded">Registrado</span>
                          )}
                        </FieldLabel>
                        <select
                          {...field}
                          id="lead-origin"
                          disabled={isCompleting && Boolean(initialLead?.origin)}
                          aria-invalid={fieldState.invalid}
                          className="h-10 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 text-sm text-white outline-none focus:border-blue-500 disabled:opacity-60 disabled:cursor-not-allowed disabled:bg-slate-900"
                        >
                          {ORIGINS.map((origin) => <option key={origin} value={origin}>{origin}</option>)}
                        </select>
                        {fieldState.invalid && <FieldError errors={[fieldState.error]} className="text-xs font-medium text-rose-400" />}
                      </Field>
                    )}
                  />

                  <Controller
                    name="stage"
                    control={form.control}
                    render={({ field }) => (
                      <Field>
                        <FieldLabel htmlFor="lead-stage" className="text-xs font-semibold text-slate-200">Estado comercial</FieldLabel>
                        <select
                          {...field}
                          id="lead-stage"
                          className="h-10 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 text-sm text-white outline-none focus:border-blue-500"
                        >
                          <option value="new">Nuevo</option>
                          <option value="contacted">Contactado</option>
                          <option value="visiting">Visitando</option>
                          <option value="negotiation">Negociación</option>
                          <option value="closing">Cierre</option>
                        </select>
                      </Field>
                    )}
                  />
                </div>

                <Controller
                  name="notes"
                  control={form.control}
                  render={({ field, fieldState }) => (
                    <Field data-invalid={fieldState.invalid}>
                      <FieldLabel htmlFor="lead-notes" className="text-xs font-semibold text-slate-200 flex items-center justify-between">
                        <span>Notas / Comentarios</span>
                        {isCompleting && !initialLead?.notes && (
                          <span className="text-[10px] font-medium text-amber-400 bg-amber-950/70 border border-amber-800/80 px-1.5 py-0.5 rounded">Pendiente</span>
                        )}
                      </FieldLabel>
                      <Textarea
                        {...field}
                        id="lead-notes"
                        rows={3}
                        aria-invalid={fieldState.invalid}
                        placeholder="Información relevante de la consulta..."
                        className="border-slate-700 bg-slate-950 p-2.5 text-sm text-white placeholder:text-slate-500 focus:border-blue-500 rounded-lg"
                      />
                      {fieldState.invalid && <FieldError errors={[fieldState.error]} className="text-xs font-medium text-rose-400" />}
                    </Field>
                  )}
                />

                {currentUser?.role === "ADMIN" && (
                  <Controller
                    name="agentId"
                    control={form.control}
                    render={({ field }) => (
                      <Field>
                        <FieldLabel htmlFor="lead-agent" className="text-xs font-semibold text-slate-200">Asesor comercial asignado</FieldLabel>
                        <select
                          {...field}
                          id="lead-agent"
                          className="h-10 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 text-sm text-white outline-none focus:border-blue-500"
                        >
                          <option value="">Sin asignar (Global)</option>
                          {MOCK_USERS.filter((user) => user.role === "ADVISOR").map((user) => (
                            <option key={user.id} value={user.id}>{user.name}</option>
                          ))}
                        </select>
                      </Field>
                    )}
                  />
                )}
              </section>

              <section className="space-y-4 rounded-2xl border border-slate-800 bg-slate-900/90 p-5 shadow-sm" aria-labelledby="lead-interest-data">
                <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                  <div className="flex items-center gap-2.5">
                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-violet-950 text-violet-300">
                      <Building2 size={16} aria-hidden="true" />
                    </span>
                    <h2 id="lead-interest-data" className="text-sm font-bold text-white">Interés inmobiliario</h2>
                  </div>
                  <span className="rounded-full border border-slate-700 bg-slate-800 px-2.5 py-0.5 text-[10px] font-semibold text-slate-300">Opcional</span>
                </div>

                <Field>
                  <FieldLabel className="text-xs font-semibold text-slate-200">Categoría de interés</FieldLabel>
                  <div className="grid grid-cols-2 gap-2 mt-1">
                    {CATEGORIES.map((category) => {
                      const Icon = category.icon;
                      const isSelected = selectedCategory === category.id;
                      return (
                        <button
                          key={category.id}
                          type="button"
                          aria-pressed={isSelected}
                          onClick={() => handleCategorySelect(category.id)}
                          className={cn(
                            "flex items-center gap-2.5 rounded-lg border p-2.5 text-left transition-colors",
                            isSelected ? "border-blue-400 bg-blue-950/70 ring-1 ring-blue-500/30" : "border-slate-700 bg-slate-950 hover:border-slate-500",
                          )}
                        >
                          <span className={cn("flex h-7 w-7 shrink-0 items-center justify-center rounded-md border", category.color)}>
                            <Icon size={14} aria-hidden="true" />
                          </span>
                          <div className="min-w-0 flex-1">
                            <span className="block text-xs font-bold leading-tight text-white">{category.title}</span>
                          </div>
                          {isSelected && <Check size={14} className="shrink-0 text-blue-300" aria-hidden="true" />}
                        </button>
                      );
                    })}
                  </div>
                </Field>

                <Field>
                  <FieldLabel htmlFor="lead-project" className="text-xs font-semibold text-slate-200">Desarrollo / Proyecto</FieldLabel>
                  <select
                    id="lead-project"
                    value={selectedProjectId}
                    onChange={(event) => handleProjectSelect(event.target.value)}
                    className="mt-1 h-10 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 text-sm text-white outline-none focus:border-blue-500"
                  >
                    <option value="">Sin proyecto identificado</option>
                    {allProjects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}
                  </select>
                </Field>

                <Field>
                  <FieldLabel htmlFor="lead-property-search" className="text-xs font-semibold text-slate-200">Propiedad específica</FieldLabel>

                  {selectedAsset && (
                    <div className="my-2 flex items-center gap-2.5 rounded-lg border border-blue-500 bg-blue-950/60 p-2.5">
                      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-blue-900 text-blue-200">
                        <Building2 size={14} aria-hidden="true" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-bold text-white truncate">{selectedAsset.title}</p>
                        <p className="text-[10px] text-slate-300 truncate">
                          {selectedProject?.name ?? `${selectedAsset.neighborhood}, ${selectedAsset.city}`}
                        </p>
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={() => setSelectedAsset(null)}
                        className="h-7 w-7 shrink-0 text-slate-300 hover:bg-slate-800 hover:text-white"
                        aria-label="Quitar propiedad seleccionada"
                      >
                        <X size={14} aria-hidden="true" />
                      </Button>
                    </div>
                  )}

                  <div className="relative mt-1">
                    <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" aria-hidden="true" />
                    <Input
                      id="lead-property-search"
                      value={assetSearchQuery}
                      onChange={(event) => setAssetSearchQuery(event.target.value)}
                      placeholder="Buscar lote, manzana o barrio..."
                      className="h-10 border-slate-700 bg-slate-950 pl-9 pr-3 text-sm text-white placeholder:text-slate-500 focus:border-blue-500 rounded-lg"
                    />
                  </div>

                  <div className="mt-2 max-h-48 space-y-1.5 overflow-y-auto pr-1">
                    {availableAssets.length > 0 ? (
                      availableAssets.slice(0, 8).map((asset) => {
                        const project = asset.projectId ? allProjects.find((candidate) => candidate.id === asset.projectId) : null;
                        const isSelected = selectedAsset?.id === asset.id;
                        return (
                          <button
                            key={asset.id}
                            type="button"
                            onClick={() => handleAssetSelect(asset)}
                            className={cn(
                              "flex w-full items-center gap-2.5 rounded-lg border p-2 text-left transition-colors",
                              isSelected ? "border-blue-400 bg-blue-950/70" : "border-slate-800 bg-slate-950 hover:border-slate-600",
                            )}
                          >
                            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-slate-800 text-xs font-bold text-blue-300">
                              {asset.unitNumber || asset.title.slice(0, 3)}
                            </span>
                            <span className="min-w-0 flex-1">
                              <span className="block text-xs font-semibold text-white truncate">{asset.title}</span>
                              <span className="block text-[10px] text-slate-400 truncate">
                                {project?.name ? `${project.name} · ` : ""}{asset.neighborhood}
                              </span>
                            </span>
                            {isSelected && <Check size={14} className="shrink-0 text-blue-300" aria-hidden="true" />}
                          </button>
                        );
                      })
                    ) : (
                      <p className="rounded-lg border border-dashed border-slate-700 p-4 text-center text-xs text-slate-400">
                        No se encontraron propiedades con esos filtros.
                      </p>
                    )}
                  </div>
                </Field>
              </section>
            </div>
          </form>
        </div>

        <SheetFooter className="shrink-0 border-t border-slate-800 bg-slate-900 px-6 py-4">
          <div className="mx-auto flex w-full max-w-7xl items-center justify-end gap-3">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleReset}
              className="h-9 px-4 text-xs font-semibold border-slate-700 bg-slate-800 text-slate-200 hover:bg-slate-700"
            >
              Limpiar formulario
            </Button>

            <Button
              type="submit"
              size="sm"
              form="drawer-lead-form"
              className="h-9 bg-blue-600 px-6 text-xs font-semibold text-white hover:bg-blue-700 shadow-sm"
            >
              {isCompleting ? "Guardar y completar ficha" : "Guardar lead"}
            </Button>
          </div>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
