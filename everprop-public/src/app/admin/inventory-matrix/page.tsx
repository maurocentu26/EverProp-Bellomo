"use client";

import { useState, useEffect } from "react";
import { Layers, Download } from "lucide-react";
import * as XLSX from "xlsx";
import { type Property, properties as sampleProperties, projects as sampleProjects } from "@/data/admin-sample";
import { loadPropertyList, loadProjectList, savePropertyList } from "@/lib/admin-storage";
import { isMockDataMode } from "@/lib/data-mode";
import { deleteEverpropProperty, EverpropApiError, loadEverpropProjects, loadEverpropPropertiesByProject, updateEverpropPropertyStatus } from "@/lib/everprop-api";
import InventoryMatrix from "@/components/admin/InventoryMatrix";
import { useCurrentSession } from "@/hooks/use-current-session";
import { Button } from "@/components/ui/button";
import { GenerateLotsModal } from "@/components/admin/GenerateLotsModal";
import { propertyStatusLabel } from "@/lib/inventory-labels";
import { toast } from "sonner";

export default function GlobalInventoryMatrixPage() {
  const { isAdvisor, isReady, user } = useCurrentSession();
  const canCreate = !isAdvisor && Boolean(user?.permissions?.includes("create"));
  const canEdit = !isAdvisor && Boolean(user?.permissions?.includes("update"));
  const canDelete = canEdit && Boolean(user?.permissions?.includes("delete"));
  const [properties, setProperties] = useState<Property[]>([]);
  const [projects, setProjects] = useState<typeof sampleProjects>([]);
  const [loadError, setLoadError] = useState("");
  const [isLoaded, setIsLoaded] = useState(false);
  const [isLoadingProperties, setIsLoadingProperties] = useState(false);
  const [isGenerateLotsOpen, setIsGenerateLotsOpen] = useState(false);

  // Filters
  const [selectedProjectId, setSelectedProjectId] = useState<string>("");
  const [busyUnitId, setBusyUnitId] = useState<string | null>(null);

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
            if (!isMockDataMode && typeof project.propertiesCount === "number") { if (project.propertiesCount > 0) { setSelectedProjectId(project.id); break; } continue; }
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

  async function refreshProperties() {
    if (!selectedProjectId) return;
    const next = isMockDataMode
      ? loadPropertyList(sampleProperties, "c1").filter(unit => unit.projectId === selectedProjectId)
      : await loadEverpropPropertiesByProject(selectedProjectId);
    setProperties(next);
  }

  async function changeUnitStatus(unit: Property, status: "available" | "reserved" | "sold" | "not_marketed") {
    if (!canEdit || busyUnitId || unit.status === status) return;
    if (!window.confirm(`¿Cambiar ${unit.unitNumber || unit.title} de ${propertyStatusLabel(unit.status)} a ${propertyStatusLabel(status)}?`)) return;
    setBusyUnitId(unit.id);
    try {
      let updated: Property;
      if (isMockDataMode) {
        updated = { ...unit, status, version: (unit.version ?? 0) + 1 };
        savePropertyList(loadPropertyList(sampleProperties, "c1").map(item => item.id === unit.id ? updated : item), "c1");
      } else updated = await updateEverpropPropertyStatus(unit.id, status, unit.version);
      setProperties(items => items.map(item => item.id === unit.id ? updated : item));
      toast.success(`Estado actualizado: ${propertyStatusLabel(status)}`);
    } catch (error) {
      let refreshed = false;
      if (error instanceof EverpropApiError && error.status === 409) {
        try { await refreshProperties(); refreshed = true; } catch { /* The stale state stays visible until a full reload. */ }
      }
      toast.error(error instanceof EverpropApiError && error.status === 409 ? refreshed ? "La unidad cambió en otra sesión. Se actualizó la matriz." : "La unidad cambió en otra sesión. Recargá la página antes de volver a guardar." : error instanceof EverpropApiError && error.status === 403 ? "No tenés permiso para cambiar este lote." : error instanceof Error ? error.message : "No se pudo cambiar el estado.");
    } finally { setBusyUnitId(null); }
  }

  async function removeUnit(unit: Property) {
    if (!canDelete || busyUnitId) return;
    if (!window.confirm(`¿Eliminar el lote ${unit.unitNumber || unit.title}? Esta acción lo quitará del inventario. Revisá primero sus visitas y contactos vinculados.`)) return;
    setBusyUnitId(unit.id);
    try {
      if (isMockDataMode) savePropertyList(loadPropertyList(sampleProperties, "c1").filter(item => item.id !== unit.id), "c1");
      else await deleteEverpropProperty(unit.id);
      setProperties(items => items.filter(item => item.id !== unit.id));
      toast.success("Lote eliminado del inventario.");
    } catch (error) {
      toast.error(error instanceof EverpropApiError && error.status === 403 ? "No tenés permiso para eliminar este lote." : error instanceof EverpropApiError && error.status === 409 ? "Este lote tiene vínculos que impiden eliminarlo. Revisá visitas y contactos." : error instanceof Error ? error.message : "No se pudo eliminar el lote.");
    } finally { setBusyUnitId(null); }
  }

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
      <label htmlFor="matrix-project">Proyecto<select id="matrix-project" value={selectedProjectId} disabled={Boolean(busyUnitId)} onChange={event => { setProperties([]); setIsLoadingProperties(true); setSelectedProjectId(event.target.value); }}><option value="" disabled>Seleccioná un proyecto</option>{projects.map(project => <option key={project.id} value={project.id}>{project.name}</option>)}</select></label>
      <Button onClick={handleExportLegacy} variant="outline" disabled={!selectedProjectId || isLoadingProperties || !properties.length}><Download size={20} aria-hidden="true" />Exportar inventario</Button>
      {isReady && canCreate && <Button onClick={() => setIsGenerateLotsOpen(true)}><Layers size={20} aria-hidden="true" />Cargar manzana / lotes</Button>}
    </div>
    {loadError ? <p role="alert">{loadError}</p> : !selectedProjectId ? <p className="inventory-empty">Seleccioná un proyecto para ver sus lotes.</p> : <InventoryMatrix key={selectedProjectId} properties={properties} isLoading={isLoadingProperties} canEdit={canEdit} canDelete={canDelete} busyUnitId={busyUnitId} onStatusChange={changeUnitStatus} onDelete={removeUnit} />}
    {isReady && canCreate && <GenerateLotsModal open={isGenerateLotsOpen} onOpenChange={setIsGenerateLotsOpen} defaultProjectId={selectedProjectId || undefined} confirmBeforeSave onSuccess={created => { if (created[0]?.projectId === selectedProjectId) setProperties(previous => [...previous, ...created]); }} />}
  </div>;
}
