"use client";

import { useState, useMemo, useEffect } from "react";
import PropertyList from "@/components/admin/PropertyList";
import { Button } from "@/components/ui/button";
import { AlertTriangle, Download, Plus, Map, Building2, RotateCcw, Database, FlaskConical } from "lucide-react";
import Link from "next/link";
import { type Project, type Property, properties as sampleProperties, projects as sampleProjects } from "@/data/admin-sample";
import { loadPropertyList, loadProjectList } from "@/lib/admin-storage";
import { cn } from "@/lib/utils";
import { isInvalidEverpropSession, loadEverpropCatalog } from "@/lib/everprop-api";
import { canManageInventory } from "@/lib/demo-permissions";
import { useAuth } from "@/lib/auth-context";
import { isMockDataMode } from "@/lib/data-mode";

import { isLocalDemo, demoCatalog } from "@/lib/demo-catalog";

type DataState =
  | { status: "loading" }
  | { status: "ready"; source: "admin-api" | "mock" }
  | { status: "error"; message: string };

const statusFilters = [
  { id: "all", label: "Todos" },
  { id: "available", label: "Disponible" },
  { id: "reserved", label: "Reservado" },
  { id: "sold", label: "Vendido" },
] as const;

export default function AllPropertiesPage() {
  const { invalidateSession, currentUser } = useAuth();
  const [allProperties, setAllProperties] = useState<Property[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [dataState, setDataState] = useState<DataState>({ status: "loading" });
  const [attempt, setAttempt] = useState(0);
  const [search, setSearch] = useState("");

  // Filters
  const [selectedProjectId, setSelectedProjectId] = useState<string>("all");
  const [activeStatus, setActiveStatus] = useState<"all" | "available" | "reserved" | "sold">("all");
  const [selectedTypes, setSelectedTypes] = useState<string[]>([]);

  useEffect(() => {
    let active = true;

    async function loadData() {
      if (isLocalDemo) {
        try {
          const properties = await demoCatalog() as Property[];
          if (!active) return;
          setAllProperties(properties);
          setProjects(sampleProjects);
          setDataState({ status: "ready", source: "mock" });
        } catch (reason) {
          if (active) setDataState({ status: "error", message: reason instanceof Error ? reason.message : "Catálogo demo no disponible." });
        }
        return;
      }
      if (isMockDataMode) {
        await Promise.resolve();
        if (!active) return;
        setAllProperties(loadPropertyList(sampleProperties, "c1"));
        setProjects(loadProjectList(sampleProjects, "c1"));
        setDataState({ status: "ready", source: "mock" });
        return;
      }

      try {
        const catalog = await loadEverpropCatalog();
        if (!active) return;
        setAllProperties(catalog.properties);
        setProjects(catalog.projects);
        setDataState({ status: "ready", source: "admin-api" });
      } catch (reason) {
        if (isInvalidEverpropSession(reason)) {
          invalidateSession();
          return;
        }
        if (!active) return;
        setAllProperties([]);
        setProjects([]);
        setDataState({
          status: "error",
          message: reason instanceof Error ? reason.message : "No se pudo cargar el inventario.",
        });
      }
    }

    void loadData();
    return () => {
      active = false;
    };
  }, [attempt, invalidateSession]);

  const toggleType = (type: string) => {
    setSelectedTypes(prev => prev.includes(type) ? prev.filter(t => t !== type) : [...prev, type]);
  };

  const filteredProperties = useMemo(() => {
    let filtered = allProperties.filter(p => `${p.title} ${p.city} ${p.neighborhood}`.toLocaleLowerCase().includes(search.toLocaleLowerCase()));

    // 1. Project Filter
    if (selectedProjectId !== "all") {
      filtered = filtered.filter(p => p.projectId === selectedProjectId);
    }

    // 2. Status Filter
    if (activeStatus !== "all") {
      filtered = filtered.filter(p => p.status === activeStatus || (!p.status && activeStatus === "available"));
    }

    // 3. Type Filter
    if (selectedTypes.length > 0) {
      filtered = filtered.filter(p => selectedTypes.includes(p.propertyType));
    }

    return filtered;
  }, [allProperties, selectedProjectId, activeStatus, selectedTypes, search]);

  const groupedProperties = useMemo(() => {
    const groups: { projects: Record<string, Property[]>, individual: Property[] } = {
      projects: {},
      individual: []
    };

    filteredProperties.forEach(p => {
      if (p.projectId) {
        if (!groups.projects[p.projectId]) groups.projects[p.projectId] = [];
        groups.projects[p.projectId].push(p);
      } else {
        groups.individual.push(p);
      }
    });
    return groups;
  }, [filteredProperties]);

  if (dataState.status === "loading") return <div className="h-96 animate-pulse bg-slate-100 rounded-3xl" role="status" aria-label="Cargando propiedades" />;

  if (dataState.status === "error") {
    return (
      <section className="rounded-3xl border border-rose-200 bg-white p-6 shadow-sm" role="alert">
        <div className="flex items-start gap-3">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-rose-600" aria-hidden="true" />
          <div>
            <h1 className="text-xl font-bold text-slate-900">No se pudo cargar el inventario</h1>
            <p className="mt-2 text-sm text-slate-600">{dataState.message} No se cargaron propiedades mock.</p>
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
    <div className="max-w-[1400px] mx-auto space-y-8 pb-10">
      {isLocalDemo && <div className="rounded-xl border border-blue-200 bg-blue-50 p-4 text-sm text-blue-950">
        <strong>Demo local conectada a Bellomito.</strong> {canManageInventory(currentUser) ? "Administrá las propiedades y su publicación desde Web pública." : "Tu perfil permite consultar propiedades. Administración e Ingeniería gestionan su publicación."}
        {canManageInventory(currentUser) && <a className="ml-3 font-semibold underline" href="/admin/web-publica">Abrir Web pública</a>}
      </div>}
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-slate-900 tracking-tight">Propiedades e Inventario</h1>
          <p className="mt-1 text-slate-500 text-sm">Gestioná todos los activos, lotes y proyectos en cartera.</p>
        </div>
        
        <div className="flex items-center gap-3">
          {(!isLocalDemo || canManageInventory(currentUser)) && <Link href="/admin/properties/new">
            <Button className="bg-blue-600 hover:bg-blue-700 text-white gap-2">
                <Plus className="h-4 w-4" />
                Nueva Propiedad
            </Button>
          </Link>}
        </div>
      </div>

      <div className={cn(
        "flex items-start gap-3 rounded-2xl border px-4 py-3 text-sm",
        dataState.source === "admin-api"
          ? "border-emerald-200 bg-emerald-50 text-emerald-950"
          : "border-amber-200 bg-amber-50 text-amber-950",
      )}>
        {dataState.source === "admin-api" ? (
          <Database className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" aria-hidden="true" />
        ) : (
          <FlaskConical className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" aria-hidden="true" />
        )}
        <p>
          {dataState.source === "admin-api"
            ? `Inventario real conectado a la base de datos (${allProperties.length} activos en cartera). Modo interactivo habilitado: podés abrir cada ficha, consultar datos y actualizar estados.`
            : isLocalDemo ? "Catálogo demo guardado en esta computadora y compartido con la web de Bellomito." : "QA visual mock: inventario de muestra local, sin confirmación de la API."}
        </p>
      </div>

      {/* Control Panel / Filtros */}
      <label className="block max-w-lg text-sm font-medium text-slate-700">Buscar propiedad
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Nombre, ciudad o barrio" className="mt-2 w-full rounded-xl border border-slate-300 bg-white px-4 py-3" />
      </label>
      <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm flex flex-col xl:flex-row gap-6 justify-between items-start xl:items-center">
        
        {/* Project Filter */}
        <div className="flex items-center gap-3 w-full xl:w-auto">
          <div className="h-10 w-10 bg-slate-50 rounded-xl flex items-center justify-center border border-slate-100">
            <Map className="h-5 w-5 text-slate-500" />
          </div>
          <select 
            className="text-sm font-semibold border-none bg-transparent focus:ring-0 cursor-pointer p-0 w-full xl:w-48 text-slate-700"
            value={selectedProjectId}
            onChange={(e) => setSelectedProjectId(e.target.value)}
          >
            <option value="all">Todos los Desarrollos</option>
            {projects.map(p => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        </div>
        <div className="hidden xl:block w-px h-8 bg-slate-200" />

        {/* Status Filter */}
        <div className="flex items-center gap-2 overflow-x-auto w-full xl:w-auto p-1 bg-slate-50 rounded-xl border border-slate-100">
          {statusFilters.map(tab => (
            <button 
              key={tab.id}
              onClick={() => setActiveStatus(tab.id)}
              className={cn(
                "px-4 py-1.5 rounded-lg text-xs font-bold transition-all whitespace-nowrap uppercase tracking-wider",
                activeStatus === tab.id 
                  ? (tab.id === 'available' ? "bg-emerald-100 text-emerald-700" : tab.id === 'reserved' ? "bg-amber-100 text-amber-700" : tab.id === 'sold' ? "bg-rose-100 text-rose-700" : "bg-white text-slate-800 shadow-sm border border-slate-200") 
                  : "text-slate-500 hover:text-slate-700"
              )}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="hidden xl:block w-px h-8 bg-slate-200" />

        {/* Type Multi-select & Clear Filters */}
        <div className="flex items-center gap-2 overflow-x-auto w-full xl:w-auto">
          <Building2 className="h-4 w-4 text-slate-400 mr-2 hidden sm:block" />
          {["Lote", "Departamento", "Local", "Cochera", "Casa"].map(type => (
            <button
              key={type}
              onClick={() => toggleType(type)}
              className={cn(
                "px-3 py-1.5 rounded-lg text-xs font-semibold transition-all border",
                selectedTypes.includes(type) ? "bg-blue-50 border-blue-200 text-blue-700" : "bg-white border-slate-200 text-slate-600 hover:bg-slate-50"
              )}
            >
              {type}
            </button>
          ))}

          {(selectedProjectId !== "all" || activeStatus !== "all" || selectedTypes.length > 0) && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setSelectedProjectId("all");
                setActiveStatus("all");
                setSelectedTypes([]);
              }}
              className="text-xs text-rose-600 hover:bg-rose-50 hover:text-rose-700 font-semibold gap-1.5 ml-2"
            >
              <RotateCcw className="h-3.5 w-3.5" /> Limpiar
            </Button>
          )}
        </div>
      </div>

      {/* Content Rendering */}
      {filteredProperties.length === 0 ? (
        <div className="rounded-3xl border border-dashed border-slate-300 bg-white px-6 py-14 text-center">
          <Building2 className="mx-auto h-10 w-10 text-slate-300" aria-hidden="true" />
          <h2 className="mt-4 text-lg font-bold text-slate-900">No hay propiedades para mostrar</h2>
          <p className="mx-auto mt-2 max-w-xl text-sm text-slate-500">
            {allProperties.length === 0
              ? "La consulta fue válida y el catálogo administrativo está vacío. No se sustituyó con datos mock."
              : "Ninguna propiedad coincide con los filtros seleccionados."}
          </p>
        </div>
      ) : (
        <div className="space-y-12">
          {/* Projects and their properties */}
          {Object.entries(groupedProperties.projects).map(([pId, props]) => {
            const proj = projects.find(p => p.id === pId);
            return (
              <div key={pId} className="space-y-4">
                <div className="flex items-center justify-between border-b border-slate-200 pb-2">
                  <h2 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
                    <Map className="h-6 w-6 text-blue-600" /> {proj?.name || "Proyecto"}
                  </h2>
                  <span className="text-xs font-semibold px-2.5 py-1 bg-blue-50 text-blue-700 rounded-full">
                    {props.length} unidades
                  </span>
                </div>
                <PropertyList properties={props} readOnly={isLocalDemo && !canManageInventory(currentUser)} />
              </div>
            );
          })}
          
          {/* Individual properties */}
          {groupedProperties.individual.length > 0 && (
            <div className="space-y-4 pt-4">
              <div className="flex items-center justify-between border-b border-slate-200 pb-2">
                <h2 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
                  <Building2 className="h-6 w-6 text-emerald-600" /> Propiedades Individuales
                </h2>
                <span className="text-xs font-semibold px-2.5 py-1 bg-emerald-50 text-emerald-700 rounded-full">
                  {groupedProperties.individual.length} unidades
                </span>
              </div>
              <PropertyList properties={groupedProperties.individual} readOnly={isLocalDemo && !canManageInventory(currentUser)} />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
