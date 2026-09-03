"use client";

import { useState, useMemo, useEffect } from "react";
import { Map, LayoutGrid, Layers } from "lucide-react";
import { type Property, properties as sampleProperties, projects as sampleProjects } from "@/data/admin-sample";
import { loadPropertyList, loadProjectList } from "@/lib/admin-storage";
import { isMockDataMode } from "@/lib/data-mode";
import { loadEverpropCatalog } from "@/lib/everprop-api";
import { deferEffectUpdate } from "@/lib/deferred-effect";
import InventoryMatrix from "@/components/admin/InventoryMatrix";
import { Button } from "@/components/ui/button";
import { GenerateLotsModal } from "@/components/admin/GenerateLotsModal";

export default function GlobalInventoryMatrixPage() {
  const [properties, setProperties] = useState<Property[]>([]);
  const [projects, setProjects] = useState<typeof sampleProjects>([]);
  const [isLoaded, setIsLoaded] = useState(false);
  const [isGenerateLotsOpen, setIsGenerateLotsOpen] = useState(false);

  // Filters
  const [selectedProjectId, setSelectedProjectId] = useState<string>("all");

  useEffect(() => {
    let active = true;
    async function loadData() {
      if (!isMockDataMode) {
        try {
          const catalog = await loadEverpropCatalog();
          if (!active) return;
          setProperties(catalog.properties);
          setProjects(catalog.projects);
          setIsLoaded(true);
          return;
        } catch (e) {
          console.error("Error loading inventory matrix from API:", e);
        }
      }
      if (!active) return;
      setProperties(loadPropertyList(sampleProperties, "c1"));
      const allProj = loadProjectList(sampleProjects, "c1");
      setProjects(allProj);
      setIsLoaded(true);
    }
    void loadData();
    return () => {
      active = false;
    };
  }, []);

  const filteredProperties = useMemo(() => {
    if (selectedProjectId === "all") return properties;
    return properties.filter(p => p.projectId === selectedProjectId);
  }, [properties, selectedProjectId]);

  const groupedByProject = useMemo(() => {
    const groups: Record<string, Property[]> = {};
    filteredProperties.forEach(p => {
      // We only care about properties assigned to a project for the matrix
      if (!p.projectId) return;
      if (!groups[p.projectId]) groups[p.projectId] = [];
      groups[p.projectId].push(p);
    });
    return groups;
  }, [filteredProperties]);

  if (!isLoaded) return (
    <div className="h-96 animate-pulse bg-slate-100 rounded-3xl" />
  );

  return (
    <div className="max-w-[1400px] mx-auto space-y-8 pb-10">
      {/* Header & Global Project Filter */}
      <div className="bg-white rounded-3xl p-6 border border-slate-200 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div className="flex items-center gap-4">
          <div className="h-12 w-12 bg-emerald-100 rounded-2xl flex items-center justify-center border border-emerald-200">
            <LayoutGrid className="h-6 w-6 text-emerald-600" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Matriz Global de Inventario</h1>
            <p className="text-slate-500 text-sm">Visualización táctica de unidades por desarrollo.</p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-3 bg-slate-50 p-2 rounded-xl border border-slate-100 w-full md:w-auto">
            <Map className="h-5 w-5 text-slate-400 ml-2" />
            <select 
              className="text-sm font-bold border-none bg-transparent focus:ring-0 cursor-pointer w-full md:w-64 text-slate-700 h-9"
              value={selectedProjectId}
              onChange={(e) => setSelectedProjectId(e.target.value)}
            >
              <option value="all">Ver Todos los Desarrollos</option>
              {projects.map(p => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </div>

          <Button
            size="sm"
            onClick={() => setIsGenerateLotsOpen(true)}
            className="h-10 px-4 text-xs font-semibold bg-blue-600 hover:bg-blue-700 text-white gap-1.5 shadow-sm rounded-xl"
          >
            <Layers className="h-4 w-4" /> + Cargar Manzana / Lotes
          </Button>
        </div>
      </div>

      <div className="bg-white rounded-3xl p-6 md:p-8 shadow-sm border border-slate-200 min-h-[500px]">
        {Object.keys(groupedByProject).length > 0 ? (
          <div className="space-y-12">
            {Object.entries(groupedByProject).map(([pid, props]) => {
              const proj = projects.find(p => p.id === pid);
              if (!proj) return null;
              
              return (
                <div key={pid} className="space-y-6">
                  <h2 className="text-xl font-bold text-slate-800 border-b border-slate-100 pb-3 flex items-center gap-2">
                    <Map className="h-5 w-5 text-blue-600" /> {proj.name}
                  </h2>
                  <InventoryMatrix properties={props} />
                </div>
              );
            })}
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center h-64 text-center">
            <LayoutGrid className="h-10 w-10 text-slate-300 mb-4" />
            <p className="text-slate-500 font-medium">No hay unidades para mostrar en la matriz actual.</p>
          </div>
        )}
      </div>

      <GenerateLotsModal
        open={isGenerateLotsOpen}
        onOpenChange={setIsGenerateLotsOpen}
        defaultProjectId={selectedProjectId !== "all" ? selectedProjectId : undefined}
        onSuccess={(created) => {
          setProperties((prev) => [...prev, ...created]);
        }}
      />
    </div>
  );
}
