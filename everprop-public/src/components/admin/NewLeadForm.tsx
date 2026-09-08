"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { zodResolver } from "@hookform/resolvers/zod";
import { Controller, useForm } from "react-hook-form";
import { toast } from "sonner";
import * as z from "zod";
import {
  AlertTriangle,
  ArrowLeft,
  Building2,
  Car,
  Check,
  Home,
  Lock,
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
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  inferLeadInterestCategory,
  leads as sampleLeads,
  projects as sampleProjects,
  properties as sampleProperties,
  type Lead,
  type LeadInterest,
  type LeadInterestCategory,
  type Project,
  type Property,
} from "@/data/admin-sample";
import { MOCK_USERS } from "@/data/auth-sample";
import { appendLeadToStorage, loadLeadList, loadProjectList, loadPropertyList, saveLeadList } from "@/lib/admin-storage";
import { useCurrentSession } from "@/hooks/use-current-session";
import { isMockDataMode } from "@/lib/data-mode";
import {
  attachEverpropLeadProperty,
  createEverpropLead,
  loadEverpropCatalog,
  loadEverpropLeadById,
  updateEverpropLead,
} from "@/lib/everprop-api";
import { createLeadInterest, isProjectUnit } from "@/lib/lead-interests";
import { createNotification } from "@/lib/notifications";
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
    color: "text-emerald-600 border-emerald-200 bg-emerald-50 hover:bg-emerald-100/70 dark:text-emerald-400 dark:border-emerald-800 dark:bg-emerald-950/40 dark:hover:bg-emerald-950/60",
  },
  {
    id: "local",
    title: "Locales",
    subtitle: "Locales comerciales y espacios gastronómicos",
    icon: Store,
    color: "text-indigo-600 border-indigo-200 bg-indigo-50 hover:bg-indigo-100/70 dark:text-indigo-400 dark:border-indigo-800 dark:bg-indigo-950/40 dark:hover:bg-indigo-950/60",
  },
  {
    id: "cochera",
    title: "Cocheras",
    subtitle: "Espacios de estacionamiento por piso o número",
    icon: Car,
    color: "text-blue-600 border-blue-200 bg-blue-50 hover:bg-blue-100/70 dark:text-blue-400 dark:border-blue-800 dark:bg-blue-950/40 dark:hover:bg-blue-950/60",
  },
  {
    id: "tradicional",
    title: "Inmobiliaria tradicional",
    subtitle: "Casas, departamentos, reventa y alquileres",
    icon: Home,
    color: "text-amber-600 border-amber-200 bg-amber-50 hover:bg-amber-100/70 dark:text-amber-400 dark:border-amber-800 dark:bg-amber-950/40 dark:hover:bg-amber-950/60",
  },
];

const ORIGINS = ["Web", "WhatsApp", "Portal", "Referido", "Instagram", "Web / Formulario"];

const REAL_ADVISORS = [
  {
    id: "b1100000-0000-4000-8000-000000000101",
    name: "Lucas Albarracín",
    role: "Asesor Comercial · Loteos",
  },
  {
    id: "b1100000-0000-4000-8000-000000000102",
    name: "Valentina Morales",
    role: "Asesora Comercial · Locales & Inversiones",
  },
  {
    id: "b1100000-0000-4000-8000-000000000104",
    name: "Ing. Sofía Bellomo",
    role: "Gerente Comercial",
  },
];

const formSchema = z
  .object({
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
      .refine((value) => !value || /^[+0-9\s().-]{6,30}$/.test(value), "Ingresá un teléfono válido."),
    stage: z.enum(["new", "contacted", "visiting", "negotiation", "closing"]),
    notes: z.string().trim().max(5000, "Las notas no pueden superar 5000 caracteres.").optional().or(z.literal("")),
    agentId: z.string().optional(),
  })
  .refine(
    (data) => Boolean(data.email?.trim() || data.phone?.trim()),
    {
      message: "Ingresá al menos un medio de contacto: WhatsApp o Correo electrónico.",
      path: ["phone"],
    }
  );

type FormValues = z.infer<typeof formSchema>;

type Props = {
  companyId?: string;
  leadId?: string;
  initialLead?: Lead;
  isEditing?: boolean;
};

export function NewLeadForm({ companyId = "c1", leadId, initialLead, isEditing = false }: Props) {
  const router = useRouter();
  const { user, isAdvisor } = useCurrentSession();
  const [activeLead, setActiveLead] = useState<Lead | null>(initialLead ?? null);
  const [isLoadingLead, setIsLoadingLead] = useState(Boolean(leadId && !initialLead));
  const [selectedCategory, setSelectedCategory] = useState<AssetCategory | null>(null);
  const [selectedProjectId, setSelectedProjectId] = useState("");
  const [selectedAsset, setSelectedAsset] = useState<Property | null>(null);
  const [assetSearchQuery, setAssetSearchQuery] = useState("");
  const [allProperties, setAllProperties] = useState<Property[]>([]);
  const [allProjects, setAllProjects] = useState<Project[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const advisorList = useMemo(() => {
    return isMockDataMode
      ? MOCK_USERS.filter((u) => u.role === "ADVISOR").map((u) => ({ id: u.id, name: u.name }))
      : REAL_ADVISORS;
  }, []);

  useEffect(() => {
    let active = true;
    if (leadId && !initialLead) {
      async function fetchLead() {
        if (!isMockDataMode) {
          try {
            const fetched = await loadEverpropLeadById(leadId!);
            if (active && fetched) {
              setActiveLead(fetched);
              setIsLoadingLead(false);
              return;
            }
          } catch {
            // fallback to storage
          }
        }
        if (active) {
          const stored = loadLeadList(sampleLeads, companyId);
          const found = stored.find((l) => l.id === leadId);
          if (found) setActiveLead(found);
          setIsLoadingLead(false);
        }
      }
      void fetchLead();
    }
    return () => {
      active = false;
    };
  }, [leadId, initialLead, companyId]);

  useEffect(() => {
    let active = true;
    async function loadData() {
      if (!isMockDataMode) {
        try {
          const catalog = await loadEverpropCatalog();
          if (!active) return;
          setAllProperties(catalog.properties);
          setAllProjects(catalog.projects);
          return;
        } catch {
          // fallback to storage
        }
      }
      if (!active) return;
      setAllProperties(loadPropertyList(sampleProperties, companyId));
      setAllProjects(loadProjectList(sampleProjects, companyId));
    }
    void loadData();
    return () => {
      active = false;
    };
  }, [companyId]);

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: "",
      origin: "WhatsApp",
      email: "",
      phone: "",
      stage: "new",
      notes: "",
      agentId: isAdvisor ? user?.id : "",
    },
  });

  useEffect(() => {
    if (activeLead) {
      const originValue = ORIGINS.includes(activeLead.origin)
        ? activeLead.origin
        : activeLead.origin?.toLowerCase().includes("web")
        ? "Web"
        : activeLead.origin?.toLowerCase().includes("whatsapp")
        ? "WhatsApp"
        : "Web";

      form.reset({
        name: activeLead.name || "",
        origin: originValue,
        email: activeLead.email || "",
        phone: activeLead.phone || "",
        stage: activeLead.stage || "new",
        notes: activeLead.notes || "",
        agentId: activeLead.agentId || (isAdvisor ? user?.id : ""),
      });

      if (activeLead.interestCategory) {
        setSelectedCategory(activeLead.interestCategory);
      }
      if (activeLead.projectId) {
        setSelectedProjectId(activeLead.projectId);
      }
    } else if (isAdvisor && user?.id) {
      form.setValue("agentId", user.id);
    }
  }, [activeLead, form, isAdvisor, user?.id]);

  useEffect(() => {
    if (activeLead && allProperties.length > 0 && !selectedAsset) {
      const candidateId =
        activeLead.propertyIds?.[0] ||
        activeLead.interests?.[0]?.propertyId ||
        activeLead.interests?.[0]?.unitId;
      if (candidateId) {
        const found = allProperties.find((p) => p.id === candidateId);
        if (found) {
          setSelectedAsset(found);
          if (!selectedCategory) setSelectedCategory(inferLeadInterestCategory(found));
          if (!selectedProjectId && found.projectId) setSelectedProjectId(found.projectId);
        }
      }
    }
  }, [activeLead, allProperties, selectedAsset, selectedCategory, selectedProjectId]);

  const watchedPhone = form.watch("phone");
  const watchedEmail = form.watch("email");
  const isContactModified = useMemo(() => {
    if (!isEditing || !activeLead) return false;
    const phoneChanged = (watchedPhone?.trim() || "") !== (activeLead.phone?.trim() || "");
    const emailChanged = (watchedEmail?.trim() || "") !== (activeLead.email?.trim() || "");
    return phoneChanged || emailChanged;
  }, [isEditing, activeLead, watchedPhone, watchedEmail]);

  const availableProjects = useMemo(() => {
    const eligibleProps = allProperties.filter(
      (p) => p.status !== "reserved" && p.status !== "sold"
    );
    if (!selectedCategory) {
      return allProjects.filter((project) =>
        eligibleProps.some((p) => p.projectId === project.id)
      );
    }
    return allProjects.filter((project) =>
      eligibleProps.some(
        (p) => p.projectId === project.id && inferLeadInterestCategory(p) === selectedCategory
      )
    );
  }, [allProjects, allProperties, selectedCategory]);

  const availableAssets = useMemo(() => {
    const query = assetSearchQuery.toLowerCase().trim();

    return allProperties
      .filter((property) => property.status !== "reserved" && property.status !== "sold")
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

    if (selectedProjectId && nextCategory) {
      const projectHasMatchingProps = allProperties.some(
        (p) => p.status !== "reserved" && p.status !== "sold" && p.projectId === selectedProjectId && inferLeadInterestCategory(p) === nextCategory
      );
      if (!projectHasMatchingProps) {
        setSelectedProjectId("");
      }
    }

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
      agentId: isAdvisor ? user?.id : "",
    });
  };

  const onFormError = (errors: any) => {
    console.error("Form validation errors:", errors);
    const firstKey = Object.keys(errors)[0];
    const firstError = errors[firstKey];
    if (firstError?.message) {
      toast.error(`Error en el formulario: ${firstError.message}`);
    } else {
      toast.error("Por favor revisá los campos obligatorios del formulario.");
    }
  };

  const onSubmit = async (data: FormValues) => {
    setIsSubmitting(true);
    const trimmedName = data.name.trim();
    const assignedAgentId = isAdvisor ? user?.id : (data.agentId || undefined);
    const projectId = selectedAsset?.projectId ?? (selectedProjectId || undefined);
    const selectedAssetIsUnit = isProjectUnit(selectedAsset ?? undefined);
    const targetCategory = selectedCategory ?? (selectedAsset ? inferLeadInterestCategory(selectedAsset) : undefined);
    
    const firstInterest: LeadInterest | undefined = (targetCategory || projectId || selectedAsset)
      ? {
          ...createLeadInterest(companyId, {
            category: targetCategory,
            projectId,
            propertyId: selectedAsset?.id,
            unitId: selectedAsset && selectedAssetIsUnit ? selectedAsset.id : undefined,
          }),
          propertyTitle: selectedAsset?.title,
          price: selectedAsset?.price,
          currency: selectedAsset?.currency,
        }
      : undefined;

    if (isEditing && activeLead) {
      const existingInterests = (activeLead.interests || []).filter(
        (i) => (!selectedAsset || (i.propertyId !== selectedAsset.id && i.unitId !== selectedAsset.id))
      );
      const updatedInterests = firstInterest ? [firstInterest, ...existingInterests] : activeLead.interests;

      const updatedLead: Lead = {
        ...activeLead,
        name: trimmedName || activeLead.name,
        phone: data.phone?.trim() || activeLead.phone,
        email: data.email?.trim() || activeLead.email,
        origin: data.origin || activeLead.origin,
        stage: data.stage || activeLead.stage,
        notes: data.notes?.trim() || activeLead.notes,
        agentId: assignedAgentId || activeLead.agentId,
        projectId,
        propertyIds: selectedAsset ? [selectedAsset.id] : (activeLead.propertyIds || []),
        unitIds: selectedAsset && selectedAssetIsUnit ? [selectedAsset.id] : activeLead.unitIds,
        interestCategory: targetCategory ?? activeLead.interestCategory,
        interests: updatedInterests,
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
          await updateEverpropLead(activeLead.id, {
            name: updatedLead.name,
            email: updatedLead.email,
            phone: updatedLead.phone,
            stage: stageApiMap[updatedLead.stage] || "NEW",
            notes: updatedLead.notes,
            agentId: updatedLead.agentId,
          });
          if (selectedAsset?.id) {
            try {
              await attachEverpropLeadProperty(activeLead.id, selectedAsset.id, {
                price: selectedAsset.price,
                currency: selectedAsset.currency,
              });
            } catch (e: any) {
              console.warn("Could not attach property to lead via API:", e);
            }
          }
        } catch (e: any) {
          toast.error("Error al actualizar lead en base de datos: " + (e.message || "Error desconocido"));
          setIsSubmitting(false);
          return;
        }
      }

      const stored = loadLeadList(sampleLeads, companyId);
      const nextLeads = stored.some((l) => l.id === updatedLead.id)
        ? stored.map((l) => (l.id === updatedLead.id ? updatedLead : l))
        : [updatedLead, ...stored];
      saveLeadList(nextLeads, companyId);

      toast.success("Ficha del lead completada con éxito.");
      router.push(`/admin/leads/${activeLead.id}`);
      router.refresh();
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
      agentId: assignedAgentId,
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
        const created = await createEverpropLead({
          name: trimmedName,
          email: nextLead.email,
          phone: nextLead.phone,
          stage: stageApiMap[nextLead.stage] || "NEW",
          notes: nextLead.notes,
          agentId: nextLead.agentId,
          propertyId: selectedAsset?.id || null,
        });
        nextLead.id = created.id;
      } catch (e: any) {
        toast.error("Error al guardar lead en base de datos: " + (e.message || "Error desconocido"));
        setIsSubmitting(false);
        return;
      }
    }

    try {
      appendLeadToStorage(nextLead, sampleLeads, companyId);

      if (nextLead.agentId) {
        try {
          const channel = new BroadcastChannel("everprop_events");
          channel.postMessage({ type: "LEAD_REASSIGNED", targetAgentId: nextLead.agentId, leadName: nextLead.name });
          channel.close();
          createNotification(nextLead.agentId, `Se te ha asignado el nuevo lead "${nextLead.name}"`, {
            title: "Nuevo lead asignado",
            leadId: nextLead.id,
            actionUrl: `/admin/leads/${nextLead.id}`,
            eventType: "LEAD_CREATED",
          });
        } catch (err) {
          console.error(err);
        }
      }

      toast.success("Lead registrado con éxito", {
        description: selectedAsset
          ? `${trimmedName} fue asociado a ${selectedAsset.title}.`
          : `${trimmedName} se registró correctamente en el pipeline.`,
      });

      router.push("/admin/leads");
    } catch {
      toast.error("No pudimos guardar el lead en almacenamiento local");
      setIsSubmitting(false);
    }
  };

  if (isEditing && isLoadingLead) {
    return (
      <div className="max-w-5xl mx-auto space-y-6">
        <div className="h-6 w-44 animate-pulse rounded-lg bg-slate-200 dark:bg-slate-800" />
        <div className="h-[36rem] animate-pulse rounded-2xl bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800" />
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <Link
        href={isEditing && (activeLead?.id || leadId) ? `/admin/leads/${activeLead?.id || leadId}` : "/admin/leads"}
        className="inline-flex items-center gap-2 text-sm font-semibold text-slate-500 hover:text-slate-900 transition-colors dark:text-slate-400 dark:hover:text-slate-100"
      >
        <ArrowLeft className="h-4 w-4" /> {isEditing ? "Volver a la ficha del lead" : "Volver a la lista de leads"}
      </Link>

      <Card className="w-full overflow-hidden border border-slate-200 bg-white shadow-lg rounded-2xl p-0 dark:border-slate-800 dark:bg-card">
        <div className="bg-slate-950 px-6 py-5 text-white border-b border-slate-800">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-600 text-white shadow-sm">
              <Sparkles size={20} aria-hidden="true" />
            </span>
            <div>
              <CardTitle className="text-xl font-bold text-white">
                {isEditing ? `Completar Ficha: ${activeLead?.name || ""}` : "Alta de nuevo lead"}
              </CardTitle>
              <CardDescription className="text-xs text-slate-400 mt-0.5">
                {isEditing
                  ? "Actualizá los datos de contacto, requerimientos comerciales y propiedades de interés del prospecto."
                  : "Registrá el contacto y su interés inmobiliario opcional para incorporarlo al pipeline comercial."}
              </CardDescription>
            </div>
          </div>
        </div>

        <form id="new-lead-page-form" onSubmit={form.handleSubmit(onSubmit, onFormError)}>
          <CardContent className="p-6 sm:p-8 space-y-6">
            <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-2">
              {/* ── Seccion 1: Datos basicos del lead ── */}
              <section className="space-y-4 rounded-2xl border border-slate-200 bg-slate-50/70 p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900/50" aria-labelledby="lead-basic-data">
                <div className="flex items-center gap-2.5 border-b border-slate-200 dark:border-slate-800 pb-3">
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-blue-100 text-blue-700 dark:bg-blue-950/80 dark:text-blue-300">
                    <User size={16} aria-hidden="true" />
                  </span>
                  <div>
                    <h2 id="lead-basic-data" className="text-sm font-bold text-slate-900 dark:text-slate-100">Datos básicos del lead</h2>
                  </div>
                </div>

                <Controller
                  name="name"
                  control={form.control}
                  render={({ field, fieldState }) => (
                    <Field data-invalid={fieldState.invalid}>
                      <div className="flex items-center justify-between">
                        <FieldLabel htmlFor="lead-name" className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                          Nombre completo <span className="text-rose-500">*</span>
                        </FieldLabel>
                        {isEditing && (
                          <span className="inline-flex items-center gap-1 rounded-md bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-500 dark:bg-slate-800 dark:text-slate-400">
                            <Lock className="size-3" /> Bloqueado en edición
                          </span>
                        )}
                      </div>
                      <Input
                        {...field}
                        id="lead-name"
                        autoComplete="name"
                        autoFocus={!isEditing}
                        disabled={isEditing}
                        readOnly={isEditing}
                        aria-invalid={fieldState.invalid}
                        placeholder="Ejemplo: Marcos Gallardo"
                        className={cn(
                          "h-10 border-slate-300 bg-white px-3 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-500 rounded-lg shadow-sm dark:border-slate-800 dark:bg-slate-950 dark:text-slate-100 dark:placeholder:text-slate-500",
                          isEditing && "bg-slate-100/80 text-slate-600 cursor-not-allowed border-slate-200 dark:bg-slate-900/80 dark:text-slate-400"
                        )}
                      />
                      {isEditing && (
                        <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">
                          El nombre del contacto no se puede modificar al completar la ficha.
                        </p>
                      )}
                      {fieldState.invalid && <FieldError errors={[fieldState.error]} className="text-xs font-medium text-rose-600" />}
                    </Field>
                  )}
                />

                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <Controller
                    name="phone"
                    control={form.control}
                    render={({ field, fieldState }) => (
                      <Field data-invalid={fieldState.invalid}>
                        <FieldLabel htmlFor="lead-phone" className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                          WhatsApp / Teléfono
                        </FieldLabel>
                        <div className="relative">
                          <Phone size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" aria-hidden="true" />
                          <Input
                            {...field}
                            id="lead-phone"
                            type="tel"
                            inputMode="tel"
                            autoComplete="tel"
                            aria-invalid={fieldState.invalid}
                            placeholder="+54 9 11..."
                            className="h-10 border-slate-300 bg-white pl-9 pr-3 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-500 rounded-lg shadow-sm dark:border-slate-800 dark:bg-slate-950 dark:text-slate-100 dark:placeholder:text-slate-500"
                          />
                        </div>
                        {fieldState.invalid && <FieldError errors={[fieldState.error]} className="text-xs font-medium text-rose-600" />}
                      </Field>
                    )}
                  />

                  <Controller
                    name="email"
                    control={form.control}
                    render={({ field, fieldState }) => (
                      <Field data-invalid={fieldState.invalid}>
                        <FieldLabel htmlFor="lead-email" className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                          Email
                        </FieldLabel>
                        <div className="relative">
                          <Mail size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" aria-hidden="true" />
                          <Input
                            {...field}
                            id="lead-email"
                            type="email"
                            inputMode="email"
                            autoComplete="email"
                            aria-invalid={fieldState.invalid}
                            placeholder="lead@ejemplo.com"
                            className="h-10 border-slate-300 bg-white pl-9 pr-3 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-500 rounded-lg shadow-sm dark:border-slate-800 dark:bg-slate-950 dark:text-slate-100 dark:placeholder:text-slate-500"
                          />
                        </div>
                        {fieldState.invalid && <FieldError errors={[fieldState.error]} className="text-xs font-medium text-rose-600" />}
                      </Field>
                    )}
                  />
                </div>

                <p className="text-[11px] text-slate-500 dark:text-slate-400">
                  Podés ingresar WhatsApp, correo electrónico o ambos (al menos un medio de contacto es requerido).
                </p>

                {isContactModified && (
                  <div className="rounded-xl border border-amber-200 bg-amber-50/90 p-3 text-xs text-amber-900 dark:border-amber-900/50 dark:bg-amber-950/40 dark:text-amber-200 flex items-start gap-2.5 shadow-2xs">
                    <AlertTriangle className="size-4 text-amber-600 shrink-0 mt-0.5" />
                    <div>
                      <span className="font-bold">Aviso de modificación de contacto:</span> Has editado el teléfono o correo electrónico del lead. La nueva información reemplazará la registrada previamente en el CRM.
                    </div>
                  </div>
                )}

                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <Controller
                    name="origin"
                    control={form.control}
                    render={({ field, fieldState }) => (
                      <Field data-invalid={fieldState.invalid}>
                        <FieldLabel htmlFor="lead-origin" className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                          Origen del contacto
                        </FieldLabel>
                        <select
                          {...field}
                          id="lead-origin"
                          aria-invalid={fieldState.invalid}
                          className="h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900 shadow-sm outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-100"
                        >
                          {ORIGINS.map((origin) => <option key={origin} value={origin}>{origin}</option>)}
                        </select>
                        {fieldState.invalid && <FieldError errors={[fieldState.error]} className="text-xs font-medium text-rose-600" />}
                      </Field>
                    )}
                  />

                  <Controller
                    name="stage"
                    control={form.control}
                    render={({ field }) => (
                      <Field>
                        <FieldLabel htmlFor="lead-stage" className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                          Estado comercial
                        </FieldLabel>
                        <select
                          {...field}
                          id="lead-stage"
                          className="h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900 shadow-sm outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-100"
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
                      <FieldLabel htmlFor="lead-notes" className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                        Notas / Comentarios
                      </FieldLabel>
                      <Textarea
                        {...field}
                        id="lead-notes"
                        rows={3}
                        aria-invalid={fieldState.invalid}
                        placeholder="Información relevante de la consulta, preferencias, presupuesto estimado..."
                        className="border-slate-300 bg-white p-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-500 rounded-lg shadow-sm dark:border-slate-800 dark:bg-slate-950 dark:text-slate-100 dark:placeholder:text-slate-500"
                      />
                      {fieldState.invalid && <FieldError errors={[fieldState.error]} className="text-xs font-medium text-rose-600" />}
                    </Field>
                  )}
                />

                {!isAdvisor && (
                  <Controller
                    name="agentId"
                    control={form.control}
                    render={({ field }) => (
                      <Field>
                        <FieldLabel htmlFor="lead-agent" className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                          Asesor comercial asignado
                        </FieldLabel>
                        <select
                          {...field}
                          id="lead-agent"
                          className="h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900 shadow-sm outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-100"
                        >
                          <option value="">Sin asignar (Global)</option>
                          {advisorList.map((advisor) => (
                            <option key={advisor.id} value={advisor.id}>{advisor.name}</option>
                          ))}
                        </select>
                      </Field>
                    )}
                  />
                )}
              </section>

              {/* ── Seccion 2: Interes inmobiliario (Opcional) ── */}
              <section className="space-y-4 rounded-2xl border border-slate-200 bg-slate-50/70 p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900/50" aria-labelledby="lead-interest-data">
                <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-3">
                  <div className="flex items-center gap-2.5">
                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-violet-100 text-violet-700 dark:bg-violet-950/80 dark:text-violet-300">
                      <Building2 size={16} aria-hidden="true" />
                    </span>
                    <h2 id="lead-interest-data" className="text-sm font-bold text-slate-900 dark:text-slate-100">Interés inmobiliario</h2>
                  </div>
                  <span className="rounded-full border border-slate-200 bg-white px-2.5 py-0.5 text-[10px] font-semibold text-slate-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-400">
                    Opcional
                  </span>
                </div>

                <Field>
                  <FieldLabel className="text-xs font-semibold text-slate-700 dark:text-slate-300">Categoría de interés</FieldLabel>
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
                            "flex items-center gap-2.5 rounded-lg border p-2.5 text-left transition-all shadow-sm",
                            isSelected
                              ? "border-blue-500 bg-blue-50 text-blue-900 ring-2 ring-blue-500/20 dark:bg-blue-950/40 dark:text-blue-200 dark:border-blue-500"
                              : "border-slate-200 bg-white hover:border-slate-300 text-slate-700 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-300 dark:hover:border-slate-700 dark:hover:bg-slate-900",
                          )}
                        >
                          <span className={cn("flex h-7 w-7 shrink-0 items-center justify-center rounded-md border", category.color)}>
                            <Icon size={14} aria-hidden="true" />
                          </span>
                          <div className="min-w-0 flex-1">
                            <span className="block text-xs font-bold leading-tight truncate">{category.title}</span>
                          </div>
                          {isSelected && <Check size={14} className="shrink-0 text-blue-600 dark:text-blue-400" aria-hidden="true" />}
                        </button>
                      );
                    })}
                  </div>
                </Field>

                <Field>
                  <FieldLabel htmlFor="lead-project" className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                    Desarrollo / Proyecto
                  </FieldLabel>
                  <select
                    id="lead-project"
                    value={selectedProjectId}
                    onChange={(event) => handleProjectSelect(event.target.value)}
                    className="mt-1 h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900 shadow-sm outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-100"
                  >
                    <option value="">
                      {selectedCategory ? "Todos los proyectos de esta categoría" : "Sin proyecto identificado"}
                    </option>
                    {availableProjects.map((project) => (
                      <option key={project.id} value={project.id}>{project.name}</option>
                    ))}
                  </select>
                </Field>

                <Field>
                  <FieldLabel htmlFor="lead-property-search" className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                    Propiedad específica
                  </FieldLabel>

                  {selectedAsset && (
                    <div className="my-2 flex items-center gap-2.5 rounded-lg border border-blue-300 bg-blue-50 p-2.5 shadow-sm dark:border-blue-900 dark:bg-blue-950/40">
                      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-blue-600 text-white">
                        <Building2 size={14} aria-hidden="true" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-bold text-slate-900 truncate dark:text-slate-100">{selectedAsset.title}</p>
                        <p className="text-[10px] text-slate-500 truncate dark:text-slate-400">
                          {selectedProject?.name ?? `${selectedAsset.neighborhood}, ${selectedAsset.city}`}
                        </p>
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={() => setSelectedAsset(null)}
                        className="h-7 w-7 shrink-0 text-slate-500 hover:bg-slate-200 hover:text-slate-800 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-200"
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
                      className="h-10 border-slate-300 bg-white pl-9 pr-3 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-500 rounded-lg shadow-sm dark:border-slate-800 dark:bg-slate-950 dark:text-slate-100 dark:placeholder:text-slate-500"
                    />
                  </div>

                  <div className="mt-2 max-h-60 space-y-1.5 overflow-y-auto pr-1">
                    {availableAssets.length > 0 ? (
                      availableAssets.slice(0, 50).map((asset) => {
                        const project = asset.projectId ? allProjects.find((candidate) => candidate.id === asset.projectId) : null;
                        const isSelected = selectedAsset?.id === asset.id;
                        return (
                          <button
                            key={asset.id}
                            type="button"
                            onClick={() => handleAssetSelect(asset)}
                            className={cn(
                              "flex w-full items-center gap-2.5 rounded-lg border p-2 text-left transition-all",
                              isSelected
                                ? "border-blue-400 bg-blue-50/80 dark:border-blue-700 dark:bg-blue-950/50"
                                : "border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-950 dark:hover:border-slate-700 dark:hover:bg-slate-900",
                            )}
                          >
                            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-slate-100 text-xs font-bold text-blue-700 border border-slate-200 dark:bg-slate-900 dark:text-blue-400 dark:border-slate-800">
                              {asset.unitNumber || asset.title.slice(0, 3)}
                            </span>
                            <span className="min-w-0 flex-1">
                              <span className="block text-xs font-semibold text-slate-900 truncate dark:text-slate-100">{asset.title}</span>
                              <span className="block text-[10px] text-slate-500 truncate dark:text-slate-400">
                                {project?.name ? `${project.name} · ` : ""}{asset.neighborhood}
                              </span>
                            </span>
                            {isSelected && <Check size={14} className="shrink-0 text-blue-600 dark:text-blue-400" aria-hidden="true" />}
                          </button>
                        );
                      })
                    ) : (
                      <p className="rounded-lg border border-dashed border-slate-200 bg-white p-4 text-center text-xs text-slate-400 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-500">
                        No se encontraron propiedades con esos filtros.
                      </p>
                    )}
                  </div>
                </Field>
              </section>
            </div>
          </CardContent>

          <CardFooter className="flex flex-col-reverse gap-3 border-t border-slate-200 bg-slate-50 px-6 py-4 sm:flex-row sm:items-center sm:justify-between dark:border-slate-800 dark:bg-slate-900/60">
            <Button
              type="button"
              variant="outline"
              onClick={() => router.push(isEditing && (activeLead?.id || leadId) ? `/admin/leads/${activeLead?.id || leadId}` : "/admin/leads")}
              className="h-10 px-4 text-xs font-semibold border-slate-300 text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
            >
              Cancelar
            </Button>

            <div className="flex gap-2.5">
              {!isEditing && (
                <Button
                  type="button"
                  variant="ghost"
                  onClick={handleReset}
                  className="h-10 px-4 text-xs font-semibold text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200"
                >
                  Limpiar formulario
                </Button>
              )}

              <Button
                type="submit"
                disabled={isSubmitting}
                className="h-10 bg-blue-600 px-6 text-xs font-bold text-white hover:bg-blue-700 shadow-sm disabled:opacity-50"
              >
                {isSubmitting ? "Guardando..." : isEditing ? "Guardar y completar ficha" : "Guardar lead"}
              </Button>
            </div>
          </CardFooter>
        </form>
      </Card>
    </div>
  );
}
