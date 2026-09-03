import { HardHat, ArrowRight } from "lucide-react";
import { type Project } from "@/data/admin-sample";
import { cn } from "@/lib/utils";

type Props = {
  activeProjects: Project[];
};

export default function ProjectsOverviewWidget({ activeProjects }: Props) {
  return (
    <section>
      <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2 mb-4">
        <HardHat className="h-5 w-5 text-blue-600" /> Avance de Obra y Proyectos
      </h2>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {activeProjects.map(project => (
          <div key={project.id} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm flex flex-col justify-between">
            <div>
              <div className="flex items-start justify-between mb-2">
                <h3 className="font-bold text-slate-800">{project.name}</h3>
                <span className={cn("px-2 py-1 text-[10px] font-black uppercase tracking-wider rounded-md", 
                  project.status === 'completed' ? "bg-emerald-100 text-emerald-700" :
                  project.status === 'under_construction' ? "bg-blue-100 text-blue-700" :
                  "bg-amber-100 text-amber-700"
                )}>
                  {project.status.replace('_', ' ')}
                </span>
              </div>
              <p className="text-xs text-slate-500 mb-4">{project.location.city}, {project.location.province}</p>
              
              <div className="space-y-1.5 mb-4">
                <div className="flex justify-between text-xs font-semibold text-slate-600">
                  <span>Avance General</span>
                  <span>{project.progress}%</span>
                </div>
                <div className="w-full bg-slate-100 rounded-full h-2 overflow-hidden">
                  <div 
                    className={cn("h-full rounded-full", project.progress === 100 ? "bg-emerald-500" : "bg-blue-600")}
                    style={{ width: `${project.progress}%` }}
                  />
                </div>
              </div>
            </div>
            <div className="pt-3 border-t border-slate-100 text-xs text-slate-600 font-medium flex justify-between items-center">
              <span>{project.totalUnits} Unidades Totales</span>
              <button className="text-blue-600 hover:text-blue-700 font-bold flex items-center gap-1">
                Ver detalle <ArrowRight className="h-3 w-3" />
              </button>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
