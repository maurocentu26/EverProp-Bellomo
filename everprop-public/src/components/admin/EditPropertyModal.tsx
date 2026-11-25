"use client";

import { useEffect, useRef, useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Field, FieldLabel } from "@/components/ui/field";
import { toast } from "sonner";
import { Building2, Save } from "lucide-react";
import { type Property, JUJUY_CITIES } from "@/data/admin-sample";
import { isMockDataMode } from "@/lib/data-mode";
import { propertyStatusLabel, propertyOperationLabel } from "@/lib/inventory-labels";
import { createEverpropPropertyFeature, deleteEverpropPropertyFeature, loadEverpropPropertyById, updateEverpropProperty, updateEverpropPropertyFeature } from "@/lib/everprop-api";
import PropertyFeaturesEditor, { draftFromFeature, validateFeatureDrafts, type FeatureDraft } from "./property-form/PropertyFeaturesEditor";

interface EditPropertyModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  property: Property;
  onSuccess: (updated: Property) => void;
}

function formValues(property: Property) {
  return {
    title: property.title,
    price: property.inventoryPrice === null ? "" : String(property.inventoryPrice ?? property.price),
    currency: property.inventoryCurrency === null ? "" : property.inventoryCurrency ?? property.currency,
    operation: property.operation || "sale",
    propertyType: property.propertyType || "Lote",
    status: property.status || "available",
    sectorName: property.sectorName || "",
    unitNumber: property.unitNumber || "",
    area_m2: property.area_m2 != null ? String(property.area_m2) : "",
    rooms: property.rooms != null ? String(property.rooms) : "",
    bedrooms: property.bedrooms != null ? String(property.bedrooms) : "",
    bathrooms: property.bathrooms != null ? String(property.bathrooms) : "",
    coveredAreaM2: property.coveredAreaM2 != null ? String(property.coveredAreaM2) : "",
    uncoveredAreaM2: property.uncoveredAreaM2 != null ? String(property.uncoveredAreaM2) : "",
    floor: property.floor || "",
    orientation: property.orientation || "",
    disposition: property.disposition || "",
    parkingSpaces: property.parkingSpaces != null ? String(property.parkingSpaces) : "",
    expenses: property.expenses != null ? String(property.expenses) : "",
    expensesCurrency: property.expensesCurrency || "",
    city: property.city || "",
    neighborhood: property.neighborhood || "",
    description: property.description || "",
  };
}

export function EditPropertyModal({
  open,
  onOpenChange,
  property,
  onSuccess,
}: EditPropertyModalProps) {
  const savingRef = useRef(false);
  const [reviewing, setReviewing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState("");
  const errorRef = useRef<HTMLDivElement>(null);
  const [features, setFeatures] = useState<FeatureDraft[]>(() => (property.features ?? []).map(draftFromFeature));
  const [formData, setFormData] = useState(() => formValues(property));
  useEffect(() => {
    if (!open) return;
    setFormData(formValues(property));
    setFeatures((property.features ?? []).map(draftFromFeature));
    setReviewing(false);
    setError("");
  }, [open, property.id]);
  const hasChanges = () => JSON.stringify(formData) !== JSON.stringify(formValues(property))
    || JSON.stringify(features) !== JSON.stringify((property.features ?? []).map(draftFromFeature));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (savingRef.current) return;
    if (!formData.title.trim() || (formData.price.trim() && (!Number.isFinite(Number(formData.price)) || Number(formData.price) < 0))) {
      toast.error("Ingresá un título y un precio válido, mayor o igual a cero."); return;
    }
    if (formData.area_m2 && (!Number.isFinite(Number(formData.area_m2)) || Number(formData.area_m2) <= 0)) {
      toast.error("La superficie debe ser mayor que cero."); return;
    }
    const residential = formData.propertyType === "Casa" || formData.propertyType === "Departamento";
    if (residential) {
      for (const [label, value, positive] of [
        ["Ambientes", formData.rooms, false], ["Dormitorios", formData.bedrooms, false],
        ["Baños", formData.bathrooms, false], ["Cocheras", formData.parkingSpaces, false],
        ["Superficie cubierta", formData.coveredAreaM2, true], ["Superficie descubierta", formData.uncoveredAreaM2, false],
        ["Expensas", formData.expenses, false],
      ] as [string, string, boolean][]) {
        if (value && (!Number.isFinite(Number(value)) || Number(value) < 0 || (positive && Number(value) === 0))) {
          toast.error(`${label}: ingresá un valor válido.`); return;
        }
      }
      for (const value of [formData.rooms, formData.bedrooms, formData.bathrooms, formData.parkingSpaces]) {
        if (value && !Number.isInteger(Number(value))) { toast.error("Ambientes, dormitorios, baños y cocheras deben ser enteros."); return; }
      }
      if (Boolean(formData.expenses.trim()) !== Boolean(formData.expensesCurrency)) {
        toast.error("Informá el monto y la moneda de expensas juntos."); return;
      }
      try { validateFeatureDrafts(features); } catch (reason) { toast.error((reason as Error).message); return; }
    }
    const priceChanged = formData.price !== (property.inventoryPrice === null ? "" : String(property.inventoryPrice ?? property.price));
    const currencyChanged = formData.currency !== (property.inventoryCurrency === null ? "" : property.inventoryCurrency ?? property.currency);
    const expensesChanged = formData.expenses !== (property.expenses == null ? "" : String(property.expenses))
      || formData.expensesCurrency !== (property.expensesCurrency || "");
    if (currencyChanged && !formData.currency) { toast.error("La API no admite quitar la moneda desde esta ficha."); return; }
    if (priceChanged && !formData.price.trim()) { toast.error("La API no admite quitar el precio desde esta ficha."); return; }
    if ((priceChanged || currencyChanged) && formData.price.trim() && !formData.currency) { toast.error("Confirmá la moneda antes de guardar un precio."); return; }
    if (!reviewing) { setReviewing(true); return; }
    savingRef.current = true;
    setIsSaving(true);
    let propertySaved = false;
    try {
      let updatedData: Property = {
        ...property,
        title: formData.title.trim(),
        price: formData.price ? Number(formData.price) : 0,
        currency: formData.currency as "USD" | "ARS",
        inventoryPrice: formData.price.trim() ? Number(formData.price) : null,
        inventoryCurrency: formData.currency || null,
        priceKnown: Boolean(formData.price.trim() && formData.currency),
        operation: formData.operation as Property['operation'],
        propertyType: formData.propertyType,
        status: formData.status as Property['status'],
        sectorName: formData.sectorName.trim() || undefined,
        unitNumber: formData.unitNumber.trim() || undefined,
        area_m2: formData.area_m2 ? Number(formData.area_m2) : undefined,
        rooms: residential && formData.rooms !== "" ? Number(formData.rooms) : null,
        bedrooms: residential && formData.bedrooms !== "" ? Number(formData.bedrooms) : property.bedrooms,
        bathrooms: residential && formData.bathrooms !== "" ? Number(formData.bathrooms) : property.bathrooms,
        coveredAreaM2: residential && formData.coveredAreaM2 !== "" ? Number(formData.coveredAreaM2) : null,
        uncoveredAreaM2: residential && formData.uncoveredAreaM2 !== "" ? Number(formData.uncoveredAreaM2) : null,
        floor: residential ? formData.floor.trim() || null : property.floor,
        orientation: residential ? formData.orientation.trim() || null : property.orientation,
        disposition: residential ? formData.disposition.trim() || null : property.disposition,
        parkingSpaces: residential && formData.parkingSpaces !== "" ? Number(formData.parkingSpaces) : null,
        expenses: residential && formData.expenses !== "" ? Number(formData.expenses) : null,
        expensesCurrency: residential && formData.expenses !== "" ? formData.expensesCurrency as "USD" | "ARS" : null,
        features: residential ? validateFeatureDrafts(features).map((feature, index) => ({
          id: features[index].id ?? -(index + 1), group: feature.group, code: feature.code,
          label: feature.label, value: feature.value, isFilterable: feature.isFilterable ?? true,
          sortOrder: index,
        })) : property.features,
        city: formData.city.trim() || property.city || "Sin ciudad",
        neighborhood: formData.neighborhood.trim() || property.neighborhood || "",
        description: formData.description.trim() || undefined,
      };

      if (!isMockDataMode) {
        const persisted = await updateEverpropProperty(property.id, {
          version: property.version,
          title: updatedData.title,
          ...(priceChanged && formData.price.trim() ? { price: updatedData.price } : {}),
          ...((priceChanged || currencyChanged) && formData.currency ? { currency: updatedData.currency } : {}),
          operation: updatedData.operation,
          propertyType: updatedData.propertyType,
          status: updatedData.status,
          sectorName: updatedData.sectorName ?? null,
          unitNumber: updatedData.unitNumber ?? null,
          area_m2: updatedData.area_m2 ?? null,
          ...(residential ? {
            rooms: updatedData.rooms, bedrooms: formData.bedrooms === "" ? null : updatedData.bedrooms,
            bathrooms: formData.bathrooms === "" ? null : updatedData.bathrooms,
            coveredAreaM2: updatedData.coveredAreaM2, uncoveredAreaM2: updatedData.uncoveredAreaM2,
            floor: updatedData.floor, orientation: updatedData.orientation, disposition: updatedData.disposition,
            parkingSpaces: updatedData.parkingSpaces,
            ...(expensesChanged ? { expenses: updatedData.expenses, expensesCurrency: updatedData.expensesCurrency } : {}),
          } : {}),
          city: updatedData.city,
          neighborhood: updatedData.neighborhood,
          description: updatedData.description ?? null,
        });
        updatedData = { ...updatedData, ...persisted };
        propertySaved = true;
        if (residential) {
          const inputs = validateFeatureDrafts(features);
          const remainingIds = new Set(features.map(feature => feature.id).filter((id): id is number => id != null));
          for (const previous of property.features ?? []) {
            if (!remainingIds.has(previous.id)) await deleteEverpropPropertyFeature(property.id, previous.id);
          }
          for (const [index, draft] of features.entries()) {
            const input = inputs[index];
            if (!draft.id) await createEverpropPropertyFeature(property.id, input);
            else {
              const previous = property.features?.find(feature => feature.id === draft.id);
              if (previous && (previous.group !== input.group || previous.label !== input.label || previous.value !== input.value)) {
                await updateEverpropPropertyFeature(property.id, draft.id, {
                  group: input.group, label: input.label, value: input.value,
                });
              }
            }
          }
          updatedData = await loadEverpropPropertyById(property.id);
        }
      }

      toast.success("Activo actualizado correctamente");
      onSuccess(updatedData);
      onOpenChange(false);
    } catch (err: any) {
      if (propertySaved && !isMockDataMode) {
        try { const current = await loadEverpropPropertyById(property.id); onSuccess(current); setFeatures((current.features ?? []).map(draftFromFeature)); }
        catch { /* El mensaje conserva el estado parcial para no sugerir un nuevo intento ciego. */ }
      }
      const msg = propertySaved
        ? "La propiedad se actualizó, pero algunas características no se guardaron. Recargá la ficha y revisalas antes de reintentar. " + (err.message || "")
        : "Error al actualizar la propiedad: " + (err.message || "Error desconocido");
      setError(msg);
      errorRef.current?.focus();
      toast.error(msg);
    } finally {
      savingRef.current = false;
      setIsSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(next) => {
      if (isSaving) return;
      if (!next && hasChanges() && typeof window !== "undefined" && typeof window.confirm === "function" && !window.confirm("Hay cambios sin guardar en este activo. ¿Querés cerrar y descartarlos?")) return;
      onOpenChange(next);
    }}>
      <DialogContent className="admin-workspace inventory-view inventory-dialog w-[calc(100%-2rem)] sm:max-w-2xl max-h-[calc(100dvh-2rem)] overflow-y-auto p-6 bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 rounded-2xl shadow-xl">
        <form onSubmit={handleSubmit} className="space-y-5">
          <DialogHeader className="pb-3 pr-6 border-b border-slate-100 dark:border-slate-800">
            <div className="flex items-center gap-2.5">
              <div className="hidden sm:flex h-9 w-9 shrink-0 rounded-xl bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400 items-center justify-center">
                <Building2 className="h-5 w-5" />
              </div>
              <div>
                <DialogTitle className="text-xl font-bold text-slate-900 dark:text-slate-100">Editar activo</DialogTitle>
                <DialogDescription className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  Actualizá la información de esta propiedad.
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>

          <fieldset hidden={reviewing} disabled={isSaving} className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Field className="md:col-span-2">
              <FieldLabel htmlFor="edit-property-1" className="text-xs font-semibold text-slate-700 dark:text-slate-300">Título del Inmueble</FieldLabel>
              <Input id="edit-property-1"
                value={formData.title}
                onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                required
                className="h-10 text-sm border-slate-200 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-100"
              />
            </Field>

            <Field>
              <FieldLabel htmlFor="edit-property-2" className="text-xs font-semibold text-slate-700 dark:text-slate-300">Tipo de Inmueble</FieldLabel>
              <select id="edit-property-2"
                value={formData.propertyType}
                onChange={(e) => setFormData({ ...formData, propertyType: e.target.value })}
                className="h-10 w-full rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 px-3 text-sm text-slate-800 dark:text-slate-100 outline-none focus:border-blue-500"
              >
                <option value="Lote">Lote / Terreno</option>
                <option value="Departamento">Departamento</option>
                <option value="Casa">Casa</option>
                <option value="Local">Local Comercial</option>
                <option value="Cochera">Cochera</option>
              </select>
            </Field>

            <Field>
              <FieldLabel htmlFor="edit-property-3" className="text-xs font-semibold text-slate-700 dark:text-slate-300">Operación</FieldLabel>
              <select id="edit-property-3"
                value={formData.operation}
                onChange={(e) => setFormData({ ...formData, operation: e.target.value as any })}
                className="h-10 w-full rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 px-3 text-sm text-slate-800 dark:text-slate-100 outline-none focus:border-blue-500"
              >
                <option value="sale">Venta</option>
                <option value="rent">Alquiler</option>
                <option value="temporal">Temporal</option>
                <option value="leasing">Leasing</option>
                <option value="unknown">Sin operación informada</option>
              </select>
            </Field>

            <Field>
              <FieldLabel htmlFor="edit-property-4" className="text-xs font-semibold text-slate-700 dark:text-slate-300">Moneda</FieldLabel>
              <select id="edit-property-4"
                value={formData.currency}
                onChange={(e) => setFormData({ ...formData, currency: e.target.value as any })}
                className="h-10 w-full rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 px-3 text-sm text-slate-800 dark:text-slate-100 outline-none focus:border-blue-500"
              >
                <option value="">Moneda sin confirmar</option>
                <option value="USD">Dólares (USD)</option>
                <option value="ARS">Pesos Argentinos (ARS)</option>
              </select>
            </Field>

            <Field>
              <FieldLabel htmlFor="edit-property-5" className="text-xs font-semibold text-slate-700 dark:text-slate-300">Precio</FieldLabel>
              <Input id="edit-property-5"
                type="number"
                step="any"
                value={formData.price}
                onChange={(e) => setFormData({ ...formData, price: e.target.value })}
                placeholder="0.00"
                className="h-10 text-sm border-slate-200 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-100"
              />
            </Field>

            <Field>
              <FieldLabel htmlFor="edit-property-6" className="text-xs font-semibold text-slate-700 dark:text-slate-300">Manzana / Sector</FieldLabel>
              <Input id="edit-property-6"
                value={formData.sectorName}
                onChange={(e) => setFormData({ ...formData, sectorName: e.target.value })}
                placeholder="Ej: AP7"
                className="h-10 text-sm border-slate-200 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-100"
              />
            </Field>

            <Field>
              <FieldLabel htmlFor="edit-property-7" className="text-xs font-semibold text-slate-700 dark:text-slate-300">Lote / Unidad</FieldLabel>
              <Input id="edit-property-7"
                value={formData.unitNumber}
                onChange={(e) => setFormData({ ...formData, unitNumber: e.target.value })}
                placeholder="Ej: Lote 12"
                className="h-10 text-sm border-slate-200 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-100"
              />
            </Field>

            <Field>
              <FieldLabel htmlFor="edit-property-8" className="text-xs font-semibold text-slate-700 dark:text-slate-300">Superficie (m²)</FieldLabel>
              <Input id="edit-property-8"
                type="number"
                step="any"
                value={formData.area_m2}
                onChange={(e) => setFormData({ ...formData, area_m2: e.target.value })}
                placeholder="Ej: 300"
                className="h-10 text-sm border-slate-200 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-100"
              />
            </Field>

            {(formData.propertyType === "Casa" || formData.propertyType === "Departamento") && <>
              {([
                ["rooms", "Ambientes", "1", "1"], ["bedrooms", "Dormitorios", "1", "1"],
                ["bathrooms", "Baños", "1", "1"], ["coveredAreaM2", "Superficie cubierta (m²)", "0.01", "0.01"],
                ["uncoveredAreaM2", "Superficie descubierta (m²)", "0", "0.01"],
                ["parkingSpaces", "Cocheras", "1", "1"], ["expenses", "Expensas", "0", "0.01"],
              ] as [keyof typeof formData, string, string, string][]).map(([key, label, min, step]) => (
                <Field key={key}>
                  <FieldLabel htmlFor={`edit-${key}`} className="text-xs font-semibold text-slate-700 dark:text-slate-300">{label}</FieldLabel>
                  <Input id={`edit-${key}`} type="number" min={min === "1" ? "0" : min} step={step} value={formData[key]}
                    onChange={event => setFormData({ ...formData, [key]: event.target.value })}
                    className="h-10 text-sm border-slate-200 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-100" />
                </Field>
              ))}
              {([['floor', 'Piso'], ['orientation', 'Orientación'], ['disposition', 'Disposición']] as [keyof typeof formData, string][]).map(([key, label]) => (
                <Field key={key}>
                  <FieldLabel htmlFor={`edit-${key}`} className="text-xs font-semibold text-slate-700 dark:text-slate-300">{label}</FieldLabel>
                  <Input id={`edit-${key}`} value={formData[key]} maxLength={key === 'floor' ? 40 : 80}
                    onChange={event => setFormData({ ...formData, [key]: event.target.value })}
                    className="h-10 text-sm border-slate-200 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-100" />
                </Field>
              ))}
              <Field>
                <FieldLabel htmlFor="edit-expenses-currency" className="text-xs font-semibold text-slate-700 dark:text-slate-300">Moneda de expensas</FieldLabel>
                <select id="edit-expenses-currency" value={formData.expensesCurrency}
                  onChange={event => setFormData({ ...formData, expensesCurrency: event.target.value })}
                  className="h-10 rounded-lg border border-slate-200 bg-white px-3 text-sm dark:border-slate-700 dark:bg-slate-950">
                  <option value="">Sin expensas informadas</option><option value="ARS">Pesos (ARS)</option><option value="USD">Dólares (USD)</option>
                </select>
              </Field>
              <PropertyFeaturesEditor value={features} onChange={setFeatures} disabled={isSaving} />
            </>}

            <Field>
              <FieldLabel htmlFor="edit-property-9" className="text-xs font-semibold text-slate-700 dark:text-slate-300">Estado</FieldLabel>
              <select id="edit-property-9"
                value={formData.status}
                onChange={(e) => setFormData({ ...formData, status: e.target.value as any })}
                className="h-10 w-full rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 px-3 text-sm text-slate-800 dark:text-slate-100 outline-none focus:border-blue-500"
              >
                <option value="available">Disponible</option>
                <option value="reserved">Reservado</option>
                <option value="not_sellable">No vendible</option>
                <option value="not_marketed">No comercializado</option>
                <option value="unknown">Sin estado informado</option>
                <option value="sold">Vendido</option><option value="rented">Alquilado</option>
              </select>
            </Field>

            <Field>
              <FieldLabel htmlFor="city" className="text-xs font-semibold text-slate-700 dark:text-slate-300">Ciudad / Localidad</FieldLabel>
              <select
                id="city"
                value={formData.city}
                onChange={(e) => setFormData({ ...formData, city: e.target.value })}
                className="h-10 w-full rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 px-3 text-sm text-slate-800 dark:text-slate-100 outline-none focus:border-blue-500"
              >
                <option value="">-- Seleccionar Ciudad --</option>
                {JUJUY_CITIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
                {formData.city && !JUJUY_CITIES.includes(formData.city as any) && (
                  <option value={formData.city}>{formData.city}</option>
                )}
              </select>
            </Field>

            <Field>
              <FieldLabel htmlFor="edit-property-11" className="text-xs font-semibold text-slate-700 dark:text-slate-300">Barrio / Ubicación</FieldLabel>
              <Input id="edit-property-11"
                value={formData.neighborhood}
                onChange={(e) => setFormData({ ...formData, neighborhood: e.target.value })}
                className="h-10 text-sm border-slate-200 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-100"
              />
            </Field>

            <Field className="md:col-span-2">
              <FieldLabel htmlFor="edit-property-12" className="text-xs font-semibold text-slate-700 dark:text-slate-300">Descripción</FieldLabel>
              <Textarea id="edit-property-12"
                rows={3}
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                placeholder="Detalles sobre el lote, entorno, servicios..."
                className="text-sm border-slate-200 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-100 rounded-lg"
              />
            </Field>
          </fieldset>
          {reviewing && <section aria-label="Confirmación completa">
            <h2>Revisar cambios</h2>
            <dl className="inventory-review">{Object.entries(formData).filter(([key]) =>
              (formData.propertyType === "Casa" || formData.propertyType === "Departamento") ||
              !["rooms", "bedrooms", "bathrooms", "coveredAreaM2", "uncoveredAreaM2", "floor", "orientation", "disposition", "parkingSpaces", "expenses", "expensesCurrency"].includes(key)
            ).map(([key, value]) => <div key={key}>
              <dt>{({title:"Título",price:"Precio",currency:"Moneda",operation:"Operación",propertyType:"Tipo",status:"Disponibilidad",sectorName:"Manzana o sector",unitNumber:"Unidad",area_m2:"Superficie total (m²)",rooms:"Ambientes",bedrooms:"Dormitorios",bathrooms:"Baños",coveredAreaM2:"Superficie cubierta (m²)",uncoveredAreaM2:"Superficie descubierta (m²)",floor:"Piso",orientation:"Orientación",disposition:"Disposición",parkingSpaces:"Cocheras",expenses:"Expensas",expensesCurrency:"Moneda de expensas",city:"Ciudad",neighborhood:"Barrio",description:"Descripción"} as Record<string,string>)[key]}</dt>
              <dd>{key === "currency" ? value || "Moneda sin confirmar" : key === "price" ? value ? Number(value).toLocaleString("es-AR") : "Precio a consultar" : key === "status" ? propertyStatusLabel(value as Property["status"]) : key === "operation" ? propertyOperationLabel(value as Property["operation"]) : value || "Sin informar"}</dd>
            </div>)}</dl>
            {(formData.propertyType === "Casa" || formData.propertyType === "Departamento") && <p className="my-3 text-sm font-medium">Características: {features.length}</p>}
            <Button type="button" variant="outline" disabled={isSaving} onClick={() => setReviewing(false)}>Volver a editar</Button>
          </section>}

          {error && <div ref={errorRef} tabIndex={-1} role="alert" aria-live="assertive" className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-xs font-semibold text-rose-700 dark:border-rose-900 dark:bg-rose-950 dark:text-rose-200">{error}</div>}
          <DialogFooter className="pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={isSaving}
              onClick={() => {
                if (hasChanges() && typeof window !== "undefined" && typeof window.confirm === "function" && !window.confirm("Hay cambios sin guardar en este activo. ¿Querés cancelar y descartarlos?")) return;
                onOpenChange(false);
              }}
              className="h-9 px-4 text-xs font-semibold dark:border-slate-800 dark:text-slate-300 dark:hover:bg-slate-800"
            >
              Cancelar
            </Button>
            <Button
              type="submit"
              size="sm"
              disabled={isSaving}
              className="h-9 px-5 text-xs font-semibold bg-blue-600 hover:bg-blue-700 text-white gap-1.5 shadow-xs"
            >
              <Save className="h-3.5 w-3.5" />
              {isSaving ? "Guardando..." : reviewing ? "Confirmar y guardar" : "Revisar cambios"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
