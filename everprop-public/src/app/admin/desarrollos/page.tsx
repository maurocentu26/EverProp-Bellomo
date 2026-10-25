"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { AlertTriangle, Building2, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { type Project, type Property, projects as sampleProjects, properties as sampleProperties } from "@/data/admin-sample";
import { useAuth } from "@/lib/auth-context";
import { loadProjectList, loadPropertyList } from "@/lib/admin-storage";
import { isMockDataMode } from "@/lib/data-mode";
import { apiFetch, isInvalidEverpropSession, loadEverpropProjects, loadEverpropPropertiesByProject } from "@/lib/everprop-api";
import ProjectCard from "@/components/admin/ProjectCard";
import { useCurrentSession } from "@/hooks/use-current-session";
import { useBellomoMaterials } from "@/hooks/use-bellomo-materials";


type DataState =
  | { status: "loading" }
  | { status: "ready"; source: "admin-api" | "mock" }
  | { status: "error"; message: string };

export default function DesarrollosPage() {
  const { isAdvisor } = useCurrentSession();
  const { data: materials } = useBellomoMaterials();
  const { invalidateSession } = useAuth();
  const [projects, setProjects] = useState<Project[]>([]);
  const [properties, setProperties] = useState<Property[]>([]);
  const [dataState, setDataState] = useState<DataState>({ status: "loading" });
  const [attempt, setAttempt] = useState(0);
  const [filterType, setFilterType] = useState<string>('all');
  const [canCreate, setCanCreate] = useState(false);

  useEffect(() => {
    if (isMockDataMode) return;
    const controller = new AbortController();
    apiFetch<{ can_create: boolean }>("/api/v1/admin/project-intakes", { signal: controller.signal })
      .then((result) => setCanCreate(result.can_create)).catch(() => setCanCreate(false));
    return () => controller.abort();
  }, []);

  useEffect(() => {
    let active = true;

    async function loadData() {
      if (isMockDataMode) {
        await Promise.resolve();
        if (!active) return;
        setProjects(loadProjectList(sampleProjects, "c1"));
        setProperties(loadPropertyList(sampleProperties, "c1"));
        setDataState({ status: "ready", source: "mock" });
        return;
      }

      try {
        const fetchedProjects = await loadEverpropProjects();
        const units = await Promise.all(fetchedProjects.map(project => loadEverpropPropertiesByProject(project.id)));
        if (!active) return;
        setProjects(fetchedProjects);
        setProperties(units.flat());
        setDataState({ status: "ready", source: "admin-api" });
      } catch (reason) {
        if (isInvalidEverpropSession(reason)) {
          invalidateSession();
          return;
        }
        if (!active) return;
        setProjects([]);
        setProperties([]);
        setDataState({
          status: "error",
          message: reason instanceof Error ? reason.message : "No se pudo cargar el catálogo de proyectos.",
        });
      }
    }

    void loadData();
    return () => {
      active = false;
    };
  }, [attempt, invalidateSession]);

  if (dataState.status === "loading") {
    return (
      <div className="animate-pulse space-y-4" role="status" aria-label="Cargando proyectos">
        <div className="h-10 w-48 rounded bg-slate-200" />
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-3">
          {[1, 2, 3].map((item) => <div key={item} className="h-80 rounded-3xl bg-slate-100" />)}
        </div>
      </div>
    );
  }

  if (dataState.status === "error") {
    return (
      <section className="rounded-3xl border border-rose-200 bg-card p-6 shadow-sm" role="alert">
        <div className="flex items-start gap-3">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-rose-600" aria-hidden="true" />
          <div>
            <h1 className="text-xl font-bold text-foreground">No se pudo cargar el catálogo de proyectos</h1>
            <p className="mt-2 text-sm text-foreground">Volvé a intentar cargar los proyectos.</p>
            <Button
              type="button"
              variant="outline"
              className="mt-4"
              onClick={() => {
                setDataState({ status: "loading" });
                setAttempt((current) => current + 1);
              }}
            >
              <RotateCcw className="mr-2 h-4 w-4" aria-hidden="true" /> Reintentar
            </Button>
          </div>
        </div>
      </section>
    );
  }

  return (
    <div className="inventory-view projects-view space-y-8">
      <header className="flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <h1 className="flex items-center gap-2 text-3xl font-bold text-foreground">
            <Building2 className="h-8 w-8 text-blue-600" aria-hidden="true" /> Proyectos y desarrollos
          </h1>
          <p className="mt-1 text-foreground">Catálogo de loteos, barrios y edificios.</p>
        </div>

        {!isAdvisor && canCreate && <Button nativeButton={false} role="link" render={<Link href="/admin/desarrollos/nuevo" />}>Nuevo proyecto</Button>}
      </header>

      <div className="project-filters flex flex-wrap gap-2">
        <Button variant={filterType === "all" ? "default" : "outline"} onClick={() => setFilterType("all")} className="rounded-full">Todos</Button>
        <Button variant={filterType === "land_development" ? "default" : "outline"} onClick={() => setFilterType("land_development")} className="rounded-full">Loteos</Button>
        <Button variant={filterType === "building" ? "default" : "outline"} onClick={() => setFilterType("building")} className="rounded-full">Edificios</Button>
        <Button variant={filterType === "commercial" ? "default" : "outline"} onClick={() => setFilterType("commercial")} className="rounded-full">Comerciales</Button>
      </div>

      {projects.filter(p => filterType === "all" || p.type === filterType).length === 0 ? (
        <div className="rounded-3xl border border-dashed border-slate-300 bg-card px-6 py-14 text-center">
          <Building2 className="mx-auto h-10 w-10 text-slate-300" aria-hidden="true" />
          <h2 className="mt-4 text-lg font-bold text-foreground">No hay proyectos para mostrar</h2>
          <p className="mx-auto mt-2 max-w-xl text-sm text-foreground">
            Probá con otro tipo de proyecto.
          </p>
        </div>
      ) : (
        <div className="inventory-cards">
          {projects.filter(p => filterType === "all" || p.type === filterType).map((project) => (
            <ProjectCard key={project.id} project={project} properties={properties} material={materials?.projects.find(p=>p.operationalIds.includes(project.id))} />
          ))}
        </div>
      )}
    </div>
  );
}

