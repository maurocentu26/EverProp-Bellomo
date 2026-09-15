"use client";

import { useState, useMemo, useEffect } from "react";
import { Map, LayoutGrid, Layers, Download } from "lucide-react";
import * as XLSX from "xlsx";
import { type Property, properties as sampleProperties, projects as sampleProjects } from "@/data/admin-sample";
import { loadPropertyList, loadProjectList } from "@/lib/admin-storage";
import { isMockDataMode } from "@/lib/data-mode";
import { loadEverpropProjects, loadEverpropPropertiesByProject } from "@/lib/everprop-api";
import { deferEffectUpdate } from "@/lib/deferred-effect";
import InventoryMatrix from "@/components/admin/InventoryMatrix";
import { useCurrentSession } from "@/hooks/use-current-session";
import { Button } from "@/components/ui/button";
import { GenerateLotsModal } from "@/components/admin/GenerateLotsModal";

export default function GlobalInventoryMatrixPage() {
  const { isAdvisor, isReady } = useCurrentSession();
  const [properties, setProperties] = useState<Property[]>([]);
  const [projects, setProjects] = useState<typeof sampleProjects>([]);
  const [loadError, setLoadError] = useState("");
  const [isLoaded, setIsLoaded] = useState(false);
  const [isLoadingProperties, setIsLoadingProperties] = useState(false);
  const [isGenerateLotsOpen, setIsGenerateLotsOpen] = useState(false);

  // Filters
  const [selectedProjectId, setSelectedProjectId] = useState<string>("");

  useEffect(() => {
    let active = true;
    async function loadData() {
      if (!isMockDataMode) {
        try {
          const projs = await loadEverpropProjects();
          if (!active) return;
          setProjects(projs);
          setIsLoaded(true);
          return;
        } catch (e) {
          if (active) { setLoadError("No se pudieron cargar los desarrollos."); setIsLoaded(true); }
          return;
        }
      }
      if (!active) return;
      const allProj = loadProjectList(sampleProjects, "c1");
      setProjects(allProj);
      setIsLoaded(true);
    }
    void loadData();
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    let active = true;
    if (!selectedProjectId) {
      setProperties([]);
      return;
    }
    
    async function fetchProperties() {
      setIsLoadingProperties(true);
      if (!isMockDataMode) {
        try {
          const props = await loadEverpropPropertiesByProject(selectedProjectId);
          if (!active) return;
          setProperties(props);
        } catch (e) {
          console.error(e);
        } finally {
          if (active) setIsLoadingProperties(false);
        }
      } else {
        if (!active) return;
        const allProps = loadPropertyList(sampleProperties, "c1");
        setProperties(allProps.filter(p => p.projectId === selectedProjectId));
        setIsLoadingProperties(false);
      }
    }
    void fetchProperties();
    return () => {
      active = false;
    };
  }, [selectedProjectId]);

  const filteredProperties = useMemo(() => properties, [properties]);

  const handleExportLegacy = () => {
    if (!filteredProperties || filteredProperties.length === 0) return;

    const exportData = filteredProperties.map(p => {
      const row = { ...(p.legacyData || {}) };
      
      if (p.price !== undefined) {
        row["ProPre"] = p.price;
      }
      
      if (p.status) {
        if (p.status === "sold") {
          row["ProEId"] = 4;
        } else if (p.status === "available") {
          row["ProEId"] = 7;
        }
      }
      
      return row;
    });

    const worksheet = XLSX.utils.json_to_sheet(exportData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Inventario_Legacy");
    
    XLSX.writeFile(workbook, "everprop_inventario_legacy.xlsx");
  };

  const groupedByProject = useMemo(() => {
    const groups: Record<string, Property[]> = {};
    filteredProperties.forEach(p => {
      const pid = p.projectId || "unassigned";
      if (!groups[pid]) groups[pid] = [];
      groups[pid].push(p);
    });
    return groups;
  }, [filteredProperties]);

  if (loadError) return <p role="alert" className="rounded-xl border border-amber-500/40 p-4">{loadError}</p>;
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
            <select aria-label="Filtrar matriz por desarrollo"
              className="text-sm font-bold border-none bg-transparent focus:ring-0 cursor-pointer min-w-0 w-full md:w-64 text-slate-700 h-9"
              value={selectedProjectId}
              onChange={(e) => setSelectedProjectId(e.target.value)}
            >
              <option value="" disabled>Seleccione un desarrollo...</option>
              {projects.map(p => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </div>

          <Button
            size="sm"
            onClick={handleExportLegacy}
            variant="outline"
            disabled={!selectedProjectId || isLoadingProperties}
            className="h-10 px-4 text-xs font-semibold text-slate-700 bg-white border-slate-200 hover:bg-slate-50 shadow-sm rounded-xl gap-1.5"
          >
            <Download className="h-4 w-4 text-slate-500" /> Exportar (Legacy)
          </Button>

          {isReady && !isAdvisor && <Button
            size="sm"
            onClick={() => setIsGenerateLotsOpen(true)}
            className="h-10 px-4 text-xs font-semibold bg-blue-600 hover:bg-blue-700 text-white gap-1.5 shadow-sm rounded-xl"
          >
            <Layers className="h-4 w-4" /> + Cargar Manzana / Lotes
          </Button>}
        </div>
      </div>

      <div className="bg-white rounded-3xl p-6 md:p-8 shadow-sm border border-slate-200 min-h-[500px]">
        {!selectedProjectId ? (
          <div className="flex flex-col items-center justify-center h-64 text-center">
            <LayoutGrid className="h-10 w-10 text-slate-300 mb-4" />
            <p className="text-slate-500 font-medium text-lg">Seleccioná un desarrollo para ver su matriz de inventario.</p>
            <p className="text-slate-400 text-sm mt-2">Cargar todo el inventario simultáneamente afectaría el rendimiento.</p>
          </div>
        ) : isLoadingProperties ? (
          <div className="flex flex-col items-center justify-center h-64 text-center">
            <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mb-4" />
            <p className="text-slate-500 font-medium">Cargando propiedades...</p>
          </div>
        ) : Object.keys(groupedByProject).length > 0 ? (
          <div className="space-y-12">
            {Object.entries(groupedByProject).map(([pid, props]) => {
              const proj = pid === "unassigned" ? { name: "Propiedades Sin Desarrollo" } : projects.find(p => p.id === pid);
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

      {isReady && !isAdvisor && <GenerateLotsModal
        open={isGenerateLotsOpen}
        onOpenChange={setIsGenerateLotsOpen}
        defaultProjectId={selectedProjectId !== "all" ? selectedProjectId : undefined}
        onSuccess={(created) => {
          setProperties((prev) => [...prev, ...created]);
        }}
      />}
    </div>
  );
}
