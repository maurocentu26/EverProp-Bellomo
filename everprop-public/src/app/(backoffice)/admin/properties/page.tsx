"use client";

import { useState, useMemo, useEffect, useRef } from "react";
import PropertyList from "@/components/admin/PropertyList";
import { Button } from "@/components/ui/button";
import { AlertTriangle, Download, Plus, Map, Building2, RotateCcw, Database, FlaskConical, ChevronDown } from "lucide-react";
import Link from "next/link";
import { type Project, type Property, properties as sampleProperties, projects as sampleProjects } from "@/data/admin-sample";
import { loadPropertyList, loadProjectList } from "@/lib/admin-storage";
import { cn } from "@/lib/utils";
import { isInvalidEverpropSession, loadEverpropCatalog } from "@/lib/everprop-api";
import { canManageInventory } from "@/lib/demo-permissions";
import { useAuth } from "@/lib/auth-context";
import { isMockDataMode } from "@/lib/data-mode";
import { useCurrentSession } from "@/hooks/use-current-session";

import { isLocalDemo, demoCatalog } from "@/lib/demo-catalog";

type DataState =
  | { status: "loading" }
  | { status: "ready"; source: "admin-api" | "mock" }
  | { status: "error"; message: string };

const statusFilters = [
  { id: "all", label: "Todos" },
  { id: "available", label: "Disponibles" },
  { id: "reserved", label: "No Vendibles / Reserva" },
  { id: "sold", label: "Vendidos" },
] as const;

export default function AllPropertiesPage() {
  const { invalidateSession, currentUser } = useAuth();
  const { isAdvisor } = useCurrentSession();
  const [allProperties, setAllProperties] = useState<Property[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [dataState, setDataState] = useState<DataState>({ status: "loading" });
  const [attempt, setAttempt] = useState(0);
  const [search, setSearch] = useState("");

  // Filters
  const [selectedProjectId, setSelectedProjectId] = useState<string>("all");
  const [activeStatus, setActiveStatus] = useState<"all" | "available" | "reserved" | "sold">("all");
  const [selectedManzana, setSelectedManzana] = useState<string>("all");

  const [openFilter, setOpenFilter] = useState<'proyecto' | 'estado' | 'manzana' | null>(null);
  const filterRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (filterRef.current && !filterRef.current.contains(event.target as Node)) {
        setOpenFilter(null);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);

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
    const refresh = () => { void loadData(); };
    window.addEventListener("demo-inventory-updated", refresh);
    window.addEventListener("focus", refresh);
    const timer = isLocalDemo ? window.setInterval(refresh, 3000) : null;
    return () => {
      window.removeEventListener("demo-inventory-updated", refresh);
      window.removeEventListener("focus", refresh);
      if (timer) clearInterval(timer);
      active = false;
    };
  }, [attempt, invalidateSession]);

  const availableManzanas = useMemo(() => {
    const pool = selectedProjectId === "all"
      ? allProperties
      : allProperties.filter(p => p.projectId === selectedProjectId);
    const set = new Set<string>();
    pool.forEach(p => {
      if (p.sectorName) set.add(p.sectorName);
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  }, [allProperties, selectedProjectId]);

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

    // 3. Manzana Filter
    if (selectedManzana !== "all") {
      filtered = filtered.filter(p => p.sectorName === selectedManzana);
    }

    return filtered;
  }, [allProperties, selectedProjectId, activeStatus, selectedManzana, search]);

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
        <strong>Demo local conectada a Bellomito.</strong> {canManageInventory(currentUser) ? "Publicá, ocultá o editá cada propiedad desde su fila. Aparece en la sección existente de Comercializadora." : "Tu perfil permite consultar propiedades. Administración e Ingeniería gestionan su publicación."}

      </div>}
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-slate-900 dark:text-slate-100 tracking-tight">Propiedades e Inventario</h1>
          <p className="mt-1 text-slate-500 dark:text-slate-400 text-sm">Gestioná todos los activos, lotes y proyectos en cartera.</p>
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
          ? "border-emerald-200 bg-emerald-50 text-emerald-950 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-200"
          : "border-amber-200 bg-amber-50 text-amber-950 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200",
      )}>
        {dataState.source === "admin-api" ? (
          <Database className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" aria-hidden="true" />
        ) : (
          <FlaskConical className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" aria-hidden="true" />
        )}
        <p>
          {dataState.source === "admin-api"
            ? `Inventario real conectado a la base de datos (${allProperties.length} activos en cartera). Modo interactivo habilitado: podés abrir cada ficha, consultar datos y actualizar estados.`
            : isLocalDemo ? "Catálogo demo guardado en esta computadora y compartido con la web de Bellomito." : "QA visual mock: inventario de muestra local, sin confirmación de la API."}
        </p>
      </div>

      {/* Control Panel / Filtros */}
      <div className="bg-white dark:bg-card p-4 rounded-2xl border border-slate-200 dark:border-border shadow-sm flex flex-wrap gap-2 items-center relative" ref={filterRef}>
        {/* Desarrollo Chip */}
        <div className="relative">
          <button
            onClick={() => setOpenFilter(openFilter === 'proyecto' ? null : 'proyecto')}
            className={cn(
              "flex items-center gap-1",
              selectedProjectId === "all"
                ? "px-3 py-1.5 rounded-lg border border-slate-200 bg-white text-xs font-semibold text-slate-700 hover:bg-slate-50 dark:bg-slate-900 dark:border-slate-800 dark:text-slate-300 dark:hover:bg-slate-800 shadow-sm cursor-pointer"
                : "px-3 py-1.5 rounded-lg border border-blue-200 bg-blue-50 text-xs font-bold text-blue-700 dark:bg-blue-950/80 dark:border-blue-800 dark:text-blue-300 shadow-sm cursor-pointer"
            )}
          >
            Desarrollo: {selectedProjectId === 'all' ? 'Todos' : projects.find(p => p.id === selectedProjectId)?.name || 'Todos'} <ChevronDown className="h-3.5 w-3.5 ml-1" />
          </button>
          {openFilter === 'proyecto' && (
            <div className="absolute z-50 mt-1 min-w-[180px] rounded-xl border border-slate-200 bg-white shadow-lg dark:bg-slate-900 dark:border-slate-800 p-1">
              <button
                onClick={() => { setSelectedProjectId('all'); setOpenFilter(null); }}
                className={cn(
                  "px-3 py-2 rounded-lg text-xs font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer w-full text-left",
                  selectedProjectId === 'all' && "font-bold text-blue-700 dark:text-blue-300 bg-blue-50/50 dark:bg-blue-950/30"
                )}
              >
                Todos
              </button>
              {projects.map(p => (
                <button
                  key={p.id}
                  onClick={() => { setSelectedProjectId(p.id); setOpenFilter(null); }}
                  className={cn(
                    "px-3 py-2 rounded-lg text-xs font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer w-full text-left",
                    selectedProjectId === p.id && "font-bold text-blue-700 dark:text-blue-300 bg-blue-50/50 dark:bg-blue-950/30"
                  )}
                >
                  {p.name}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Estado Chip */}
        <div className="relative">
          <button
            onClick={() => setOpenFilter(openFilter === 'estado' ? null : 'estado')}
            className={cn(
              "flex items-center gap-1",
              activeStatus === "all"
                ? "px-3 py-1.5 rounded-lg border border-slate-200 bg-white text-xs font-semibold text-slate-700 hover:bg-slate-50 dark:bg-slate-900 dark:border-slate-800 dark:text-slate-300 dark:hover:bg-slate-800 shadow-sm cursor-pointer"
                : "px-3 py-1.5 rounded-lg border border-blue-200 bg-blue-50 text-xs font-bold text-blue-700 dark:bg-blue-950/80 dark:border-blue-800 dark:text-blue-300 shadow-sm cursor-pointer"
            )}
          >
            Estado: {statusFilters.find(s => s.id === activeStatus)?.label || 'Todos'} <ChevronDown className="h-3.5 w-3.5 ml-1" />
          </button>
          {openFilter === 'estado' && (
            <div className="absolute z-50 mt-1 min-w-[180px] rounded-xl border border-slate-200 bg-white shadow-lg dark:bg-slate-900 dark:border-slate-800 p-1">
              {statusFilters.map(tab => (
                <button
                  key={tab.id}
                  onClick={() => { setActiveStatus(tab.id); setOpenFilter(null); }}
                  className={cn(
                    "px-3 py-2 rounded-lg text-xs font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer w-full text-left",
                    activeStatus === tab.id && "font-bold text-blue-700 dark:text-blue-300 bg-blue-50/50 dark:bg-blue-950/30"
                  )}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Manzana Chip */}
        <div className="relative">
          <button
            onClick={() => setOpenFilter(openFilter === 'manzana' ? null : 'manzana')}
            className={cn(
              "flex items-center gap-1",
              selectedManzana === "all"
                ? "px-3 py-1.5 rounded-lg border border-slate-200 bg-white text-xs font-semibold text-slate-700 hover:bg-slate-50 dark:bg-slate-900 dark:border-slate-800 dark:text-slate-300 dark:hover:bg-slate-800 shadow-sm cursor-pointer"
                : "px-3 py-1.5 rounded-lg border border-blue-200 bg-blue-50 text-xs font-bold text-blue-700 dark:bg-blue-950/80 dark:border-blue-800 dark:text-blue-300 shadow-sm cursor-pointer"
            )}
          >
            Mz: {selectedManzana === 'all' ? 'Todas' : selectedManzana.replace(/manzana\s*/i, "Mz ")} <ChevronDown className="h-3.5 w-3.5 ml-1" />
          </button>
          {openFilter === 'manzana' && (
            <div className="absolute z-50 mt-1 min-w-[180px] rounded-xl border border-slate-200 bg-white shadow-lg dark:bg-slate-900 dark:border-slate-800 p-1 max-h-60 overflow-y-auto">
              <button
                onClick={() => { setSelectedManzana('all'); setOpenFilter(null); }}
                className={cn(
                  "px-3 py-2 rounded-lg text-xs font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer w-full text-left",
                  selectedManzana === 'all' && "font-bold text-blue-700 dark:text-blue-300 bg-blue-50/50 dark:bg-blue-950/30"
                )}
              >
                Todas
              </button>
              {availableManzanas.map(m => (
                <button
                  key={m}
                  onClick={() => { setSelectedManzana(m); setOpenFilter(null); }}
                  className={cn(
                    "px-3 py-2 rounded-lg text-xs font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer w-full text-left",
                    selectedManzana === m && "font-bold text-blue-700 dark:text-blue-300 bg-blue-50/50 dark:bg-blue-950/30"
                  )}
                >
                  {m.replace(/manzana\s*/i, "Mz ")}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Clear Filters Button */}
        {(selectedProjectId !== "all" || activeStatus !== "all" || selectedManzana !== "all") && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setSelectedProjectId("all");
              setActiveStatus("all");
              setSelectedManzana("all");
            }}
            className="text-xs text-rose-600 hover:bg-rose-50 hover:text-rose-700 dark:text-rose-400 dark:hover:bg-rose-950/30 font-semibold gap-1.5"
          >
            <RotateCcw className="h-3.5 w-3.5" /> Limpiar
          </Button>
        )}
      </div>

      {/* Content Rendering */}
      {filteredProperties.length === 0 ? (
        <div className="rounded-3xl border border-dashed border-slate-300 dark:border-slate-800 bg-white dark:bg-card px-6 py-14 text-center">
          <Building2 className="mx-auto h-10 w-10 text-slate-300 dark:text-slate-600" aria-hidden="true" />
          <h2 className="mt-4 text-lg font-bold text-slate-900 dark:text-slate-100">No hay propiedades para mostrar</h2>
          <p className="mx-auto mt-2 max-w-xl text-sm text-slate-500 dark:text-slate-400">
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
                <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-2">
                  <h2 className="text-2xl font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2">
                    <Map className="h-6 w-6 text-blue-600 dark:text-blue-400" /> {proj?.name || "Proyecto"}
                  </h2>
                  <span className="text-xs font-semibold px-2.5 py-1 bg-blue-50 text-blue-700 dark:bg-blue-950/80 dark:text-blue-300 rounded-full">
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
              <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-2">
                <h2 className="text-2xl font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2">
                  <Building2 className="h-6 w-6 text-emerald-600 dark:text-emerald-400" /> Propiedades Individuales
                </h2>
                <span className="text-xs font-semibold px-2.5 py-1 bg-emerald-50 text-emerald-700 dark:bg-emerald-950/80 dark:text-emerald-300 rounded-full">
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
