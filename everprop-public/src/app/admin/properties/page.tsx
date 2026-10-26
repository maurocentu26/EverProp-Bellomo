"use client";

import { useState, useMemo, useEffect, useRef } from "react";
import PropertyList from "@/components/admin/PropertyList";
import { Button } from "@/components/ui/button";
import { AlertTriangle, Plus, Building2, RotateCcw } from "lucide-react";
import Link from "next/link";
import { type Project, type Property, properties as sampleProperties, projects as sampleProjects } from "@/data/admin-sample";
import { loadPropertyList, loadProjectList } from "@/lib/admin-storage";
import { isInvalidEverpropSession, loadEverpropPropertiesPage, loadEverpropProjects } from "@/lib/everprop-api";
import { useAuth } from "@/lib/auth-context";
import { isMockDataMode } from "@/lib/data-mode";
import { useCurrentSession } from "@/hooks/use-current-session";

type DataState =
  | { status: "loading" }
  | { status: "ready"; source: "admin-api" | "mock" }
  | { status: "error"; message: string };

const statusFilters = [
  { id: "all", label: "Todos" },
  { id: "available", label: "Disponibles" },
  { id: "reserved", label: "Reservados" },
  { id: "sold", label: "Vendidos" },
  { id: "rented", label: "Alquilados" },
  { id: "not_sellable", label: "No vendibles" },
  { id: "not_marketed", label: "No comercializados" },
  { id: "unknown", label: "Sin estado informado" },
] as const;
const typeFilters = [
  { id: 'LOT', label: 'Lotes', type: 'Lote' },
  { id: 'APARTMENT', label: 'Departamentos', type: 'Departamento' },
  { id: 'LOCAL', label: 'Locales', type: 'Local' },
  { id: 'GARAGE', label: 'Cocheras', type: 'Cochera' },
  { id: 'HOUSE', label: 'Casas', type: 'Casa' },
];

export default function AllPropertiesPage() {
  const { invalidateSession } = useAuth();
  const { isAdvisor } = useCurrentSession();
  const [allProperties, setAllProperties] = useState<Property[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [dataState, setDataState] = useState<DataState>({ status: "loading" });
  const [attempt, setAttempt] = useState(0);
  const [page, setPage] = useState(1);
  const [isLoadingMore, setIsLoadingMore] = useState(false);

  // Filters
  const [selectedProjectId, setSelectedProjectId] = useState<string>("all");
  const [activeStatus, setActiveStatus] = useState<string>("all");
  const [selectedManzana, setSelectedManzana] = useState<string>("all");
  
  const [selectedType, setSelectedType] = useState("all");
  const [selectedOperation, setSelectedOperation] = useState("all");
  const [loadMoreError, setLoadMoreError] = useState("");
  const [hasMore, setHasMore] = useState(true);
  const requestVersion = useRef(0);
  const loadingMore = useRef(false);

  useEffect(() => {
    let active = true;
    requestVersion.current += 1;
    loadingMore.current = false;
    setIsLoadingMore(false);
    setLoadMoreError("");
    setDataState({ status: "loading" });

    async function loadData() {
      if (isMockDataMode) {
        await Promise.resolve();
        if (!active) return;
        setAllProperties(loadPropertyList(sampleProperties, "c1"));
        setProjects(loadProjectList(sampleProjects, "c1"));
        setDataState({ status: "ready", source: "mock" });
        return;
      }

      try {
        const [props, fetchedProjects] = await Promise.all([
          loadEverpropPropertiesPage(1, { projectId: selectedProjectId, status: activeStatus, category: selectedType, operation: selectedOperation }),
          loadEverpropProjects()
        ]);
        
        if (!active) return;
        setAllProperties(props);
        setProjects(fetchedProjects);
        setHasMore(props.length === 100);
        setPage(1);
        setDataState({ status: "ready", source: "admin-api" });
      } catch (reason) {
        if (isInvalidEverpropSession(reason)) {
          invalidateSession();
          return;
        }
        if (!active) return;
        setDataState({ status: "error", message: String(reason) });
      }
    }

    loadData();
    return () => {
      active = false;
    };
  }, [attempt, selectedProjectId, activeStatus, selectedType, selectedOperation, invalidateSession]);

  const availableManzanas = useMemo(() => {
    const set = new Set<string>();
    // Locally extract manzanas from currently loaded properties
    allProperties.forEach(p => {
      if (p.sectorName) set.add(p.sectorName);
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  }, [allProperties]);

  const filteredProperties = useMemo(() => {
    let filtered = allProperties;
    if (isMockDataMode && selectedProjectId !== "all") filtered = filtered.filter(p => p.projectId === selectedProjectId);
    if (isMockDataMode && activeStatus !== "all") filtered = filtered.filter(p => p.status === activeStatus);
    if (selectedType !== "all" && (isMockDataMode || !typeFilters.some(type => type.id === selectedType))) filtered = filtered.filter(p => p.propertyType === (typeFilters.find(type => type.id === selectedType)?.type ?? selectedType));
    if (isMockDataMode && selectedOperation !== "all") filtered = filtered.filter(p => p.operation === selectedOperation);

    if (selectedManzana !== "all") {
      filtered = filtered.filter(p => p.sectorName === selectedManzana);
    }

    return filtered;
  }, [allProperties, selectedManzana, selectedType, selectedOperation, selectedProjectId, activeStatus]);

  const handleLoadMore = async () => {
    if (loadingMore.current) return;
    loadingMore.current = true;
    const version = requestVersion.current;
    setIsLoadingMore(true);
    setLoadMoreError("");
    try {
      const nextPage = page + 1;
      const newProps = await loadEverpropPropertiesPage(nextPage, { projectId: selectedProjectId, status: activeStatus, category: selectedType, operation: selectedOperation });
      if (version !== requestVersion.current) return;
      setHasMore(newProps.length === 100);
      if (newProps.length === 0) return;
      setAllProperties(prev => [...prev, ...newProps]);
      setPage(nextPage);
    } catch (e) {
      if (version !== requestVersion.current) return;
      if (isInvalidEverpropSession(e)) invalidateSession();
      else setLoadMoreError("No se pudieron cargar más unidades. Reintentá.");
    } finally {
      if (version === requestVersion.current) { loadingMore.current = false; setIsLoadingMore(false); }
    }
  };

  if (dataState.status === "loading") return <div className="h-96 animate-pulse bg-slate-100 rounded-3xl" role="status" aria-label="Cargando activos" />;

  if (dataState.status === "error") {
    return (
      <section className="inventory-view rounded-3xl border border-rose-200 bg-card p-6 shadow-sm" role="alert">
        <div className="flex items-start gap-3">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-rose-600" aria-hidden="true" />
          <div>
            <h1 className="text-xl font-bold text-foreground">No se pudo cargar el inventario</h1>
            <p className="mt-2 text-sm text-slate-600">No pudimos actualizar las unidades. Volvé a intentar.</p>
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
    <div className="inventory-view max-w-[1400px] mx-auto space-y-6 pb-10">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div><h1>Activos &amp; Unidades</h1><p>Precio y disponibilidad de cada unidad.</p></div>
        {!isAdvisor && <Link className="inventory-cta" href="/admin/properties/new"><Plus aria-hidden="true" size={20} />Nuevo activo</Link>}
      </header>
      <section aria-label="Filtros de activos" className="inventory-filters">
        <label>Proyecto<select value={selectedProjectId} onChange={e => setSelectedProjectId(e.target.value)}><option value="all">Todos</option>{projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label>
        <label>Tipo<select value={selectedType} onChange={e => setSelectedType(e.target.value)}><option value="all">Todos</option>{typeFilters.map(type => <option key={type.id} value={type.id}>{type.label}</option>)}{Array.from(new Set(allProperties.map(p => p.propertyType))).filter(type => !typeFilters.some(filter => filter.type === type)).sort().map(type => <option key={type}>{type}</option>)}</select></label>
        <label>Operación<select value={selectedOperation} onChange={e => setSelectedOperation(e.target.value)}><option value="all">Todas</option><option value="sale">Venta</option><option value="rent">Alquiler</option><option value="temporal">Temporal</option><option value="leasing">Leasing</option><option value="unknown">Sin operación informada</option></select></label>
        <label>Disponibilidad<select value={activeStatus} onChange={e => setActiveStatus(e.target.value as typeof activeStatus)}>{statusFilters.map(status => <option key={status.id} value={status.id}>{status.label}</option>)}</select></label>
        <label>Manzana o sector<select value={selectedManzana} onChange={e => setSelectedManzana(e.target.value)}><option value="all">Todas</option>{availableManzanas.map(m => <option key={m}>{m}</option>)}</select></label>
        <Button variant="outline" onClick={() => {setSelectedProjectId('all'); setSelectedType('all'); setSelectedOperation('all'); setActiveStatus('all'); setSelectedManzana('all');}}><RotateCcw aria-hidden="true" size={20} />Limpiar filtros</Button>
      </section>
      <p>{filteredProperties.length.toLocaleString('es-AR')} {filteredProperties.length === 1 ? 'unidad' : 'unidades'}</p>
      {filteredProperties.length ? <PropertyList properties={filteredProperties} projects={projects} /> : <section className="inventory-empty"><Building2 aria-hidden="true" size={32} /><h2>No hay unidades para mostrar</h2><p>Revisá los filtros o cargá más unidades del inventario.</p></section>}
      {loadMoreError && <p role="alert">{loadMoreError}</p>}
      {!isMockDataMode && hasMore && <Button variant="outline" onClick={handleLoadMore} disabled={isLoadingMore}>{isLoadingMore ? 'Cargando…' : 'Cargar más activos'}</Button>}
    </div>
  );
}
