"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { AlertTriangle, Building2, RotateCcw, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { type Project, type Property, projects as sampleProjects, properties as sampleProperties } from "@/data/admin-sample";
import { useAuth } from "@/lib/auth-context";
import { loadProjectList, loadPropertyList } from "@/lib/admin-storage";
import { isMockDataMode } from "@/lib/data-mode";
import { apiFetch, isInvalidEverpropSession, loadEverpropProjects, loadEverpropPropertiesByProject } from "@/lib/everprop-api";
import ProjectCard from "@/components/admin/ProjectCard";
import { useCurrentSession } from "@/hooks/use-current-session";
import { useBellomoMaterials } from "@/hooks/use-bellomo-materials";
import { projectUnitSummary } from "@/lib/project-labels";

const searchable = (value: string) => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
const formatCount = (value: number) => value.toLocaleString("es-AR");

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
  const [filterStock, setFilterStock] = useState<'all' | 'with' | 'without'>('all');
  const [query, setQuery] = useState('');
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
        const units = await Promise.all(fetchedProjects.filter(project => project.availableUnitsCount == null).map(project => loadEverpropPropertiesByProject(project.id)));
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

  const summaries = useMemo(() => projects.map(project => ({
    project,
    summary: projectUnitSummary(project, properties.filter(property => property.projectId === project.id)),
  })), [projects, properties]);

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

  const needle = searchable(query);
  const rows = summaries
    .filter(({ project }) => filterType === "all" || project.type === filterType)
    .filter(({ summary }) => filterStock === "all" || (filterStock === "with") === (summary.available > 0))
    .filter(({ project }) => !needle || searchable(`${project.name} ${project.location.city}`).includes(needle))
    .sort((a, b) => b.summary.available - a.summary.available || b.summary.total - a.summary.total || a.project.name.localeCompare(b.project.name, "es"));
  const sum = (pick: (summary: (typeof summaries)[number]["summary"]) => number) => summaries.reduce((total, { summary }) => total + pick(summary), 0);

  return (
    <div className="inventory-view projects-view space-y-6">
      <header className="projects-header">
        <div>
          <h1 className="font-bold text-foreground">Proyectos y desarrollos</h1>
          <p className="mt-1 text-foreground">
            <strong>{formatCount(sum(item => item.available))} disponibles</strong> de {formatCount(sum(item => item.total))} unidades · {formatCount(sum(item => item.counts.sale))} en venta, {formatCount(sum(item => item.counts.rent))} en alquiler · {formatCount(sum(item => item.counts.reserved))} reservadas
          </p>
        </div>
        {!isAdvisor && canCreate && <Button nativeButton={false} role="link" render={<Link href="/admin/desarrollos/nuevo" />}>Nuevo proyecto</Button>}
      </header>

      <section className="projects-toolbar" aria-label="Filtros de proyectos">
        <label className="projects-search">
          <Search aria-hidden="true" size={20} />
          <span className="sr-only">Buscar proyecto</span>
          <input type="search" value={query} onChange={event => setQuery(event.target.value)} placeholder="Buscar por nombre o ciudad" />
        </label>
        <div className="project-filters flex flex-wrap gap-2" role="group" aria-label="Tipo de proyecto">
          {[["all", "Todos"], ["land_development", "Loteos"], ["building", "Edificios"], ["commercial", "Comerciales"]].map(([value, label]) => (
            <Button key={value} variant={filterType === value ? "default" : "outline"} aria-pressed={filterType === value} onClick={() => setFilterType(value)} className="rounded-full">{label}</Button>
          ))}
        </div>
        <label className="projects-stock">
          <span>Mostrar</span>
          <select value={filterStock} onChange={event => setFilterStock(event.target.value as typeof filterStock)}>
            <option value="all">Todos</option>
            <option value="with">Con disponibles</option>
            <option value="without">Sin disponibles</option>
          </select>
        </label>
      </section>

      <p className="project-meta" aria-live="polite">{rows.length === 1 ? "1 proyecto" : `${rows.length} proyectos`}, primero los que tienen más disponibles</p>

      {rows.length === 0 ? (
        <div className="rounded-3xl border border-dashed border-slate-300 bg-card px-6 py-14 text-center">
          <Building2 className="mx-auto h-10 w-10 text-slate-300" aria-hidden="true" />
          <h2 className="mt-4 text-lg font-bold text-foreground">No hay proyectos para mostrar</h2>
          <p className="mx-auto mt-2 max-w-xl text-sm text-foreground">Probá con otra búsqueda o con otro filtro.</p>
        </div>
      ) : (
        <div className="project-rows">
          {rows.map(({ project }) => (
            <ProjectCard key={project.id} project={project} properties={properties} material={materials?.projects.find(p=>p.operationalIds.includes(project.id))} />
          ))}
        </div>
      )}
    </div>
  );
}

