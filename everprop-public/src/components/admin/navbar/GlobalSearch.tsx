"use client";

import { useEffect, useMemo, useState, useCallback } from "react";
import { Search, Building2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { leads as sampleLeads, properties as sampleProperties, projects as sampleProjects, type Lead, type Property, type Project } from "@/data/admin-sample";
import { loadLeadList, loadPropertyList, loadProjectList } from "@/lib/admin-storage";
import { SearchPropertyItem } from "../SearchPropertyItem";
import { SearchLeadItem } from "../SearchLeadItem";
import { isMockDataMode } from "@/lib/data-mode";
import { loadEverpropLeads, loadEverpropCatalog } from "@/lib/everprop-api";
import { useCurrentSession } from "@/hooks/use-current-session";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";

import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "@/components/ui/input-group";

export function GlobalSearch() {
  const router = useRouter();
  const [searchQuery, setSearchQuery] = useState("");
  const [allProperties, setAllProperties] = useState<Property[]>([]);
  const [allLeads, setAllLeads] = useState<Lead[]>([]);
  const [allProjects, setAllProjects] = useState<Project[]>([]);
  const [isSearchFocused, setIsSearchFocused] = useState(false);

  const { user, isAdvisor, isEngineer } = useCurrentSession();
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState("");
  useEffect(() => {
    if (!isSearchFocused) return;
    let active = true;
    setAllLeads([]); setAllProperties([]); setAllProjects([]);
    setLoading(true); setLoadError("");
    if (isMockDataMode) {
      setAllProperties(loadPropertyList(sampleProperties, "c1"));
      const rows = loadLeadList(sampleLeads, "c1");
      setAllLeads(isEngineer ? [] : isAdvisor ? rows.filter(l => l.agentId === user?.id) : rows);
      setAllProjects(loadProjectList(sampleProjects, "c1"));
      setLoading(false);
    } else {
      Promise.all([isEngineer ? Promise.resolve([]) : loadEverpropLeads(), loadEverpropCatalog()])
        .then(([leads, catalog]) => {
          if (!active) return;
          setAllLeads(leads); setAllProperties(catalog.properties); setAllProjects(catalog.projects);
        }).catch(() => { if (active) setLoadError("No pudimos cargar la búsqueda. Cerrá y volvé a intentar."); })
        .finally(() => { if (active) setLoading(false); });
    }
    return () => { active = false; };
  }, [isSearchFocused, user?.id, isAdvisor, isEngineer]);

  const normalizedQuery = searchQuery.trim().toLowerCase();

  // Algoritmo de búsqueda para Proyectos
  const filteredProjects = useMemo(() => {
    if (!normalizedQuery) return [];
    return allProjects.filter((p) => p.name.toLowerCase().includes(normalizedQuery));
  }, [allProjects, normalizedQuery]);

  // Algoritmo de búsqueda para Propiedades y Unidades
  const filteredProperties = useMemo(() => {
    if (!normalizedQuery) return [];
    return allProperties.filter((p) => {
      const matchesProp = p.title.toLowerCase().includes(normalizedQuery) ||
                          p.neighborhood.toLowerCase().includes(normalizedQuery) ||
                          p.city.toLowerCase().includes(normalizedQuery) ||
                          p.sectorName?.toLowerCase().includes(normalizedQuery) ||
                          p.unitNumber?.toLowerCase().includes(normalizedQuery);
      
      // Also match if the parent project matches the query (so searching "Barrio" shows its lots)
      const parentProject = p.projectId ? allProjects.find(proj => proj.id === p.projectId) : null;
      const matchesProject = parentProject ? parentProject.name.toLowerCase().includes(normalizedQuery) : false;
      
      return matchesProp || matchesProject;
    });
  }, [allProperties, allProjects, normalizedQuery]);

  // Algoritmo de búsqueda para Leads
  const filteredLeads = useMemo(() => {
    if (!normalizedQuery) return [];
    return allLeads.filter((l) => 
      l.name.toLowerCase().includes(normalizedQuery) ||
      l.email?.toLowerCase().includes(normalizedQuery) ||
      l.phone?.includes(normalizedQuery)
    );
  }, [allLeads, normalizedQuery]);

  const hasSearchResults = filteredProperties.length > 0 || filteredLeads.length > 0 || filteredProjects.length > 0;

  const handleSearchSelect = useCallback((type: "property" | "lead" | "project", id: string) => {
    setSearchQuery("");
    setIsSearchFocused(false);
    if (type === "property") {
      router.push(`/admin/properties/${id}`);
    } else if (type === "project") {
      router.push(`/admin/desarrollos/${id}`);
    } else {
      router.push(`/admin/leads/${id}`);
    }
  }, [router]);

  return (
    <>
      <button
        type="button"
        onClick={() => setIsSearchFocused(true)}
        className="flex h-9 sm:h-10 w-full items-center gap-2.5 rounded-xl border border-slate-200 bg-white px-3 sm:px-4 text-left text-xs sm:text-sm text-slate-500 shadow-2xs transition-colors hover:border-slate-300 hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/30 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400 dark:hover:border-slate-700 dark:hover:bg-slate-800/60"
        aria-label="Abrir búsqueda global"
      >
        <Search className="h-4 w-4 sm:h-4.5 sm:w-4.5 shrink-0 text-slate-400" aria-hidden="true" />
        <span className="truncate"><span className="sm:hidden">Buscar…</span><span className="hidden sm:inline">Buscar leads, propiedades o proyectos…</span></span>
      </button>

      <Dialog
        open={isSearchFocused}
        onOpenChange={(nextOpen) => {
          setIsSearchFocused(nextOpen);
          if (!nextOpen) setSearchQuery("");
        }}
      >
        <DialogContent fullScreen className="admin-workspace flex bg-slate-50 dark:bg-slate-950" showCloseButton>
          <div className="flex h-dvh min-h-0 w-full flex-col">
            <header className="shrink-0 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-card px-4 pb-5 pt-[max(1rem,env(safe-area-inset-top))] sm:px-8 lg:px-12">
              <div className="mx-auto w-full max-w-[min(94vw,2800px)]">
                <DialogTitle className="pr-14 text-2xl font-bold text-slate-950 dark:text-slate-100 sm:text-3xl">Buscar en Bellomo</DialogTitle>
                <DialogDescription className="mt-2 text-base text-slate-600 dark:text-slate-400">
                  Encontrá leads, propiedades, unidades o proyectos desde un único lugar.
                </DialogDescription>
                <InputGroup className="mt-5 h-14 border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-sm sm:h-16">
                  <InputGroupAddon>
                    <Search className="h-5 w-5 text-slate-500 dark:text-slate-400" aria-hidden="true" />
                  </InputGroupAddon>
                  <InputGroupInput
                    autoFocus
                    value={searchQuery}
                    onChange={(event) => setSearchQuery(event.target.value)}
                    aria-label="Buscar leads, propiedades o proyectos"
                    placeholder="Nombre, teléfono o inmueble…"
                    className="border-none text-base focus-visible:ring-0 sm:text-lg dark:text-slate-100"
                  />
                </InputGroup>
              </div>
            </header>

            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-6 sm:px-8 sm:py-8 lg:px-12">
              <div className="mx-auto min-h-full w-full max-w-[min(94vw,2800px)]">
                {loading ? <p role="status">Cargando datos…</p> : loadError ? <p role="alert" className="text-red-600">{loadError}</p> : !normalizedQuery ? (
                  <div className="flex min-h-[55vh] flex-col items-center justify-center rounded-3xl border border-dashed border-slate-300 dark:border-slate-800 bg-white dark:bg-card p-8 text-center">
                    <div className="flex size-16 items-center justify-center rounded-2xl bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400">
                      <Search className="size-8" aria-hidden="true" />
                    </div>
                    <p className="mt-5 text-xl font-bold text-slate-900 dark:text-slate-100 sm:text-2xl">¿Qué necesitás encontrar?</p>
                    <p className="mt-2 max-w-2xl text-base leading-7 text-slate-500 dark:text-slate-400">
                      Los resultados aparecerán organizados por proyectos, propiedades e interesados.
                    </p>
                  </div>
                ) : hasSearchResults ? (
                  <div className="grid items-start gap-5 lg:grid-cols-3">
                    {filteredProjects.length > 0 && <section className="rounded-3xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-card p-4 shadow-sm sm:p-6">
                      <h2 className="mb-4 text-lg font-bold text-slate-900 dark:text-slate-100">Proyectos y desarrollos</h2>
                      <div className="space-y-2">
                        {filteredProjects.map((project) => (
                          <button
                            key={project.id}
                            type="button"
                            onClick={() => handleSearchSelect("project", project.id)}
                            className="flex min-h-16 w-full items-center gap-3 rounded-2xl border border-transparent p-3 text-left transition-colors hover:border-slate-200 dark:hover:border-slate-700 hover:bg-muted dark:hover:bg-slate-800/60 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-blue-500/30"
                          >
                            <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-blue-100 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300">
                              <Building2 className="size-5" aria-hidden="true" />
                            </span>
                            <span className="min-w-0 flex-1">
                              <span className="block break-words text-base font-bold text-slate-900 dark:text-slate-100">{project.name}</span>
                              <span className="block truncate text-sm text-slate-500 dark:text-slate-400">
                                {project.type === "land_development" ? "Loteo" : project.type === "building" ? "Edificio" : "Comercial"} · {project.location.city}
                              </span>
                            </span>
                          </button>
                        ))}
                        {filteredProjects.length === 0 && <p className="py-8 text-center text-base text-slate-500 dark:text-slate-400">Sin proyectos coincidentes.</p>}
                      </div>
                    </section>}

                    {filteredProperties.length > 0 && <section className="rounded-3xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-card p-4 shadow-sm sm:p-6">
                      <h2 className="mb-4 text-lg font-bold text-slate-900 dark:text-slate-100">Propiedades e inventario</h2>
                      <div className="space-y-2">
                        {filteredProperties.map((property) => (
                          <SearchPropertyItem
                            key={property.id}
                            property={property}
                            query={normalizedQuery}
                            onSelect={(id) => handleSearchSelect("property", id)}
                          />
                        ))}
                        {filteredProperties.length === 0 && <p className="py-8 text-center text-base text-slate-500 dark:text-slate-400">Sin propiedades coincidentes.</p>}

                      </div>
                    </section>}

                    {filteredLeads.length > 0 && <section className="rounded-3xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-card p-4 shadow-sm sm:p-6">
                      <h2 className="mb-4 text-lg font-bold text-slate-900 dark:text-slate-100">Interesados</h2>
                      <div className="space-y-2">
                        {filteredLeads.map((lead) => (
                          <SearchLeadItem
                            key={lead.id}
                            lead={lead}
                            query={normalizedQuery}
                            onSelect={(id) => handleSearchSelect("lead", id)}
                          />
                        ))}
                        {filteredLeads.length === 0 && <p className="py-8 text-center text-base text-slate-500 dark:text-slate-400">Sin interesados coincidentes.</p>}

                      </div>
                    </section>}
                  </div>
                ) : (
                  <div className="flex min-h-[55vh] flex-col items-center justify-center rounded-3xl border border-dashed border-slate-300 dark:border-slate-800 bg-white dark:bg-card p-8 text-center">
                    <Search className="size-12 text-slate-300 dark:text-slate-600" aria-hidden="true" />
                    <p className="mt-5 text-xl font-bold text-slate-900 dark:text-slate-100">No encontramos resultados</p>
                    <p className="mt-2 text-base text-slate-500 dark:text-slate-400">Intentá con otros términos.</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
