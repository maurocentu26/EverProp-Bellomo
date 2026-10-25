"use client";

import { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import { BarChart3, Map, Layers } from "lucide-react";
import { type Project, type Property, projects as sampleProjects, properties as sampleProperties } from "@/data/admin-sample";
import { loadProjectList, loadPropertyList } from "@/lib/admin-storage";
import { isMockDataMode } from "@/lib/data-mode";
import { loadEverpropProjects, loadEverpropPropertiesByProject, isInvalidEverpropSession } from "@/lib/everprop-api";
import { cn } from "@/lib/utils";
import PropertyList from '@/components/admin/PropertyList';
import { projectLocationLabel, projectStatusLabel, projectTypeLabel, projectUnitCounts, projectCountLabel } from '@/lib/project-labels';
import { Button } from "@/components/ui/button";
import InventoryMatrix from "@/components/admin/InventoryMatrix";
import { GenerateLotsModal } from "@/components/admin/GenerateLotsModal";
import { useCurrentSession } from "@/hooks/use-current-session";
import { useAuth } from "@/lib/auth-context";
import { ProjectMaterials, MaterialErrorNotice } from "@/components/admin/BellomoResources";

export default function ProjectDetailView() {
  const params = useParams();
  const projectId = params.id as string;
  const { isAdvisor } = useCurrentSession();
  const { invalidateSession } = useAuth();
  
  const [project, setProject] = useState<Project | null>(null);
  const [properties, setProperties] = useState<Property[]>([]);
  const [activeTab, setActiveTab] = useState<"overview" | "matrix">("overview");
  const [isGenerateLotsOpen, setIsGenerateLotsOpen] = useState(false);
  const [loadError, setLoadError] = useState<{ projectId: string; message: string } | null>(null);
  const [attempt, setAttempt] = useState(0);

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

  const counts = projectUnitCounts(properties);

  return (
    <div className="inventory-view inventory-detail projects-view space-y-6">
      <header className="inventory-detail-header">
        <h1>{project.name}</h1>
        <p>{projectStatusLabel(project.status)} · {projectTypeLabel(project.type)}</p>
        <p>{projectLocationLabel(project)}</p>
        {project.description && <p>{project.description}</p>}
        {!isAdvisor && <Button onClick={() => setIsGenerateLotsOpen(true)}><Layers aria-hidden="true" /> Cargar manzana y lotes</Button>}
      </header>

      {/* Tabs */}
      <div className="flex flex-wrap gap-2 border-b border-slate-200">
        <button
          aria-pressed={activeTab === "overview"}
          onClick={() => setActiveTab("overview")}
          className={cn(
            "px-4 py-3 text-sm font-bold flex items-center gap-2 border-b-2 transition-colors",
            activeTab === "overview" ? "border-blue-600 text-blue-700" : "border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300"
          )}
        >
          <BarChart3 className="h-4 w-4" /> Resumen
        </button>
        <button
          aria-pressed={activeTab === "matrix"}
          onClick={() => setActiveTab("matrix")}
          className={cn(
            "px-4 py-3 text-sm font-bold flex items-center gap-2 border-b-2 transition-colors",
            activeTab === "matrix" ? "border-blue-600 text-blue-700" : "border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300"
          )}
        >
          <Map className="h-4 w-4" /> Matriz de inventario
        </button>
      </div>

      <section className="project-summary" aria-label="Resumen de unidades">
        <h2>Unidades del proyecto</h2>
        <p>{properties.length} {properties.length === 1 ? 'unidad cargada' : 'unidades cargadas'}</p>
        <ul className="project-counts">
          {counts.map((count, index) => <li key={index}><strong>{count}</strong> {projectCountLabel(count, index)}</li>)}
        </ul>
      </section>
      {activeTab === 'overview' && <>
        {properties.length ? <PropertyList properties={properties} projects={[project]} readOnly={isAdvisor} /> : <p className="inventory-empty">Este proyecto todavía no tiene unidades cargadas.</p>}
        {project.masterplanImage && <a className="inventory-cta" href={project.masterplanImage} target="_blank" rel="noreferrer">Ver plano del proyecto</a>}
      </>}
      {activeTab === 'matrix' && <InventoryMatrix properties={properties} />}

      {activeTab === "overview" && !isMockDataMode && <ProjectMaterials key={project.id} projectId={project.id} />}

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
