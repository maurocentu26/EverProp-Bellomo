"use client";

import Link from "next/link";
import { Store, CheckCircle2, Clock, Car, Building2, ChevronRight } from "lucide-react";
import { type Project, type Property } from "@/data/admin-sample";
import { cn } from "@/lib/utils";

type Props = {
  commercials: Property[];
  projects: Project[];
};

export default function CommercialHeatmapWidget({ commercials, projects }: Props) {
  const locales = commercials.filter((p) => p.propertyType === "Local");
  const cocheras = commercials.filter((p) => p.propertyType === "Cochera");
  const otrosComerciales = commercials.filter((p) => p.propertyType !== "Local" && p.propertyType !== "Cochera");

  return (
    <section className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
        <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
          <Store className="h-5 w-5 text-indigo-600" /> Heatmap Comercial (Locales y Cocheras)
        </h2>
        <span className="text-xs text-slate-500 font-medium">
          Pasá el cursor para ver el mini-tooltip y hacé clic para ver el detalle de la unidad.
        </span>
      </div>

      {/* Grid of Interactive Heatmap Units */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Locales Grid */}
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between mb-4 pb-3 border-b border-slate-100">
            <div className="flex items-center gap-2">
              <span className="p-2 rounded-lg bg-indigo-50 text-indigo-600">
                <Store className="h-4 w-4" />
              </span>
              <h3 className="text-base font-bold text-slate-900">Locales Comerciales</h3>
            </div>
            <span className="text-xs font-semibold text-slate-500 bg-slate-100 px-2.5 py-1 rounded-md">
              {locales.length} unidades
            </span>
          </div>

          <div className="flex flex-wrap gap-2.5 mb-4">
            {locales.length > 0 ? (
              locales.map((unit) => {
                const isAvailable = !unit.status || unit.status === "available";
                const isReserved = unit.status === "reserved";

                return (
                  <Link
                    key={unit.id}
                    href={`/admin/properties/${unit.id}`}
                    className="group relative cursor-pointer block"
                  >
                    <div
                      className={cn(
                        "h-10 w-10 rounded-xl border flex items-center justify-center text-xs font-black transition-all duration-200 hover:scale-115 hover:shadow-lg hover:z-30",
                        isAvailable
                          ? "bg-emerald-100 border-emerald-300 text-emerald-800 hover:bg-emerald-200"
                          : isReserved
                          ? "bg-amber-100 border-amber-300 text-amber-800 hover:bg-amber-200"
                          : "bg-rose-100 border-rose-300 text-rose-800 hover:bg-rose-200"
                      )}
                    >
                      {unit.unitNumber?.replace(/\D/g, "") || unit.title.slice(0, 3)}
                    </div>

                    {/* Mini Tooltip */}
                    <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-52 hidden group-hover:block z-50 pointer-events-none animate-in fade-in zoom-in-95 duration-150">
                      <div className="bg-slate-950 text-white text-xs p-3 rounded-xl shadow-2xl border border-slate-800">
                        <p className="font-bold text-sm text-indigo-300">{unit.unitNumber || unit.title}</p>
                        <p className="text-[10px] text-slate-400 mt-0.5">{unit.sectorName || "Planta Baja"}</p>
                        <div className="mt-2 pt-2 border-t border-slate-800 space-y-1">
                          <p className="flex justify-between">
                            <span className="text-slate-400">Precio:</span>
                            <strong className="text-white">
                              {unit.currency} {unit.price.toLocaleString("es-AR")}
                            </strong>
                          </p>
                          {unit.area_m2 && (
                            <p className="flex justify-between">
                              <span className="text-slate-400">Superficie:</span>
                              <strong className="text-slate-200">{unit.area_m2} m²</strong>
                            </p>
                          )}
                          <p className="flex justify-between items-center pt-0.5">
                            <span className="text-slate-400">Estado:</span>
                            <span
                              className={cn(
                                "px-1.5 py-0.5 rounded text-[9px] font-extrabold uppercase",
                                isAvailable
                                  ? "bg-emerald-950 text-emerald-400 border border-emerald-800"
                                  : isReserved
                                  ? "bg-amber-950 text-amber-400 border border-amber-800"
                                  : "bg-rose-950 text-rose-400 border border-rose-800"
                              )}
                            >
                              {isAvailable ? "Disponible" : isReserved ? "Reservado" : "Vendido"}
                            </span>
                          </p>
                        </div>
                      </div>
                      <div className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-slate-950" />
                    </div>
                  </Link>
                );
              })
            ) : (
              <p className="text-xs text-slate-400 italic">No hay locales cargados en el mapa.</p>
            )}
          </div>
        </div>

        {/* Cocheras Grid */}
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between mb-4 pb-3 border-b border-slate-100">
            <div className="flex items-center gap-2">
              <span className="p-2 rounded-lg bg-blue-50 text-blue-600">
                <Car className="h-4 w-4" />
              </span>
              <h3 className="text-base font-bold text-slate-900">Cocheras y Parkings</h3>
            </div>
            <span className="text-xs font-semibold text-slate-500 bg-slate-100 px-2.5 py-1 rounded-md">
              {cocheras.length} unidades
            </span>
          </div>

          <div className="flex flex-wrap gap-2.5 mb-4">
            {cocheras.length > 0 ? (
              cocheras.map((unit) => {
                const isAvailable = !unit.status || unit.status === "available";
                const isReserved = unit.status === "reserved";

                return (
                  <Link
                    key={unit.id}
                    href={`/admin/properties/${unit.id}`}
                    className="group relative cursor-pointer block"
                  >
                    <div
                      className={cn(
                        "h-10 w-10 rounded-xl border flex items-center justify-center text-xs font-black transition-all duration-200 hover:scale-115 hover:shadow-lg hover:z-30",
                        isAvailable
                          ? "bg-emerald-100 border-emerald-300 text-emerald-800 hover:bg-emerald-200"
                          : isReserved
                          ? "bg-amber-100 border-amber-300 text-amber-800 hover:bg-amber-200"
                          : "bg-rose-100 border-rose-300 text-rose-800 hover:bg-rose-200"
                      )}
                    >
                      {unit.unitNumber || unit.title.slice(0, 3)}
                    </div>

                    {/* Mini Tooltip */}
                    <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-52 hidden group-hover:block z-50 pointer-events-none animate-in fade-in zoom-in-95 duration-150">
                      <div className="bg-slate-950 text-white text-xs p-3 rounded-xl shadow-2xl border border-slate-800">
                        <p className="font-bold text-sm text-blue-300">{unit.unitNumber || unit.title}</p>
                        <p className="text-[10px] text-slate-400 mt-0.5">{unit.sectorName || "Subsuelo"}</p>
                        <div className="mt-2 pt-2 border-t border-slate-800 space-y-1">
                          <p className="flex justify-between">
                            <span className="text-slate-400">Precio:</span>
                            <strong className="text-white">
                              {unit.currency} {unit.price.toLocaleString("es-AR")}
                            </strong>
                          </p>
                          <p className="flex justify-between">
                            <span className="text-slate-400">Tipo:</span>
                            <strong className="text-slate-200">{unit.isCovered ? "Cubierta" : "Descubierta"}</strong>
                          </p>
                          <p className="flex justify-between items-center pt-0.5">
                            <span className="text-slate-400">Estado:</span>
                            <span
                              className={cn(
                                "px-1.5 py-0.5 rounded text-[9px] font-extrabold uppercase",
                                isAvailable
                                  ? "bg-emerald-950 text-emerald-400 border border-emerald-800"
                                  : isReserved
                                  ? "bg-amber-950 text-amber-400 border border-amber-800"
                                  : "bg-rose-950 text-rose-400 border border-rose-800"
                              )}
                            >
                              {isAvailable ? "Disponible" : isReserved ? "Reservado" : "Vendido"}
                            </span>
                          </p>
                        </div>
                      </div>
                      <div className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-slate-950" />
                    </div>
                  </Link>
                );
              })
            ) : (
              <p className="text-xs text-slate-400 italic">No hay cocheras cargadas en el mapa.</p>
            )}
          </div>
        </div>
      </div>

      {/* Commercial Table with Clickable Rows */}
      <div className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden mt-4">
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="bg-slate-50 text-xs uppercase font-bold text-slate-500 border-b border-slate-200">
              <tr>
                <th className="px-4 py-3">Unidad / Tipo</th>
                <th className="px-4 py-3">Proyecto / Sector</th>
                <th className="px-4 py-3">Precio</th>
                <th className="px-4 py-3">Características</th>
                <th className="px-4 py-3">Estado</th>
                <th className="px-4 py-3 text-right">Acción</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {commercials.length > 0 ? (
                commercials.slice(0, 6).map((unit) => (
                  <tr key={unit.id} className="hover:bg-blue-50/50 transition-colors group cursor-pointer">
                    <td className="px-4 py-3">
                      <Link href={`/admin/properties/${unit.id}`} className="block">
                        <p className="font-bold text-slate-900 group-hover:text-blue-600 transition-colors">
                          {unit.unitNumber || unit.title}
                        </p>
                        <p className="text-[10px] text-slate-500 uppercase">{unit.propertyType}</p>
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-slate-600">
                      <Link href={`/admin/properties/${unit.id}`} className="block">
                        {projects.find((p) => p.id === unit.projectId)?.name || "Sin Proyecto"}
                        <br />
                        <span className="text-xs text-slate-400">{unit.sectorName}</span>
                      </Link>
                    </td>
                    <td className="px-4 py-3 font-semibold text-slate-700">
                      <Link href={`/admin/properties/${unit.id}`} className="block">
                        {unit.currency} {unit.price.toLocaleString("es-AR")}
                      </Link>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex gap-2 text-xs">
                        {unit.isCovered && <span className="bg-slate-100 px-2 py-0.5 rounded text-slate-600">Cubierta</span>}
                        {unit.commercialFeatures?.showcaseLength && (
                          <span className="bg-slate-100 px-2 py-0.5 rounded text-slate-600">Vidriera: {unit.commercialFeatures.showcaseLength}m</span>
                        )}
                        {unit.commercialFeatures?.hasBathroom && <span className="bg-slate-100 px-2 py-0.5 rounded text-slate-600">Baño</span>}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={cn(
                          "inline-flex items-center gap-1 px-2 py-1 rounded-md text-[10px] font-black uppercase tracking-wider",
                          !unit.status || unit.status === "available"
                            ? "bg-emerald-100 text-emerald-700"
                            : unit.status === "reserved"
                            ? "bg-amber-100 text-amber-700"
                            : "bg-rose-100 text-rose-700"
                        )}
                      >
                        {!unit.status || unit.status === "available" ? <CheckCircle2 className="h-3 w-3" /> : <Clock className="h-3 w-3" />}
                        {!unit.status || unit.status === "available" ? "Disponible" : unit.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Link href={`/admin/properties/${unit.id}`} className="inline-flex items-center gap-1 text-xs font-bold text-blue-600 hover:text-blue-700">
                        Ver ficha <ChevronRight className="h-3.5 w-3.5" />
                      </Link>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-slate-500 text-sm italic">
                    No hay activos comerciales registrados.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        {commercials.length > 6 && (
          <div className="p-4 border-t border-slate-100 bg-slate-50 flex justify-center">
            <Link
              href="/admin/properties"
              className="px-6 py-2 text-sm font-semibold text-slate-700 bg-white border border-slate-200 hover:bg-slate-100 rounded-lg transition-colors shadow-sm"
            >
              Ver todas las unidades comerciales ({commercials.length})
            </Link>
          </div>
        )}
      </div>
    </section>
  );
}
