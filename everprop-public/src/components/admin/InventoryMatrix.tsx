"use client";

import { useState } from "react";
import { type Property } from "@/data/admin-sample";
import { cn } from "@/lib/utils";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import Badge from "@/components/ui/badge";
import { useCurrentSession } from "@/hooks/use-current-session";
import { MapPin, Maximize, DollarSign, UserPlus, Info, X } from "lucide-react";
import Link from "next/link";

type InventoryMatrixProps = {
  properties: Property[];
  isLoading?: boolean;
};

export default function InventoryMatrix({ properties, isLoading }: InventoryMatrixProps) {
  const { isEngineer } = useCurrentSession();
  const [selectedUnit, setSelectedUnit] = useState<Property | null>(null);

  // Group properties by sectorName
  const grouped = properties.reduce((acc, curr) => {
    const sector = curr.sectorName || "General";
    if (!acc[sector]) acc[sector] = [];
    acc[sector].push(curr);
    return acc;
  }, {} as Record<string, Property[]>);

  if (isLoading) {
    return (
      <div className="space-y-6">
        {[1, 2].map(s => (
          <div key={s}>
            <div className="h-4 w-32 bg-slate-200 rounded animate-pulse mb-3" />
            <div className="flex flex-wrap gap-2">
              {[...Array(12)].map((_, i) => (
                <div key={i} className="h-10 w-10 bg-slate-100 rounded-md animate-pulse" />
              ))}
            </div>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div>
      <div className="space-y-8">
        {Object.entries(grouped).map(([sector, units]) => {
          const isSoldOut = units.length > 0 && units.every(u => u.status === "sold");
          
          return (
            <div key={sector}>
              <div className="flex items-center gap-3 mb-3">
                <h3 className="text-sm font-bold text-slate-700">{sector}</h3>
                {isSoldOut && (
                  <span className="px-2 py-0.5 text-[10px] uppercase font-bold tracking-wider bg-slate-100 text-slate-500 rounded-md border border-slate-200">
                    Sold Out
                  </span>
                )}
              </div>
              <div className="flex flex-wrap gap-2">
                {units.map((unit) => {
                  const isAvailable = !unit.status || unit.status === "available";
                  const isReserved = unit.status === "reserved";

                return (
                  <button
                    key={unit.id}
                    onClick={() => setSelectedUnit(unit)}
                    className={cn(
                      "h-10 w-10 rounded-md border flex items-center justify-center text-xs font-bold transition-all hover:scale-110 hover:shadow-md",
                      isAvailable ? "bg-emerald-100 border-emerald-200 text-emerald-700 hover:bg-emerald-200 hover:border-emerald-300" :
                      isReserved ? "bg-amber-100 border-amber-200 text-amber-700 hover:bg-amber-200 hover:border-amber-300" :
                      "bg-rose-100 border-rose-200 text-rose-700 hover:bg-rose-200 hover:border-rose-300"
                    )}
                    title={unit.title}
                  >
                    {unit.unitNumber?.replace(/\D/g, "") || unit.title.slice(0, 2)}
                  </button>
                );
              })}
            </div>
            </div>
          );
        })}

        {properties.length === 0 && (
          <div className="text-center py-10 bg-slate-50 rounded-2xl border border-dashed border-slate-200 text-slate-500">
            No hay unidades registradas para este proyecto.
          </div>
        )}
      </div>

      {/* Leyenda */}
      <div className="flex gap-4 pt-6 mt-6 border-t border-slate-100 text-xs font-semibold text-slate-600">
        <div className="flex items-center gap-2">
          <div className="h-4 w-4 rounded-md bg-emerald-100 border border-emerald-200" /> 
          Disponible
        </div>
        <div className="flex items-center gap-2">
          <div className="h-4 w-4 rounded-md bg-amber-100 border border-amber-200" /> 
          Reservado
        </div>
        <div className="flex items-center gap-2">
          <div className="h-4 w-4 rounded-md bg-rose-100 border border-rose-200" /> 
          Vendido
        </div>
      </div>

      {/* Ficha de unidad en pantalla completa */}
      <Sheet open={!!selectedUnit} onOpenChange={(open) => !open && setSelectedUnit(null)}>
        <SheetContent
          side="right"
          showCloseButton={false}
          className="inset-0 h-dvh !w-screen !max-w-none gap-0 overflow-hidden border-0 bg-slate-50 p-0 shadow-none data-[side=right]:!left-0 data-[side=right]:!right-0 data-[side=right]:!w-screen data-[side=right]:sm:!max-w-none motion-reduce:transition-none"
        >
          {selectedUnit && (
            <div className="flex h-dvh min-h-0 w-full flex-col">
              <SheetHeader className="shrink-0 border-b border-slate-200 bg-white px-4 pb-5 pt-[max(1rem,env(safe-area-inset-top))] text-left sm:px-8 lg:px-12">
                <div className="mx-auto flex w-full max-w-[min(94vw,2800px)] items-start justify-between gap-5">
                  <div className="min-w-0">
                    <SheetTitle className="text-2xl font-bold tracking-tight text-slate-950 sm:text-3xl lg:text-4xl">{selectedUnit.title}</SheetTitle>
                    <SheetDescription className="mt-2 flex items-center gap-2 text-base text-slate-600 sm:text-lg">
                      <MapPin className="h-5 w-5 shrink-0" aria-hidden="true" /> {selectedUnit.neighborhood}, {selectedUnit.city}
                    </SheetDescription>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setSelectedUnit(null)}
                    className="h-12 shrink-0 gap-2 px-4 text-base font-semibold sm:h-14 sm:px-5"
                  >
                    <X className="h-5 w-5" aria-hidden="true" />
                    <span className="hidden sm:inline">Cerrar</span>
                  </Button>
                </div>
              </SheetHeader>

              <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-6 sm:px-8 sm:py-8 lg:px-12 lg:py-10">
                <div className="mx-auto grid min-h-full w-full max-w-[min(94vw,2800px)] content-center gap-6 lg:grid-cols-[minmax(0,1.15fr)_minmax(22rem,0.85fr)] xl:gap-8">
                  <section className="space-y-6 rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-7 lg:p-9" aria-labelledby="unit-summary-title">
                    <div className="flex flex-col gap-4 border-b border-slate-200 pb-6 sm:flex-row sm:items-center sm:justify-between">
                      <div>
                        <p id="unit-summary-title" className="text-base font-semibold text-slate-500">Precio publicado</p>
                        <p className="mt-2 flex items-center gap-2 text-2xl sm:text-3xl font-bold tracking-tight text-slate-950">
                          {selectedUnit.currency === "ARS"
                            ? `$ ${selectedUnit.price.toLocaleString("es-AR")} ARS`
                            : `USD ${selectedUnit.price.toLocaleString("es-AR")}`}
                        </p>
                      </div>
                      <Badge className={cn(
                        "w-fit px-4 py-2 text-sm font-bold uppercase tracking-wider",
                        (!selectedUnit.status || selectedUnit.status === "available") ? "border-emerald-200 bg-emerald-100 text-emerald-700" :
                        selectedUnit.status === "reserved" ? "border-amber-200 bg-amber-100 text-amber-700" :
                        "border-rose-200 bg-rose-100 text-rose-700"
                      )}>
                        {(!selectedUnit.status || selectedUnit.status === "available") ? "Disponible" : selectedUnit.status === "reserved" ? "Reservado" : "Vendido"}
                      </Badge>
                    </div>

                    <dl className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                      <div className="rounded-2xl bg-slate-50 p-5">
                        <dt className="text-base font-medium text-slate-500">Tipo</dt>
                        <dd className="mt-2 text-xl font-bold text-slate-900">{selectedUnit.propertyType}</dd>
                      </div>
                      <div className="rounded-2xl bg-slate-50 p-5">
                        <dt className="text-base font-medium text-slate-500">Sector / Piso</dt>
                        <dd className="mt-2 text-xl font-bold text-slate-900">{selectedUnit.sectorName || "-"}</dd>
                      </div>
                      {selectedUnit.area_m2 && (
                        <div className="rounded-2xl bg-slate-50 p-5">
                          <dt className="flex items-center gap-2 text-base font-medium text-slate-500"><Maximize className="h-5 w-5" aria-hidden="true" /> Superficie total</dt>
                          <dd className="mt-2 text-xl font-bold text-slate-900">{selectedUnit.area_m2} m²</dd>
                        </div>
                      )}
                    </dl>

                    {selectedUnit.services && (
                      <div className="rounded-2xl border border-slate-200 p-5 sm:p-6">
                        <h3 className="flex items-center gap-2 text-xl font-bold text-slate-900">
                          <Info className="h-6 w-6 text-blue-600" aria-hidden="true" /> Servicios disponibles
                        </h3>
                        <div className="mt-4 flex flex-wrap gap-3">
                          {selectedUnit.services.electricity && <Badge className="bg-slate-100 px-3 py-2 text-base text-slate-700">Luz eléctrica</Badge>}
                          {selectedUnit.services.water && <Badge className="bg-slate-100 px-3 py-2 text-base text-slate-700">Agua potable</Badge>}
                          {selectedUnit.services.gas && <Badge className="bg-slate-100 px-3 py-2 text-base text-slate-700">Gas natural</Badge>}
                          {selectedUnit.services.sewage && <Badge className="bg-slate-100 px-3 py-2 text-base text-slate-700">Cloacas</Badge>}
                        </div>
                      </div>
                    )}
                  </section>

                  <aside className="flex flex-col justify-between gap-6 rounded-3xl bg-slate-950 p-5 text-white shadow-xl sm:p-7 lg:p-9" aria-labelledby="unit-actions-title">
                    <div>
                      <p className="text-base font-bold uppercase tracking-[0.12em] text-blue-300">Unidad seleccionada</p>
                      <h3 id="unit-actions-title" className="mt-3 text-2xl font-bold sm:text-3xl">¿Qué querés hacer?</h3>
                      <p className="mt-2 text-xs leading-5 text-slate-300">
                        Consultá la información detallada y operaciones de esta unidad.
                      </p>
                    </div>

                    <div className="flex flex-col gap-2">
                      <Link href={`/admin/properties/${selectedUnit.id}`} className="w-full">
                        <Button className="h-10 w-full rounded-xl bg-blue-600 text-xs font-semibold text-white hover:bg-blue-700">
                          Ver ficha completa
                        </Button>
                      </Link>
                    </div>
                  </aside>
                </div>
              </div>
            </div>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}
