"use client";

import { useState, useEffect } from "react";
import { Layers, Download } from "lucide-react";
import * as XLSX from "xlsx";
import { type Property, properties as sampleProperties, projects as sampleProjects } from "@/data/admin-sample";
import { loadPropertyList, loadProjectList } from "@/lib/admin-storage";
import { isMockDataMode } from "@/lib/data-mode";
import { loadEverpropProjects, loadEverpropPropertiesByProject } from "@/lib/everprop-api";
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
      try {
        const allProjects = isMockDataMode ? loadProjectList(sampleProjects, "c1") : await loadEverpropProjects();
        if (!active) return;
        setProjects(allProjects);
        const query = new URLSearchParams(window.location.search);
        const requestedProject = query.get("projectId") || query.get("project");
        if (requestedProject) {
          setSelectedProjectId(requestedProject);
        } else {
          const mockProperties = isMockDataMode ? loadPropertyList(sampleProperties, "c1") : [];
          for (const project of allProjects) {
            const units = isMockDataMode ? mockProperties.filter(unit => unit.projectId === project.id) : await loadEverpropPropertiesByProject(project.id);
            if (!active) return;
            if (units.length) {
              setSelectedProjectId(project.id);
              break;
            }
          }
        }
      } catch {
        if (active) setLoadError("No se pudieron cargar los desarrollos o sus lotes.");
      } finally {
        if (active) setIsLoaded(true);
      }
    }
    void loadData();
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    let active = true;
    if (!selectedProjectId) {
      return;
    }
    
    async function fetchProperties() {
      setLoadError("");
      setIsLoadingProperties(true);
      if (!isMockDataMode) {
        try {
          const props = await loadEverpropPropertiesByProject(selectedProjectId);
          if (!active) return;
          setProperties(props);
        } catch {
          if (active) { setProperties([]); setLoadError("No se pudieron cargar los lotes. Volvé a seleccionar el proyecto para reintentar."); }
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

  const handleExportLegacy = () => {
    if (properties.length === 0) return;

    const exportData = properties.map(p => {
      const row = { ...(p.legacyData || {}) };
      
      if (p.priceKnown !== false && p.price !== undefined) {
        row["ProPre"] = p.price;
      }
      
      const legacyStatus = p.status === 'available' ? (p.operation === 'rent' ? 1 : p.operation === 'sale' ? 2 : undefined)
        : p.status === 'sold' ? 4 : p.status === 'rented' ? 3 : p.status === 'reserved' ? 6
        : p.status === 'not_sellable' ? 7 : p.status === 'not_marketed' ? 8 : undefined;
      if (legacyStatus !== undefined) row['ProEId'] = legacyStatus;
      
      return row;
    });

    const worksheet = XLSX.utils.json_to_sheet(exportData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Inventario_Legacy");
    
    XLSX.writeFile(workbook, "everprop_inventario_legacy.xlsx");
  };

  if (!isLoaded) return (
    <div className="h-96 animate-pulse bg-slate-100 rounded-3xl" />
  );

  return <div className="inventory-view lots-page">
    <header className="inventory-heading"><div><h1>Matriz de Lotes</h1><p>Cada cuadro es una unidad. Seleccionala para consultar su ficha.</p></div></header>
    <div className="inventory-filters">
      <label htmlFor="matrix-project">Proyecto<select id="matrix-project" value={selectedProjectId} onChange={event => { setProperties([]); setIsLoadingProperties(true); setSelectedProjectId(event.target.value); }}><option value="" disabled>Seleccioná un proyecto</option>{projects.map(project => <option key={project.id} value={project.id}>{project.name}</option>)}</select></label>
      <Button onClick={handleExportLegacy} variant="outline" disabled={!selectedProjectId || isLoadingProperties || !properties.length}><Download size={20} aria-hidden="true" />Exportar inventario</Button>
      {isReady && !isAdvisor && <Button onClick={() => setIsGenerateLotsOpen(true)}><Layers size={20} aria-hidden="true" />Cargar manzana / lotes</Button>}
    </div>
    {loadError ? <p role="alert">{loadError}</p> : !selectedProjectId ? <p className="inventory-empty">Seleccioná un proyecto para ver sus lotes.</p> : <InventoryMatrix key={selectedProjectId} properties={properties} isLoading={isLoadingProperties} />}
    {isReady && !isAdvisor && <GenerateLotsModal open={isGenerateLotsOpen} onOpenChange={setIsGenerateLotsOpen} defaultProjectId={selectedProjectId || undefined} confirmBeforeSave onSuccess={created => { if (created[0]?.projectId === selectedProjectId) setProperties(previous => [...previous, ...created]); }} />}
  </div>;
}
