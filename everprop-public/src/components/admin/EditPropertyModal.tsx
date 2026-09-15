"use client";

import { useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Field, FieldLabel } from "@/components/ui/field";
import { toast } from "sonner";
import { Building2, Save } from "lucide-react";
import { type Property, JUJUY_CITIES } from "@/data/admin-sample";
import { isMockDataMode } from "@/lib/data-mode";
import { updateEverpropProperty } from "@/lib/everprop-api";

interface EditPropertyModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  property: Property;
  onSuccess: (updated: Property) => void;
}

export function EditPropertyModal({
  open,
  onOpenChange,
  property,
  onSuccess,
}: EditPropertyModalProps) {
  const [isSaving, setIsSaving] = useState(false);
  const [formData, setFormData] = useState({
    title: property.title,
    price: property.priceKnown === false ? "" : property.price != null ? String(property.price) : "",
    currency: property.currency || "USD",
    operation: property.operation || "sale",
    propertyType: property.propertyType || "Lote",
    status: property.status || "available",
    sectorName: property.sectorName || "",
    unitNumber: property.unitNumber || "",
    area_m2: property.area_m2 ? String(property.area_m2) : "",
    city: property.city || "",
    neighborhood: property.neighborhood || "",
    description: property.description || "",
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSaving) return;
    if (!formData.title.trim() || (formData.price.trim() && (!Number.isFinite(Number(formData.price)) || Number(formData.price) < 0))) {
      toast.error("Ingresá un título y un precio válido, mayor o igual a cero."); return;
    }
    if (formData.area_m2 && (!Number.isFinite(Number(formData.area_m2)) || Number(formData.area_m2) <= 0)) {
      toast.error("La superficie debe ser mayor que cero."); return;
    }
    setIsSaving(true);
    try {
      let updatedData: Property = {
        ...property,
        title: formData.title.trim(),
        price: formData.price ? Number(formData.price) : 0,
        currency: formData.currency as "USD" | "ARS",
        operation: formData.operation as Property['operation'],
        propertyType: formData.propertyType,
        status: formData.status as Property['status'],
        sectorName: formData.sectorName.trim() || undefined,
        unitNumber: formData.unitNumber.trim() || undefined,
        area_m2: formData.area_m2 ? Number(formData.area_m2) : undefined,
        city: formData.city.trim() || property.city || "Sin ciudad",
        neighborhood: formData.neighborhood.trim() || property.neighborhood || "",
        description: formData.description.trim() || undefined,
      };

      if (!isMockDataMode) {
        const persisted = await updateEverpropProperty(property.id, {
          version: property.version,
          title: updatedData.title,
          ...(formData.price.trim() ? { price: updatedData.price, currency: updatedData.currency } : {}),
          operation: updatedData.operation,
          propertyType: updatedData.propertyType,
          status: updatedData.status,
          sectorName: updatedData.sectorName ?? null,
          unitNumber: updatedData.unitNumber ?? null,
          area_m2: updatedData.area_m2 ?? null,
          city: updatedData.city,
          neighborhood: updatedData.neighborhood,
          description: updatedData.description ?? null,
        });
        updatedData = { ...updatedData, ...persisted };
      }

      toast.success("Propiedad actualizada correctamente");
      onSuccess(updatedData);
      onOpenChange(false);
    } catch (err: any) {
      toast.error("Error al actualizar la propiedad: " + (err.message || "Error desconocido"));
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!isSaving) onOpenChange(next); }}>
      <DialogContent className="admin-workspace w-[calc(100%-2rem)] sm:max-w-2xl max-h-[calc(100dvh-2rem)] overflow-y-auto p-6 bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 rounded-2xl shadow-xl">
        <form onSubmit={handleSubmit} className="space-y-5">
          <DialogHeader className="pb-3 pr-6 border-b border-slate-100 dark:border-slate-800">
            <div className="flex items-center gap-2.5">
              <div className="hidden sm:flex h-9 w-9 shrink-0 rounded-xl bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400 items-center justify-center">
                <Building2 className="h-5 w-5" />
              </div>
              <div>
                <DialogTitle className="text-xl font-bold text-slate-900 dark:text-slate-100">Editar Propiedad / Activo</DialogTitle>
                <DialogDescription className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  Actualizá la información de esta propiedad.
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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
          </div>

          <DialogFooter className="pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={isSaving}
              onClick={() => onOpenChange(false)}
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
              {isSaving ? "Guardando..." : "Guardar Cambios"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
