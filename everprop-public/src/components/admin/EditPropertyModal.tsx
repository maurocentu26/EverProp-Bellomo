"use client";

import { useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Field, FieldLabel } from "@/components/ui/field";
import { toast } from "sonner";
import { Building2, Save } from "lucide-react";
import type { Property } from "@/data/admin-sample";
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
    price: property.price ? String(property.price) : "",
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
    setIsSaving(true);
    try {
      const updatedData = {
        ...property,
        title: formData.title.trim(),
        price: formData.price ? Number(formData.price) : 0,
        currency: formData.currency as "USD" | "ARS",
        operation: formData.operation as "sale" | "rent" | "temporal",
        propertyType: formData.propertyType,
        status: formData.status as "available" | "reserved" | "sold",
        sectorName: formData.sectorName.trim() || undefined,
        unitNumber: formData.unitNumber.trim() || undefined,
        area_m2: formData.area_m2 ? Number(formData.area_m2) : undefined,
        city: formData.city.trim() || property.city || "Sin ciudad",
        neighborhood: formData.neighborhood.trim() || property.neighborhood || "",
        description: formData.description.trim() || undefined,
      };

      if (!isMockDataMode) {
        const updatedFromApi = await updateEverpropProperty(property.id, {
          title: updatedData.title,
          price: updatedData.price,
          currency: updatedData.currency,
          operation: updatedData.operation,
          propertyType: updatedData.propertyType,
          status: updatedData.status,
          sectorName: updatedData.sectorName,
          unitNumber: updatedData.unitNumber,
          area_m2: updatedData.area_m2,
          city: updatedData.city,
          neighborhood: updatedData.neighborhood,
          description: updatedData.description,
          version: property.version,
        });
        toast.success("Propiedad actualizada correctamente");
        onSuccess(updatedFromApi);
        onOpenChange(false);
        return;
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
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto p-6 bg-white rounded-2xl shadow-xl">
        <form onSubmit={handleSubmit} className="space-y-5">
          <DialogHeader className="pb-3 border-b border-slate-100">
            <div className="flex items-center gap-2.5">
              <div className="h-9 w-9 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center">
                <Building2 className="h-5 w-5" />
              </div>
              <div>
                <DialogTitle className="text-xl font-bold text-slate-900">Editar Propiedad / Activo</DialogTitle>
                <DialogDescription className="text-xs text-slate-500 mt-0.5">
                  Modificá los datos del activo. Los cambios impactarán directamente en la base de datos.
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Field className="md:col-span-2">
              <FieldLabel className="text-xs font-semibold text-slate-700">Título del Inmueble</FieldLabel>
              <Input
                value={formData.title}
                onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                required
                className="h-10 text-sm border-slate-200"
              />
            </Field>

            <Field>
              <FieldLabel className="text-xs font-semibold text-slate-700">Tipo de Inmueble</FieldLabel>
              <select
                value={formData.propertyType}
                onChange={(e) => setFormData({ ...formData, propertyType: e.target.value })}
                className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-800 outline-none focus:border-blue-500"
              >
                <option value="Lote">Lote / Terreno</option>
                <option value="Departamento">Departamento</option>
                <option value="Casa">Casa</option>
                <option value="Local">Local Comercial</option>
                <option value="Cochera">Cochera</option>
              </select>
            </Field>

            <Field>
              <FieldLabel className="text-xs font-semibold text-slate-700">Operación</FieldLabel>
              <select
                value={formData.operation}
                onChange={(e) => setFormData({ ...formData, operation: e.target.value as any })}
                className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-800 outline-none focus:border-blue-500"
              >
                <option value="sale">Venta</option>
                <option value="rent">Alquiler</option>
                <option value="temporal">Temporal</option>
              </select>
            </Field>

            <Field>
              <FieldLabel className="text-xs font-semibold text-slate-700">Moneda</FieldLabel>
              <select
                value={formData.currency}
                onChange={(e) => setFormData({ ...formData, currency: e.target.value as any })}
                className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-800 outline-none focus:border-blue-500"
              >
                <option value="USD">Dólares (USD)</option>
                <option value="ARS">Pesos Argentinos (ARS)</option>
              </select>
            </Field>

            <Field>
              <FieldLabel className="text-xs font-semibold text-slate-700">Precio</FieldLabel>
              <Input
                type="number"
                step="any"
                value={formData.price}
                onChange={(e) => setFormData({ ...formData, price: e.target.value })}
                placeholder="0.00"
                className="h-10 text-sm border-slate-200"
              />
            </Field>

            <Field>
              <FieldLabel className="text-xs font-semibold text-slate-700">Manzana / Sector</FieldLabel>
              <Input
                value={formData.sectorName}
                onChange={(e) => setFormData({ ...formData, sectorName: e.target.value })}
                placeholder="Ej: AP7"
                className="h-10 text-sm border-slate-200"
              />
            </Field>

            <Field>
              <FieldLabel className="text-xs font-semibold text-slate-700">Lote / Unidad</FieldLabel>
              <Input
                value={formData.unitNumber}
                onChange={(e) => setFormData({ ...formData, unitNumber: e.target.value })}
                placeholder="Ej: Lote 12"
                className="h-10 text-sm border-slate-200"
              />
            </Field>

            <Field>
              <FieldLabel className="text-xs font-semibold text-slate-700">Superficie (m²)</FieldLabel>
              <Input
                type="number"
                step="any"
                value={formData.area_m2}
                onChange={(e) => setFormData({ ...formData, area_m2: e.target.value })}
                placeholder="Ej: 300"
                className="h-10 text-sm border-slate-200"
              />
            </Field>

            <Field>
              <FieldLabel className="text-xs font-semibold text-slate-700">Estado</FieldLabel>
              <select
                value={formData.status}
                onChange={(e) => setFormData({ ...formData, status: e.target.value as any })}
                className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-800 outline-none focus:border-blue-500"
              >
                <option value="available">Disponible</option>
                <option value="reserved">Reservado</option>
                <option value="sold">Vendido</option>
              </select>
            </Field>

            <Field>
              <FieldLabel className="text-xs font-semibold text-slate-700">Ciudad</FieldLabel>
              <Input
                value={formData.city}
                onChange={(e) => setFormData({ ...formData, city: e.target.value })}
                className="h-10 text-sm border-slate-200"
              />
            </Field>

            <Field>
              <FieldLabel className="text-xs font-semibold text-slate-700">Barrio / Ubicación</FieldLabel>
              <Input
                value={formData.neighborhood}
                onChange={(e) => setFormData({ ...formData, neighborhood: e.target.value })}
                className="h-10 text-sm border-slate-200"
              />
            </Field>

            <Field className="md:col-span-2">
              <FieldLabel className="text-xs font-semibold text-slate-700">Descripción</FieldLabel>
              <Textarea
                rows={3}
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                placeholder="Detalles sobre el lote, entorno, servicios..."
                className="text-sm border-slate-200 rounded-lg"
              />
            </Field>
          </div>

          <DialogFooter className="pt-3 border-t border-slate-100 flex items-center justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => onOpenChange(false)}
              className="h-9 px-4 text-xs font-semibold"
            >
              Cancelar
            </Button>
            <Button
              type="submit"
              size="sm"
              disabled={isSaving}
              className="h-9 px-5 text-xs font-semibold bg-blue-600 hover:bg-blue-700 text-white gap-1.5"
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
