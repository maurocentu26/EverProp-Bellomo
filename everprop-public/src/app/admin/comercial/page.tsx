"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { Store, Car, CheckCircle2, Clock, Plus } from "lucide-react";
import { type Property, properties as sampleProperties } from "@/data/admin-sample";
import { loadPropertyList } from "@/lib/admin-storage";
import { isMockDataMode } from "@/lib/data-mode";
import { loadEverpropCatalog } from "@/lib/everprop-api";
import { deferEffectUpdate } from "@/lib/deferred-effect";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

export default function CommercialAssetsPage() {
  const [properties, setProperties] = useState<Property[]>([]);
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    let active = true;
    async function loadData() {
      if (!isMockDataMode) {
        try {
          const cat = await loadEverpropCatalog();
          if (!active) return;
          setProperties(cat.properties);
          setIsLoaded(true);
          return;
        } catch (e) {
          console.error("Error loading commercial properties:", e);
        }
      }
      if (!active) return;
      setProperties(loadPropertyList(sampleProperties, "c1"));
      setIsLoaded(true);
    }
    void loadData();
    return () => {
      active = false;
    };
  }, []);

  if (!isLoaded) {
    return (
      <div className="animate-pulse space-y-8">
        <div className="h-10 w-64 bg-slate-200 rounded"></div>
        <div className="h-96 bg-slate-100 rounded-3xl"></div>
      </div>
    );
  }

  const locals = properties.filter(p => p.propertyType === "Local");
  const garages = properties.filter(p => p.propertyType === "Cochera");

  return (
    <div className="space-y-8">
      <header className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-slate-900 flex items-center gap-2">
            <Store className="h-7 w-7 sm:h-8 sm:w-8 text-indigo-600" /> 
            Activos Comerciales
          </h1>
          <p className="text-slate-500 text-sm mt-1">Heatmap de Locales y Cocheras, rentabilidad y ocupación.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Link href="/admin/properties/new?category=comercial&type=Local">
            <Button size="sm" className="h-9 px-3.5 text-xs font-semibold bg-indigo-600 hover:bg-indigo-700 text-white gap-1.5 shadow-sm">
              <Plus className="h-3.5 w-3.5" /> + Nuevo Local Comercial
            </Button>
          </Link>
          <Link href="/admin/properties/new?category=comercial&type=Cochera">
            <Button size="sm" variant="outline" className="h-9 px-3.5 text-xs font-semibold border-slate-300 text-slate-700 hover:bg-slate-50 gap-1.5">
              <Car className="h-3.5 w-3.5 text-amber-600" /> + Nueva Cochera
            </Button>
          </Link>
        </div>
      </header>

      {/* Seccion: Locales */}
      <section className="bg-white border border-slate-200 rounded-3xl overflow-hidden shadow-sm">
        <div className="p-4 sm:p-6 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
          <div className="flex items-center gap-2">
            <Store className="h-5 w-5 text-indigo-500" />
            <h2 className="text-base sm:text-lg font-bold text-slate-800">Locales Comerciales</h2>
            <span className="ml-2 bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded-full text-xs font-bold">{locals.length}</span>
          </div>
          <Link href="/admin/properties/new?category=comercial&type=Local">
            <Button size="sm" variant="outline" className="h-8 px-3 text-xs font-semibold border-indigo-200 text-indigo-700 hover:bg-indigo-50 gap-1">
              <Plus className="h-3 w-3" /> + Nuevo Local
            </Button>
          </Link>
        </div>
        
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left whitespace-nowrap">
            <thead className="bg-slate-50/80 text-xs uppercase font-bold text-slate-500 border-b border-slate-100">
              <tr>
                <th className="px-6 py-4">ID / Ubicación</th>
                <th className="px-6 py-4">Dimensiones</th>
                <th className="px-6 py-4">Renta Mensual</th>
                <th className="px-6 py-4">Características</th>
                <th className="px-6 py-4 text-right">Estado</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {locals.length > 0 ? locals.map(local => {
                const isAvailable = !local.status || local.status === 'available';
                return (
                  <tr key={local.id} className="hover:bg-slate-50 transition-colors">
                    <td className="px-6 py-4">
                      <p className="font-bold text-slate-900">{local.unitNumber || local.title}</p>
                      <p className="text-xs text-slate-500">{local.sectorName || "Planta Baja"}</p>
                    </td>
                    <td className="px-6 py-4">
                      <span className="font-medium text-slate-700">{local.area_m2} m²</span>
                    </td>
                    <td className="px-6 py-4">
                      <span className="font-bold text-slate-900">{local.currency} {local.price.toLocaleString('es-AR')}</span>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex flex-wrap gap-2 text-xs">
                        {local.commercialFeatures?.showcaseLength && <span className="bg-slate-100 px-2 py-1 rounded-md text-slate-600 font-medium border border-slate-200">Vidriera: {local.commercialFeatures.showcaseLength}m</span>}
                        {local.commercialFeatures?.hasBathroom && <span className="bg-slate-100 px-2 py-1 rounded-md text-slate-600 font-medium border border-slate-200">Baño</span>}
                        {local.commercialFeatures?.mezzanine && <span className="bg-slate-100 px-2 py-1 rounded-md text-slate-600 font-medium border border-slate-200">Entrepiso</span>}
                      </div>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <span className={cn(
                        "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-black uppercase tracking-wider border",
                        isAvailable ? "bg-emerald-50 text-emerald-700 border-emerald-200" :
                        local.status === 'reserved' ? "bg-amber-50 text-amber-700 border-amber-200" : "bg-blue-50 text-blue-700 border-blue-200"
                      )}>
                        {isAvailable ? <CheckCircle2 className="h-4 w-4" /> : <Clock className="h-4 w-4" />}
                        {isAvailable ? 'Disponible' : local.status === 'sold' ? 'Alquilado' : 'Reservado'}
                      </span>
                    </td>
                  </tr>
                );
              }) : (
                <tr><td colSpan={5} className="px-6 py-10 text-center text-slate-500">No hay locales registrados.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* Seccion: Cocheras */}
      <section className="bg-white border border-slate-200 rounded-3xl overflow-hidden shadow-sm">
        <div className="p-4 sm:p-6 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
          <div className="flex items-center gap-2">
            <Car className="h-5 w-5 text-slate-600" />
            <h2 className="text-base sm:text-lg font-bold text-slate-800">Cocheras</h2>
            <span className="ml-2 bg-slate-100 text-slate-700 px-2 py-0.5 rounded-full text-xs font-bold">{garages.length}</span>
          </div>
          <Link href="/admin/properties/new?category=comercial&type=Cochera">
            <Button size="sm" variant="outline" className="h-8 px-3 text-xs font-semibold border-amber-200 text-amber-700 hover:bg-amber-50 gap-1">
              <Plus className="h-3 w-3" /> + Nueva Cochera
            </Button>
          </Link>
        </div>
        
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left whitespace-nowrap">
            <thead className="bg-slate-50/80 text-xs uppercase font-bold text-slate-500 border-b border-slate-100">
              <tr>
                <th className="px-6 py-4">Unidad</th>
                <th className="px-6 py-4">Nivel / Sector</th>
                <th className="px-6 py-4">Valor Mensual</th>
                <th className="px-6 py-4">Tipo</th>
                <th className="px-6 py-4 text-right">Estado</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {garages.length > 0 ? garages.map(garage => {
                const isAvailable = !garage.status || garage.status === 'available';
                return (
                  <tr key={garage.id} className="hover:bg-slate-50 transition-colors">
                    <td className="px-6 py-4">
                      <p className="font-bold text-slate-900">{garage.unitNumber || garage.title}</p>
                    </td>
                    <td className="px-6 py-4 text-slate-500 font-medium">
                      {garage.sectorName || "-"}
                    </td>
                    <td className="px-6 py-4">
                      <span className="font-bold text-slate-900">{garage.currency} {garage.price.toLocaleString('es-AR')}</span>
                    </td>
                    <td className="px-6 py-4">
                      {garage.isCovered ? (
                        <span className="text-xs font-bold text-slate-600 bg-slate-100 px-2 py-1 rounded-md border border-slate-200">Cubierta</span>
                      ) : (
                        <span className="text-xs font-bold text-slate-500 bg-slate-50 px-2 py-1 rounded-md border border-slate-200">Descubierta</span>
                      )}
                    </td>
                    <td className="px-6 py-4 text-right">
                      <span className={cn(
                        "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-black uppercase tracking-wider border",
                        isAvailable ? "bg-emerald-50 text-emerald-700 border-emerald-200" :
                        garage.status === 'reserved' ? "bg-amber-50 text-amber-700 border-amber-200" : "bg-blue-50 text-blue-700 border-blue-200"
                      )}>
                        {isAvailable ? 'Disponible' : garage.status === 'sold' ? 'Alquilada' : 'Reservada'}
                      </span>
                    </td>
                  </tr>
                );
              }) : (
                <tr><td colSpan={5} className="px-6 py-10 text-center text-slate-500">No hay cocheras registradas.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
