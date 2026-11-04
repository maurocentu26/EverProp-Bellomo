"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ArrowRight, Layers, Ruler } from "lucide-react";
import { type Project, type Property, projects as sampleProjects, properties as sampleProperties } from "@/data/admin-sample";
import { loadProjectList, loadPropertyList } from "@/lib/admin-storage";
import { isMockDataMode } from "@/lib/data-mode";
import { loadEverpropProjects, loadEverpropPropertiesByProject, isInvalidEverpropSession } from "@/lib/everprop-api";
import { AVAILABLE_UNIT_STATES, compareUnits, projectLocationLabel, projectStatusLabel, projectTypeLabel, projectUnitSummary, UNIT_STATES, unitDisplay, unitState, unitStateLabel, type UnitState } from '@/lib/project-labels';
import { inventoryPriceLabel, propertyStatusLabel } from '@/lib/inventory-labels';
import { ProjectStateBar } from "@/components/admin/ProjectCard";
import { Button } from "@/components/ui/button";
import InventoryMatrix from "@/components/admin/InventoryMatrix";
import { GenerateLotsModal } from "@/components/admin/GenerateLotsModal";
import { useCurrentSession } from "@/hooks/use-current-session";
import { useAuth } from "@/lib/auth-context";
import { ProjectMaterials, MaterialErrorNotice } from "@/components/admin/BellomoResources";

type UnitFilter = UnitState | "all" | "offered";
const PAGE_SIZE = 24;

export default function ProjectDetailView() {
  const params = useParams();
  const projectId = params.id as string;
  const { isAdvisor } = useCurrentSession();
  const { invalidateSession } = useAuth();
  
  const [project, setProject] = useState<Project | null>(null);
  const [properties, setProperties] = useState<Property[]>([]);
  const [activeTab, setActiveTab] = useState<"units" | "matrix" | "materials">("units");
  const [isGenerateLotsOpen, setIsGenerateLotsOpen] = useState(false);
  const [loadError, setLoadError] = useState<{ projectId: string; message: string } | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [pickedFilter, setPickedFilter] = useState<UnitFilter | null>(null);
  const [visibleUnits, setVisibleUnits] = useState(PAGE_SIZE);

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
        {!isAdvisor && <Button variant="outline" onClick={() => setIsGenerateLotsOpen(true)}><Layers aria-hidden="true" /> Cargar manzana y lotes</Button>}
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
          <Link href={`/admin/properties/${property.id}`} className="inventory-secondary">Ver ficha <ArrowRight aria-hidden="true" size={18} /></Link>
        </article>)}
        <div className="project-units-more">
          <p className="project-meta" aria-live="polite">Mostrando {Math.min(visibleUnits, filteredUnits.length).toLocaleString("es-AR")} de {filteredUnits.length.toLocaleString("es-AR")}{isAdvisor ? " · Solo lectura" : ""}</p>
          {visibleUnits < filteredUnits.length && <button type="button" className="inventory-secondary" onClick={() => setVisibleUnits(count => count + PAGE_SIZE)}>Ver más</button>}
        </div>
      </section> : <p className="inventory-empty">Este proyecto todavía no tiene unidades cargadas.</p>)}
      {activeTab === "matrix" && <InventoryMatrix properties={properties} />}
      {activeTab === "materials" && <>
        {project.masterplanImage && <a className="inventory-secondary" href={project.masterplanImage} target="_blank" rel="noreferrer">Ver plano del proyecto</a>}
        {!isMockDataMode && <ProjectMaterials key={project.id} projectId={project.id} />}
        {isMockDataMode && !project.masterplanImage && <p className="inventory-empty">Este proyecto todavía no tiene materiales cargados.</p>}
      </>}

      {!isAdvisor && <GenerateLotsModal
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
