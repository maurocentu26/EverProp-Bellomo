"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { AlertTriangle, Building2, ChevronRight, Database, FlaskConical, Map, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { type Project, type Property, projects as sampleProjects, properties as sampleProperties } from "@/data/admin-sample";
import { useAuth } from "@/lib/auth-context";
import { loadProjectList, loadPropertyList } from "@/lib/admin-storage";
import { isMockDataMode } from "@/lib/data-mode";
import { isInvalidEverpropSession, loadEverpropCatalog } from "@/lib/everprop-api";
import { cn } from "@/lib/utils";

type DataState =
  | { status: "loading" }
  | { status: "ready"; source: "admin-api" | "mock" }
  | { status: "error"; message: string };

function ProjectCard({ project, properties, readOnly }: { project: Project; properties: Property[]; readOnly: boolean }) {
  const projectProperties = properties.filter((property) => property.projectId === project.id);
  const soldCount = projectProperties.filter((property) => property.status === "sold").length;

  return (
    <article
      className={cn(
        "group flex h-full flex-col overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm transition-all duration-300",
        !readOnly && "cursor-pointer hover:-translate-y-1 hover:shadow-xl",
      )}
    >
      <div className="relative h-48 w-full overflow-hidden bg-slate-100">
        {project.masterplanImage ? (
          <div
            role="img"
            aria-label={project.name}
            className="h-full w-full bg-cover bg-center transition-transform duration-700 group-hover:scale-105"
            style={{ backgroundImage: `url("${project.masterplanImage.replaceAll('"', '\\"')}")` }}
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center bg-slate-200">
            <Building2 className="h-12 w-12 text-slate-400" aria-hidden="true" />
          </div>
        )}

        <div className="absolute left-4 top-4 flex gap-2">
          <span
            className={cn(
              "rounded-lg px-3 py-1 text-xs font-black uppercase tracking-wider text-white backdrop-blur-md",
              project.type === "land_development" ? "bg-emerald-500/90" : "bg-blue-600/90",
            )}
          >
            {project.type === "land_development" ? "Loteo" : "Edificio"}
          </span>
        </div>
      </div>

      <div className="flex flex-1 flex-col p-6">
        <h2 className="text-xl font-bold text-slate-900 transition-colors group-hover:text-blue-600">{project.name}</h2>
        <p className="mb-6 mt-1 flex items-center gap-1 text-sm text-slate-500">
          <Map className="h-4 w-4" aria-hidden="true" /> {project.location.city}, {project.location.province}
        </p>

        <div className="mt-auto space-y-5">
          <div className="grid grid-cols-2 gap-4 border-t border-slate-100 pt-4">
            <div>
              <span className="block text-[10px] font-bold uppercase tracking-wider text-slate-400">Unidades</span>
              <span className="text-lg font-black text-slate-700">{project.totalUnits}</span>
            </div>
            <div>
              <span className="block text-[10px] font-bold uppercase tracking-wider text-slate-400">Vendidas</span>
              <span className="text-lg font-black text-emerald-600">
                {soldCount} <span className="text-sm font-medium text-slate-400">/ {project.totalUnits}</span>
              </span>
            </div>
          </div>

          <div className="flex items-center justify-between text-sm font-bold text-blue-600">
            Ver detalle del proyecto
            <ChevronRight className="h-5 w-5 transition-transform group-hover:translate-x-1" aria-hidden="true" />
          </div>
        </div>
      </div>
    </article>
  );
}

export default function DesarrollosPage() {
  const { invalidateSession } = useAuth();
  const [projects, setProjects] = useState<Project[]>([]);
  const [properties, setProperties] = useState<Property[]>([]);
  const [dataState, setDataState] = useState<DataState>({ status: "loading" });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let active = true;

    async function loadData() {
      if (isMockDataMode) {
        await Promise.resolve();
        if (!active) return;
        setProjects(loadProjectList(sampleProjects, "c1").filter((project) => project.type !== "commercial"));
        setProperties(loadPropertyList(sampleProperties, "c1"));
        setDataState({ status: "ready", source: "mock" });
        return;
      }

      try {
        const catalog = await loadEverpropCatalog();
        if (!active) return;
        setProjects(catalog.projects.filter((project) => project.type !== "commercial"));
        setProperties(catalog.properties);
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
      <section className="rounded-3xl border border-rose-200 bg-white p-6 shadow-sm" role="alert">
        <div className="flex items-start gap-3">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-rose-600" aria-hidden="true" />
          <div>
            <h1 className="text-xl font-bold text-slate-900">No se pudo cargar el catálogo de proyectos</h1>
            <p className="mt-2 text-sm text-slate-600">{dataState.message} No se cargaron proyectos mock.</p>
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
    <div className="space-y-8">
      <header className="flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <h1 className="flex items-center gap-2 text-3xl font-bold text-slate-900">
            <Building2 className="h-8 w-8 text-blue-600" aria-hidden="true" /> Proyectos y desarrollos
          </h1>
          <p className="mt-1 text-slate-500">Catálogo de loteos, barrios y edificios.</p>
        </div>

        {isMockDataMode && (
          <Link href="/admin/inventory-matrix">
            <Button className="h-11 rounded-xl bg-emerald-600 px-6 text-white shadow-sm hover:bg-emerald-700">
              <Map className="mr-2 h-5 w-5" aria-hidden="true" /> Matriz mock de inventario
            </Button>
          </Link>
        )}
      </header>

      <div
        className={cn(
          "flex items-start gap-3 rounded-2xl border px-4 py-3 text-sm",
          dataState.source === "admin-api"
            ? "border-emerald-200 bg-emerald-50 text-emerald-950"
            : "border-amber-200 bg-amber-50 text-amber-950",
        )}
      >
        {dataState.source === "admin-api" ? (
          <Database className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
        ) : (
          <FlaskConical className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
        )}
        <p>
          {dataState.source === "admin-api"
            ? `Proyectos y desarrollos conectados a la base de datos (${projects.length} activos). Hacé clic en cualquier desarrollo para ver sus unidades e inventario.`
            : "QA visual mock: proyectos de muestra locales, sin confirmación de la API."}
        </p>
      </div>

      {projects.length === 0 ? (
        <div className="rounded-3xl border border-dashed border-slate-300 bg-white px-6 py-14 text-center">
          <Building2 className="mx-auto h-10 w-10 text-slate-300" aria-hidden="true" />
          <h2 className="mt-4 text-lg font-bold text-slate-900">No hay proyectos para mostrar</h2>
          <p className="mx-auto mt-2 max-w-xl text-sm text-slate-500">
            La consulta fue válida y el catálogo administrativo está vacío. No se sustituyó con datos mock.
          </p>
        </div>
      ) : (
        <div className="mt-8 grid grid-cols-1 gap-8 md:grid-cols-2 xl:grid-cols-3">
          {projects.map((project) => (
            <Link href={`/admin/desarrollos/${project.id}`} key={project.id}>
              <ProjectCard project={project} properties={properties} readOnly={false} />
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
