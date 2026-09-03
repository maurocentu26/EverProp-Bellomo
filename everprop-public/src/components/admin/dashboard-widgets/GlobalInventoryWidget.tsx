import Link from "next/link";
import { Map } from "lucide-react";
import { type Project, type Property } from "@/data/admin-sample";
import { cn } from "@/lib/utils";

type Props = {
  inventoryByProject: Record<string, Property[]>;
  projects: Project[];
};

export default function GlobalInventoryWidget({ inventoryByProject, projects }: Props) {
  return (
    <section>
      <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2 mb-4">
        <Map className="h-5 w-5 text-emerald-600" /> Matriz de Inventario (Loteos)
      </h2>
      <div className="space-y-6">
        {Object.entries(inventoryByProject).length > 0 ? Object.entries(inventoryByProject).map(([projectId, units]) => {
          const project = projects.find(p => p.id === projectId);
          const projectName = project ? project.name : 'Lotes sin Proyecto Asignado';
          
          return (
            <div key={projectId} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <h3 className="text-xl font-bold text-slate-900 mb-4 pb-3 border-b border-slate-100">{projectName}</h3>
              
              <div className="flex flex-wrap gap-2 mb-6">
                {units.map(unit => {
                  const isAvailable = !unit.status || unit.status === 'available';
                  const isReserved = unit.status === 'reserved';
                  
                  return (
                    <Link
                      key={unit.id} 
                      href={`/admin/properties/${unit.id}`}
                      className="group relative cursor-pointer block"
                    >
                      <div className={cn(
                        "h-9 w-9 rounded-lg border flex items-center justify-center text-[10px] font-bold transition-all hover:scale-115 hover:shadow-md hover:z-20",
                        isAvailable ? "bg-emerald-100 border-emerald-200 text-emerald-700 hover:bg-emerald-200" :
                        isReserved ? "bg-amber-100 border-amber-200 text-amber-700 hover:bg-amber-200" :
                        "bg-rose-100 border-rose-200 text-rose-700 hover:bg-rose-200"
                      )}>
                        {unit.unitNumber?.replace(/\D/g, '') || unit.title.slice(0,2)}
                      </div>
                      
                      {/* Tooltip */}
                      <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-48 hidden group-hover:block z-50 pointer-events-none">
                        <div className="bg-slate-900 text-white text-xs p-3 rounded-xl shadow-2xl border border-slate-800">
                          <p className="font-bold mb-0.5">{unit.unitNumber || unit.title}</p>
                          <p className="text-[10px] text-slate-400">{unit.sectorName || 'Sin Sector'}</p>
                          <div className="mt-2 pt-2 border-t border-slate-800 space-y-1">
                            <p className="flex justify-between"><span>Precio:</span> <strong>{unit.currency} {unit.price.toLocaleString('es-AR')}</strong></p>
                            {unit.area_m2 && <p className="flex justify-between"><span>Sup:</span> <strong>{unit.area_m2} m²</strong></p>}
                            <p className="flex justify-between">
                              <span>Estado:</span> 
                              <span className={cn(
                                isAvailable ? "text-emerald-400 font-bold" :
                                isReserved ? "text-amber-400 font-bold" : "text-rose-400 font-bold"
                              )}>
                                {isAvailable ? "Disponible" : isReserved ? "Reservado" : "Vendido"}
                              </span>
                            </p>
                          </div>
                        </div>
                        <div className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-slate-900" />
                      </div>
                    </Link>
                  );
                })}
              </div>

              <div className="flex gap-4 pt-4 border-t border-slate-100 text-xs font-semibold text-slate-600">
                <div className="flex items-center gap-1.5"><div className="h-3 w-3 rounded-sm bg-emerald-100 border border-emerald-200" /> Disponible</div>
                <div className="flex items-center gap-1.5"><div className="h-3 w-3 rounded-sm bg-amber-100 border border-amber-200" /> Reservado</div>
                <div className="flex items-center gap-1.5"><div className="h-3 w-3 rounded-sm bg-rose-100 border border-rose-200" /> Vendido</div>
              </div>
            </div>
          );
        }) : (
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <p className="text-sm text-slate-500 italic">No hay lotes registrados para la matriz de inventario.</p>
          </div>
        )}
      </div>
    </section>
  );
}
