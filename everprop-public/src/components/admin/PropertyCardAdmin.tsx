"use client";

import { Building2, MapPin, BedDouble, Bath, Ruler, MoreVertical, Edit3, Eye, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import Badge from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import type { Property } from "@/data/admin-sample";
import Link from "next/link";

interface Props {
  property: Property;
}

export default function PropertyCardAdmin({ property }: Props) {
  return (
    <div className="group relative flex flex-col rounded-3xl border border-slate-200 bg-white overflow-hidden hover:shadow-xl hover:border-blue-200 transition-all duration-300">
      
      {/* Imagen y Badges */}
      <div className="relative aspect-16/10 w-full overflow-hidden bg-slate-100">
        <div className="absolute inset-0 flex items-center justify-center text-slate-300">
          <Building2 size={48} strokeWidth={1} />
        </div>
        
        {/* Badge de Operación */}
        <div className="absolute top-3 left-3 flex gap-2">
          <Badge className={cn(
            "px-3 py-1 rounded-full border-none font-bold text-[10px] tracking-wider text-white shadow-lg",
            property.operation === 'sale' ? "bg-emerald-500" : "bg-blue-600"
          )}>
            {property.operation === 'sale' ? 'VENTA' : 'ALQUILER'}
          </Badge>
        </div>

        {/* Acciones en pantalla completa */}
        <div className="absolute top-3 right-3">
          <Dialog>
            <DialogTrigger
              className="flex h-11 w-11 items-center justify-center rounded-xl border border-white/70 bg-white/95 shadow-md backdrop-blur transition-colors hover:bg-white focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-blue-500/40"
              aria-label={`Abrir acciones para ${property.title}`}
            >
              <MoreVertical className="h-5 w-5 text-slate-700" aria-hidden="true" />
            </DialogTrigger>
            <DialogContent fullScreen className="flex bg-slate-50" showCloseButton>
              <div className="flex h-dvh min-h-0 w-full flex-col">
                <header className="shrink-0 border-b border-slate-200 bg-white px-4 pb-5 pt-[max(1rem,env(safe-area-inset-top))] sm:px-8 lg:px-12">
                  <div className="mx-auto w-full max-w-[min(94vw,2800px)] pr-16">
                    <DialogTitle className="text-2xl font-bold tracking-tight text-slate-950 sm:text-3xl lg:text-4xl">
                      Acciones de la propiedad
                    </DialogTitle>
                    <DialogDescription className="mt-2 text-base leading-7 text-slate-600 sm:text-lg">
                      {property.title} · {property.neighborhood}, {property.city}
                    </DialogDescription>
                  </div>
                </header>

                <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-6 sm:px-8 sm:py-8 lg:px-12 lg:py-10">
                  <div className="mx-auto grid min-h-full w-full max-w-[min(94vw,2800px)] content-center gap-4 md:grid-cols-3 xl:gap-7">
                    <button
                      type="button"
                      className="flex min-h-44 items-center gap-5 rounded-3xl border border-slate-200 bg-white p-6 text-left shadow-sm transition-colors hover:border-slate-300 hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-blue-500/40 sm:min-h-56 sm:flex-col sm:items-start sm:justify-between sm:p-8"
                    >
                      <span className="flex size-14 shrink-0 items-center justify-center rounded-2xl bg-slate-100 text-slate-700 sm:size-16">
                        <Edit3 className="size-7" aria-hidden="true" />
                      </span>
                      <span>
                        <span className="block text-2xl font-bold text-slate-950">Editar</span>
                        <span className="mt-2 block text-base leading-7 text-slate-600">Modificar la información de esta propiedad.</span>
                      </span>
                    </button>

                    <button
                      type="button"
                      className="flex min-h-44 items-center gap-5 rounded-3xl border border-blue-200 bg-blue-50 p-6 text-left shadow-sm transition-colors hover:border-blue-300 hover:bg-blue-100 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-blue-500/40 sm:min-h-56 sm:flex-col sm:items-start sm:justify-between sm:p-8"
                    >
                      <span className="flex size-14 shrink-0 items-center justify-center rounded-2xl bg-blue-600 text-white sm:size-16">
                        <Eye className="size-7" aria-hidden="true" />
                      </span>
                      <span>
                        <span className="block text-2xl font-bold text-blue-950">Ver web</span>
                        <span className="mt-2 block text-base leading-7 text-blue-800">Revisar cómo se presenta públicamente.</span>
                      </span>
                    </button>

                    <button
                      type="button"
                      className="flex min-h-44 items-center gap-5 rounded-3xl border border-rose-200 bg-rose-50 p-6 text-left shadow-sm transition-colors hover:border-rose-300 hover:bg-rose-100 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-rose-500/40 sm:min-h-56 sm:flex-col sm:items-start sm:justify-between sm:p-8"
                    >
                      <span className="flex size-14 shrink-0 items-center justify-center rounded-2xl bg-rose-600 text-white sm:size-16">
                        <Trash2 className="size-7" aria-hidden="true" />
                      </span>
                      <span>
                        <span className="block text-2xl font-bold text-rose-950">Eliminar</span>
                        <span className="mt-2 block text-base leading-7 text-rose-800">Quitar esta propiedad del inventario.</span>
                      </span>
                    </button>
                  </div>
                </div>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Contenido */}
      <div className="p-5 flex flex-col flex-1">
        <div className="mb-2">
          <h3 className="text-lg font-bold text-slate-900 leading-tight truncate group-hover:text-blue-600 transition-colors">
            {property.title}
          </h3>
          <p className="text-xs text-slate-500 flex items-center gap-1 mt-1 font-medium uppercase tracking-tighter">
            <MapPin className="h-3 w-3 text-red-400" />
            {property.neighborhood}, {property.city}
          </p>
        </div>

        <div className="mt-auto">
          <div className="flex items-baseline gap-1 mb-4">
            <span className="text-xl font-black text-slate-900">
                {property.currency} {property.price.toLocaleString('es-AR')}
            </span>
          </div>

          {/* Mini Ficha Técnica */}
          <div className="grid grid-cols-3 gap-2 py-3 border-t border-slate-50">
            <div className="flex flex-col">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-tighter">Amb.</span>
              <div className="flex items-center gap-1 text-slate-700 font-bold text-xs">
                <BedDouble className="h-3 w-3 text-slate-400" /> {property.bedrooms}
              </div>
            </div>
            <div className="flex flex-col">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-tighter">Baños</span>
              <div className="flex items-center gap-1 text-slate-700 font-bold text-xs">
                <Bath className="h-3 w-3 text-slate-400" /> {property.bathrooms}
              </div>
            </div>
            <div className="flex flex-col">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-tighter">Sup.</span>
              <div className="flex items-center gap-1 text-slate-700 font-bold text-xs">
                <Ruler className="h-3 w-3 text-slate-400" /> {property.area_m2}m²
              </div>
            </div>
          </div>

          <Link href={`/admin/properties/${property.id}`} className="block mt-2">
            <Button className="w-full bg-slate-50 hover:bg-blue-50 text-slate-600 hover:text-blue-700 border-none rounded-xl text-xs font-bold transition-all">
                Gestionar Propiedad
            </Button>
          </Link>
        </div>
      </div>
    </div>
  );
}
