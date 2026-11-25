"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ArrowRight, Layers, Pencil, Ruler, Plus, Trash2 } from "lucide-react";
import { type Project, type Property, projects as sampleProjects, properties as sampleProperties } from "@/data/admin-sample";
import { loadProjectList, loadPropertyList, savePropertyList } from "@/lib/admin-storage";
import { isMockDataMode } from "@/lib/data-mode";
import { deleteEverpropProperty, EverpropApiError, loadEverpropProjects, loadEverpropPropertiesByProject, isInvalidEverpropSession, updateEverpropPropertyStatus } from "@/lib/everprop-api";
import { AVAILABLE_UNIT_STATES, compareUnits, projectLocationLabel, projectStatusLabel, projectTypeLabel, projectUnitSummary, UNIT_STATES, unitDisplay, unitState, unitStateLabel, type UnitState } from '@/lib/project-labels';
import { inventoryPriceLabel, propertyStatusLabel } from '@/lib/inventory-labels';
import { ProjectStateBar } from "@/components/admin/ProjectCard";
import { Button } from "@/components/ui/button";
import InventoryMatrix from "@/components/admin/InventoryMatrix";
import { GenerateLotsModal } from "@/components/admin/GenerateLotsModal";
import { useCurrentSession } from "@/hooks/use-current-session";
import { useAuth } from "@/lib/auth-context";
import { ProjectMaterials, MaterialErrorNotice } from "@/components/admin/BellomoResources";
import { ProjectEditDialog } from "@/components/admin/ProjectEditDialog";
import { EditPropertyModal } from "@/components/admin/EditPropertyModal";
import { toast } from "sonner";

type UnitFilter = UnitState | "all" | "offered";
const PAGE_SIZE = 24;

export default function ProjectDetailView() {
  const params = useParams();
  const projectId = params.id as string;
  const { isAdvisor, user } = useCurrentSession();
  const { invalidateSession } = useAuth();
  
  const [project, setProject] = useState<Project | null>(null);
  const [properties, setProperties] = useState<Property[]>([]);
  const [activeTab, setActiveTab] = useState<"units" | "matrix" | "materials">("units");
  const [isGenerateLotsOpen, setIsGenerateLotsOpen] = useState(false);
  const [loadError, setLoadError] = useState<{ projectId: string; message: string } | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [pickedFilter, setPickedFilter] = useState<UnitFilter | null>(null);
  const [visibleUnits, setVisibleUnits] = useState(PAGE_SIZE);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [editingUnit, setEditingUnit] = useState<Property | null>(null);
  const [busyUnitId, setBusyUnitId] = useState<string | null>(null);
  const canEdit = !isAdvisor && Boolean(user?.permissions?.includes("update") || user?.permissions?.includes("full_access") || user?.permissions?.includes("manage_inventory"));
  const canCreate = !isAdvisor && Boolean(user?.permissions?.includes("create") || user?.permissions?.includes("full_access") || user?.permissions?.includes("manage_inventory"));
  const canDelete = canEdit && Boolean(user?.permissions?.includes("delete") || user?.permissions?.includes("full_access"));

  async function changeUnitStatus(unit: Property, status: "available" | "reserved" | "sold" | "not_marketed") {
    if (!canEdit || busyUnitId || unit.status === status) return;
    if (!window.confirm(`¿Cambiar ${unit.unitNumber || unit.title} de ${propertyStatusLabel(unit.status)} a ${propertyStatusLabel(status)}?`)) return;
    setBusyUnitId(unit.id);
    try {
      let updated: Property;
      if (isMockDataMode) {
        updated = { ...unit, status, version: (unit.version ?? 0) + 1 };
        const next = loadPropertyList(sampleProperties, "c1").map(item => item.id === unit.id ? updated : item);
        savePropertyList(next, "c1");
      } else updated = await updateEverpropPropertyStatus(unit.id, status, unit.version);
      setProperties(items => items.map(item => item.id === unit.id ? updated : item));
      toast.success(`Estado actualizado: ${propertyStatusLabel(status)}`);
    } catch (error) {
      toast.error(error instanceof EverpropApiError && error.status === 409 ? "La unidad cambió en otra sesión. Recargá el proyecto." : error instanceof Error ? error.message : "No se pudo cambiar el estado.");
    } finally { setBusyUnitId(null); }
  }

  async function removeUnit(unit: Property) {
    if (!canDelete || busyUnitId) return;
    if (!window.confirm(`¿Eliminar el lote ${unit.unitNumber || unit.title}? Esta acción lo quitará del inventario. Revisá primero sus visitas y contactos vinculados.`)) return;
    setBusyUnitId(unit.id);
    try {
      if (isMockDataMode) {
        savePropertyList(loadPropertyList(sampleProperties, "c1").filter(item => item.id !== unit.id), "c1");
      } else await deleteEverpropProperty(unit.id);
      setProperties(items => items.filter(item => item.id !== unit.id));
      toast.success("Lote eliminado del inventario.");
    } catch (error) {
      toast.error(error instanceof EverpropApiError && error.status === 403 ? "No tenés permiso para eliminar este lote." : error instanceof EverpropApiError && error.status === 409 ? "Este lote tiene vínculos que impiden eliminarlo. Revisá visitas y contactos." : error instanceof Error ? error.message : "No se pudo eliminar el lote.");
    } finally { setBusyUnitId(null); }
  }

  useEffect(() => {
    let active = true;
    async function fetchProject() {
      setProject(null);
      setProperties([]);
      if (!isMockDataMode) {
        try {
          const projects = await loadEverpropProjects();
          if (!active) return;
          const p = projects.find((p) => p.id === projectId);
          if (p) {

            const props = await loadEverpropPropertiesByProject(projectId);
            if (!active) return;
            setProject(p);
            setProperties(props);
            return;
          }
          setLoadError({ projectId, message: "Proyecto no encontrado." });
        } catch (reason) {
          if (isInvalidEverpropSession(reason)) {
            invalidateSession();
            return;
          }
          if (!active) return;
          setLoadError({ projectId, message: "Error al cargar el proyecto." });
        }
      } else {
        const projs = loadProjectList(sampleProjects, "c1");
        const p = projs.find((p) => p.id === projectId);
        if (p) {
          setProject(p);
          const allProps = loadPropertyList(sampleProperties, "c1");
          setProperties(allProps.filter((prop) => prop.projectId === projectId));
        } else setLoadError({ projectId, message: "Proyecto no encontrado." });
      }
    }
    void fetchProject();
    return () => {
      active = false;
    };
  }, [projectId, attempt, invalidateSession]);

  if (loadError?.projectId === projectId) return <MaterialErrorNotice message={loadError.message} retry={()=>{setLoadError(null);setAttempt(n=>n+1);}} />;
  if (!project || project.id !== projectId) return (
    <div className="flex flex-col items-center justify-center py-20 text-slate-500">
      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mb-4"></div>
      Cargando proyecto...
    </div>
  );

  const summary = projectUnitSummary(project, properties);
  const offeredStates = AVAILABLE_UNIT_STATES.filter(state => summary.counts[state] > 0);
  const defaultFilter: UnitFilter = offeredStates.length > 1 ? "offered" : offeredStates[0] ?? "all";
  const unitFilter = pickedFilter ?? defaultFilter;
  const filters: { id: UnitFilter; count: number; label: string }[] = [
    ...(offeredStates.length > 1 ? [{ id: "offered" as const, count: summary.available, label: summary.available === 1 ? "disponible" : "disponibles" }] : []),
    ...UNIT_STATES.filter(state => summary.counts[state] > 0).map(state => ({ id: state, count: summary.counts[state], label: unitStateLabel(state, summary.counts[state]) })),
    { id: "all", count: summary.total, label: "en total" },
  ];
  const filteredUnits = properties.filter(property => {
    const state = unitState(property);
    return unitFilter === "all" || (unitFilter === "offered" ? AVAILABLE_UNIT_STATES.includes(state) : state === unitFilter);
  }).sort(compareUnits);

  return (
    <div className="inventory-view inventory-detail projects-view space-y-6">
      {!isAdvisor && <Link href="/admin/desarrollos" className="project-back">‹ Proyectos</Link>}
      <header className="inventory-detail-header project-detail-header">
        <div>
          <h1>{project.name}</h1>
          <p className="project-tags"><span className="project-detail-status">{projectStatusLabel(project.status)}</span> <span>{projectTypeLabel(project.type)} · {summary.total.toLocaleString("es-AR")} {summary.total === 1 ? "unidad" : "unidades"}</span></p>
          <p className="project-meta">{projectLocationLabel(project)}</p>
          {project.description && <p>{project.description}</p>}
        </div>
        {(canCreate || canEdit) && <div className="flex flex-wrap gap-3">
          {canCreate && <Link className="inventory-secondary" href={`/admin/properties/new?category=loteo&type=Lote&project=${encodeURIComponent(project.id)}`}><Plus aria-hidden="true" /> Agregar unidad</Link>}
          {canEdit && !isMockDataMode && <Button variant="outline" onClick={() => setIsEditOpen(true)}><Pencil aria-hidden="true" /> Editar datos</Button>}
          {canCreate && <Button variant="outline" onClick={() => setIsGenerateLotsOpen(true)}><Layers aria-hidden="true" /> Cargar manzana y lotes</Button>}
        </div>}
      </header>

      {summary.total > 0 && <section className="project-state-summary" aria-label="Estado de las unidades">
        <ProjectStateBar summary={summary} />
        <div className="project-state-filters" role="group" aria-label="Filtrar unidades por estado">
          {filters.map(filter => (
            <button key={filter.id} type="button" aria-pressed={unitFilter === filter.id} onClick={() => { setPickedFilter(filter.id); setVisibleUnits(PAGE_SIZE); setActiveTab("units"); }}>
              {filter.id !== "all" && filter.id !== "offered" && <span aria-hidden="true" className="project-dot" data-state={filter.id} />}
              <span><strong>{filter.count.toLocaleString("es-AR")}</strong> {filter.label}</span>
            </button>
          ))}
        </div>
      </section>}

      <div className="project-tabs" role="group" aria-label="Sección del proyecto">
        {([["units", "Unidades"], ["matrix", "Matriz"], ["materials", "Materiales"]] as const).map(([id, label]) => (
          <button key={id} type="button" aria-pressed={activeTab === id} onClick={() => setActiveTab(id)}>{label}</button>
        ))}
      </div>

      {activeTab === "units" && (properties.length ? <section className="project-units" aria-label="Unidades">
        {filteredUnits.slice(0, visibleUnits).map(property => <article key={property.id} className="project-unit">
          <div className="project-unit-name">
            <h2>{unitDisplay(property).name}</h2>
            <p className="project-meta">{unitDisplay(property).detail}</p>
          </div>
          <p className="project-unit-area"><Ruler aria-hidden="true" size={18} />{property.area_m2 == null ? "Superficie sin informar" : `${property.area_m2.toLocaleString("es-AR", { maximumFractionDigits: 2 })} m²`}</p>
          <p className="project-unit-state"><span aria-hidden="true" className="project-dot" data-state={unitState(property)} />{property.status === "available" && property.operation === "sale" ? "En venta" : property.status === "available" && property.operation === "rent" ? "En alquiler" : propertyStatusLabel(property.status)}</p>
          <p className="project-unit-price">{inventoryPriceLabel(property)}</p>
          <div className="project-unit-actions">
            {canEdit && <button type="button" className="inventory-secondary" onClick={() => setEditingUnit(property)} aria-label={`Editar ${unitDisplay(property).name}`}><Pencil aria-hidden="true" size={18} /> Editar</button>}
            {canEdit && property.propertyType === "Lote" && <select disabled={busyUnitId === property.id} aria-label={`Estado de ${unitDisplay(property).name}`} value={property.status ?? "unknown"} onChange={event => void changeUnitStatus(property, event.target.value as "available" | "reserved" | "sold" | "not_marketed")}>{!["available", "reserved", "sold", "not_marketed"].includes(property.status ?? "unknown") && <option value={property.status ?? "unknown"} disabled>{propertyStatusLabel(property.status)}</option>}<option value="available">Disponible</option><option value="reserved">Reservado</option><option value="sold">Vendido</option><option value="not_marketed">No comercializado</option></select>}
            {canDelete && property.propertyType === "Lote" && <button type="button" disabled={busyUnitId === property.id} className="inventory-secondary" onClick={() => void removeUnit(property)} aria-label={`Eliminar ${unitDisplay(property).name}`}><Trash2 aria-hidden="true" size={18} /> Eliminar</button>}
            <Link href={`/admin/properties/${property.id}`} className="inventory-secondary">Ver ficha <ArrowRight aria-hidden="true" size={18} /></Link>
          </div>
        </article>)}
        <div className="project-units-more">
          <p className="project-meta" aria-live="polite">Mostrando {Math.min(visibleUnits, filteredUnits.length).toLocaleString("es-AR")} de {filteredUnits.length.toLocaleString("es-AR")}{isAdvisor ? " · Solo lectura" : ""}</p>
          {visibleUnits < filteredUnits.length && <button type="button" className="inventory-secondary" onClick={() => setVisibleUnits(count => count + PAGE_SIZE)}>Ver más</button>}
        </div>
      </section> : <p className="inventory-empty">Este proyecto todavía no tiene unidades cargadas.</p>)}
      {activeTab === "matrix" && <InventoryMatrix properties={properties} canEdit={canEdit} canDelete={canDelete} busyUnitId={busyUnitId} onStatusChange={changeUnitStatus} onDelete={removeUnit} />}
      {activeTab === "materials" && <>
        {project.masterplanImage && <a className="inventory-secondary" href={project.masterplanImage} target="_blank" rel="noreferrer">Ver plano del proyecto</a>}
        {!isMockDataMode && <ProjectMaterials key={project.id} projectId={project.id} />}
        {isMockDataMode && !project.masterplanImage && <p className="inventory-empty">Este proyecto todavía no tiene materiales cargados.</p>}
      </>}

      {!isAdvisor && !isMockDataMode && isEditOpen && <ProjectEditDialog projectId={project.id} open onOpenChange={setIsEditOpen} onSaved={setProject} />}
      {canEdit && editingUnit && <EditPropertyModal
        key={editingUnit.id}
        open
        onOpenChange={(open) => { if (!open) setEditingUnit(null); }}
        property={editingUnit}
        onSuccess={(updated) => setProperties((previous) => previous.map((unit) => (unit.id === updated.id ? updated : unit)))}
      />}

      {canCreate && <GenerateLotsModal
        open={isGenerateLotsOpen}
        onOpenChange={setIsGenerateLotsOpen}
        defaultProjectId={project.id}
        confirmBeforeSave
        onSuccess={(created) => {
          setProperties((prev) => [...prev, ...created]);
        }}
      />}
    </div>
  );
}
