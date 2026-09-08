"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, BarChart3, Map, Layers } from "lucide-react";
import { type Project, type Property, projects as sampleProjects, properties as sampleProperties } from "@/data/admin-sample";
import { loadProjectList, loadPropertyList } from "@/lib/admin-storage";
import { isMockDataMode } from "@/lib/data-mode";
import { loadEverpropCatalog } from "@/lib/everprop-api";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import InventoryMatrix from "@/components/admin/InventoryMatrix";
import { GenerateLotsModal } from "@/components/admin/GenerateLotsModal";
import { useCurrentSession } from "@/hooks/use-current-session";

export default function ProjectDetailView() {
  const params = useParams();
  const router = useRouter();
  const projectId = params.id as string;
  const { isAdvisor } = useCurrentSession();
  
  const [project, setProject] = useState<Project | null>(null);
  const [properties, setProperties] = useState<Property[]>([]);
  const [activeTab, setActiveTab] = useState<"overview" | "matrix" | "log">("overview");
  const [isGenerateLotsOpen, setIsGenerateLotsOpen] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    let active = true;
    async function fetchProject() {
      if (!isMockDataMode) {
        try {
          const catalog = await loadEverpropCatalog();
          if (!active) return;
          const p = catalog.projects.find((item) => item.id === projectId);
          if (p) {
            setProject(p);
            setProperties(catalog.properties.filter((prop) => prop.projectId === projectId));
            setLoadError("");
            setIsLoaded(true);
            return;
          }
          setProject(null);
          setProperties([]);
          setLoadError("El proyecto solicitado no existe o no está disponible para tu sesión.");
          setIsLoaded(true);
          return;
        } catch (e) {
          console.error("Error loading project from API:", e);
          if (!active) return;
          setProject(null);
          setProperties([]);
          setLoadError(e instanceof Error ? e.message : "No se pudo cargar el proyecto desde la API.");
          setIsLoaded(true);
          return;
        }
      }
      if (!active) return;
      const allProj = loadProjectList(sampleProjects, "c1");
      const p = allProj.find((item) => item.id === projectId);
      if (p) {
        setProject(p);
        const allProps = loadPropertyList(sampleProperties, "c1");
        setProperties(allProps.filter((prop) => prop.projectId === projectId));
      }
      setIsLoaded(true);
    }
    void fetchProject();
    return () => {
      active = false;
    };
  }, [projectId]);

  if (!isLoaded) return (
    <div className="flex flex-col items-center justify-center py-20 text-slate-500">
      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mb-4"></div>
      Cargando proyecto...
    </div>
  );

  if (!project) return (
    <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-6 text-sm text-rose-900" role="alert">
      {loadError || "Proyecto no encontrado."} No se muestran datos de demostración.
    </div>
  );

  const soldUnits = properties.filter(p => p.status === "sold").length;
  const reservedUnits = properties.filter(p => p.status === "reserved").length;
  const availableUnits = properties.length - soldUnits - reservedUnits;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4 border-b border-slate-200 pb-6">
        <button 
          onClick={() => router.back()} 
          className="h-10 w-10 bg-slate-100 hover:bg-slate-200 rounded-full flex items-center justify-center text-slate-600 transition-colors"
        >
          <ArrowLeft className="h-5 w-5" />
        </button>
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold text-slate-900">{project.name}</h1>
            <span className={cn(
              "px-2 py-1 text-[10px] font-black uppercase tracking-wider rounded-md",
              project.status === 'completed' ? "bg-emerald-100 text-emerald-700" :
              project.status === 'under_construction' ? "bg-blue-100 text-blue-700" :
              "bg-amber-100 text-amber-700"
            )}>
              {project.status.replace('_', ' ')}
            </span>
          </div>
          <p className="text-sm text-slate-500 mt-1">{project.location.city}, {project.location.province}</p>
        </div>

        {!isAdvisor && (
          <div className="ml-auto flex items-center gap-2">
            <Button
              size="sm"
              onClick={() => setIsGenerateLotsOpen(true)}
              className="h-9 px-4 text-xs font-semibold bg-blue-600 hover:bg-blue-700 text-white gap-1.5 shadow-sm"
            >
              <Layers className="h-4 w-4" /> + Cargar Manzana / Lotes
            </Button>
          </div>
        )}
      </div>

      {/* Tabs */}
      <div className="flex gap-2 border-b border-slate-200">
        <button
          onClick={() => setActiveTab("overview")}
          className={cn(
            "px-4 py-3 text-sm font-bold flex items-center gap-2 border-b-2 transition-colors",
            activeTab === "overview" ? "border-blue-600 text-blue-700" : "border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300"
          )}
        >
          <BarChart3 className="h-4 w-4" /> Resumen
        </button>
        <button
          onClick={() => setActiveTab("matrix")}
          className={cn(
            "px-4 py-3 text-sm font-bold flex items-center gap-2 border-b-2 transition-colors",
            activeTab === "matrix" ? "border-blue-600 text-blue-700" : "border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300"
          )}
        >
          <Map className="h-4 w-4" /> Matriz de Inventario
        </button>
      </div>

      {/* Tab Content */}
      <div className="pt-4">
        {activeTab === "overview" && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 space-y-6">
              {/* Inventario Stats */}
              <div className="bg-white rounded-3xl p-6 shadow-sm border border-slate-200">
                <h3 className="text-lg font-bold text-slate-800 mb-6">Estado del Inventario</h3>
                <div className="grid grid-cols-3 gap-4">
                  <div className="bg-emerald-50 rounded-2xl p-4 border border-emerald-100">
                    <span className="block text-xs uppercase font-bold text-emerald-600 tracking-wider mb-1">Disponible</span>
                    <span className="text-3xl font-black text-emerald-700">{availableUnits}</span>
                  </div>
                  <div className="bg-amber-50 rounded-2xl p-4 border border-amber-100">
                    <span className="block text-xs uppercase font-bold text-amber-600 tracking-wider mb-1">Reservado</span>
                    <span className="text-3xl font-black text-amber-700">{reservedUnits}</span>
                  </div>
                  <div className="bg-slate-50 rounded-2xl p-4 border border-slate-200">
                    <span className="block text-xs uppercase font-bold text-slate-500 tracking-wider mb-1">Vendido</span>
                    <span className="text-3xl font-black text-slate-700">{soldUnits}</span>
                  </div>
                </div>
                
                <div className="mt-6 flex gap-4">
                  <Button onClick={() => setActiveTab("matrix")} className="bg-blue-600 hover:bg-blue-700 w-full rounded-xl h-12">
                    <Map className="mr-2 h-4 w-4" /> Ver Matriz Completa
                  </Button>
                </div>
              </div>

              {/* Descripción del Desarrollo */}
              {project.description && (
                <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-200">
                  <h3 className="text-base font-bold text-slate-800 mb-2">Descripción del Desarrollo</h3>
                  <p className="text-sm text-slate-600 leading-relaxed">
                    {project.description}
                  </p>
                </div>
              )}
            </div>

            <div className="space-y-6">
              {project.masterplanImage && (
                <div className="bg-white rounded-3xl overflow-hidden shadow-sm border border-slate-200">
                  <img src={project.masterplanImage} alt="Masterplan" className="w-full h-48 object-cover" />
                  <div className="p-4 bg-slate-50 border-t border-slate-100 text-center">
                    <span className="text-xs font-bold text-slate-500 uppercase tracking-widest">Masterplan</span>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {activeTab === "matrix" && (
          <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-200">
            <h3 className="text-lg font-bold text-slate-800 mb-6 flex items-center gap-2">
              <Map className="h-5 w-5 text-emerald-600" /> Matriz de Inventario
            </h3>
            <InventoryMatrix properties={properties} />
          </div>
        )}
      </div>

      <GenerateLotsModal
        open={isGenerateLotsOpen}
        onOpenChange={setIsGenerateLotsOpen}
        defaultProjectId={project.id}
        onSuccess={(created) => {
          setProperties((prev) => [...prev, ...created]);
        }}
      />
    </div>
  );
}
