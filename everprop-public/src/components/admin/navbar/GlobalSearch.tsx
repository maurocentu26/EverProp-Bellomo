"use client";

import { useEffect, useMemo, useState, useCallback } from "react";
import { Search, Building2, ArrowRight } from "lucide-react";
import { useRouter } from "next/navigation";
import { leads as sampleLeads, properties as sampleProperties, projects as sampleProjects, type Lead, type Property, type Project } from "@/data/admin-sample";
import { loadLeadList, loadPropertyList, loadProjectList } from "@/lib/admin-storage";
import { SearchPropertyItem } from "../SearchPropertyItem";
import { SearchLeadItem } from "../SearchLeadItem";
import { deferEffectUpdate } from "@/lib/deferred-effect";
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

  useEffect(() => {
    const cancelDeferredUpdate = deferEffectUpdate(() => {
      setAllProperties(loadPropertyList(sampleProperties, "c1"));
      setAllLeads(loadLeadList(sampleLeads, "c1"));
      setAllProjects(loadProjectList(sampleProjects, "c1"));
    });

    // Cerrar buscador con ESC
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === "Escape") setSearchQuery("");
    };
    window.addEventListener("keydown", handleEsc);
    return () => {
      cancelDeferredUpdate();
      window.removeEventListener("keydown", handleEsc);
    };
  }, []);

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
        className="flex h-11 w-full items-center gap-3 rounded-xl border border-slate-200 bg-white px-4 text-left text-sm text-slate-500 shadow-sm transition-colors hover:border-slate-300 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-blue-500/30"
        aria-label="Abrir búsqueda global"
      >
        <Search className="h-5 w-5 shrink-0 text-slate-400" aria-hidden="true" />
        <span className="truncate">Buscar por nombre, dirección, teléfono...</span>
      </button>

      <Dialog
        open={isSearchFocused}
        onOpenChange={(nextOpen) => {
          setIsSearchFocused(nextOpen);
          if (!nextOpen) setSearchQuery("");
        }}
      >
        <DialogContent fullScreen className="flex bg-slate-50" showCloseButton>
          <div className="flex h-dvh min-h-0 w-full flex-col">
            <header className="shrink-0 border-b border-slate-200 bg-white px-4 pb-5 pt-[max(1rem,env(safe-area-inset-top))] sm:px-8 lg:px-12">
              <div className="mx-auto w-full max-w-[min(94vw,2800px)] pr-16">
                <DialogTitle className="text-2xl font-bold text-slate-950 sm:text-3xl">Buscar en EverProp</DialogTitle>
                <DialogDescription className="mt-2 text-base text-slate-600">
                  Encontrá leads, propiedades, unidades o proyectos desde un único lugar.
                </DialogDescription>
                <InputGroup className="mt-5 h-14 border-slate-300 bg-white shadow-sm sm:h-16">
                  <InputGroupAddon>
                    <Search className="h-5 w-5 text-slate-500" aria-hidden="true" />
                  </InputGroupAddon>
                  <InputGroupInput
                    autoFocus
                    value={searchQuery}
                    onChange={(event) => setSearchQuery(event.target.value)}
                    placeholder="Escribí un nombre, dirección, teléfono o proyecto..."
                    className="border-none text-base focus-visible:ring-0 sm:text-lg"
                  />
                </InputGroup>
              </div>
            </header>

            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-6 sm:px-8 sm:py-8 lg:px-12">
              <div className="mx-auto min-h-full w-full max-w-[min(94vw,2800px)]">
                {!normalizedQuery ? (
                  <div className="flex min-h-[55vh] flex-col items-center justify-center rounded-3xl border border-dashed border-slate-300 bg-white p-8 text-center">
                    <div className="flex size-16 items-center justify-center rounded-2xl bg-blue-50 text-blue-600">
                      <Search className="size-8" aria-hidden="true" />
                    </div>
                    <p className="mt-5 text-xl font-bold text-slate-900 sm:text-2xl">¿Qué necesitás encontrar?</p>
                    <p className="mt-2 max-w-2xl text-base leading-7 text-slate-500">
                      Los resultados aparecerán organizados por proyectos, propiedades e interesados.
                    </p>
                  </div>
                ) : hasSearchResults ? (
                  <div className="grid items-start gap-5 lg:grid-cols-3">
                    <section className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
                      <h2 className="mb-4 text-lg font-bold text-slate-900">Proyectos y desarrollos</h2>
                      <div className="space-y-2">
                        {filteredProjects.slice(0, 6).map((project) => (
                          <button
                            key={project.id}
                            type="button"
                            onClick={() => handleSearchSelect("project", project.id)}
                            className="flex min-h-16 w-full items-center gap-3 rounded-2xl border border-transparent p-3 text-left transition-colors hover:border-slate-200 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-blue-500/30"
                          >
                            <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-blue-100 text-blue-700">
                              <Building2 className="size-5" aria-hidden="true" />
                            </span>
                            <span className="min-w-0 flex-1">
                              <span className="block truncate text-base font-bold text-slate-900">{project.name}</span>
                              <span className="block truncate text-sm text-slate-500">
                                {project.type === "land_development" ? "Loteo" : project.type === "building" ? "Edificio" : "Comercial"} · {project.totalUnits} unidades
                              </span>
                            </span>
                          </button>
                        ))}
                        {filteredProjects.length === 0 && <p className="py-8 text-center text-base text-slate-500">Sin proyectos coincidentes.</p>}
                      </div>
                    </section>

                    <section className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
                      <h2 className="mb-4 text-lg font-bold text-slate-900">Propiedades e inventario</h2>
                      <div className="space-y-2">
                        {filteredProperties.slice(0, 8).map((property) => (
                          <SearchPropertyItem
                            key={property.id}
                            property={property}
                            query={normalizedQuery}
                            onSelect={(id) => handleSearchSelect("property", id)}
                          />
                        ))}
                        {filteredProperties.length === 0 && <p className="py-8 text-center text-base text-slate-500">Sin propiedades coincidentes.</p>}
                        {filteredProperties.length > 8 && (
                          <button
                            type="button"
                            onClick={() => {
                              setIsSearchFocused(false);
                              setSearchQuery("");
                              router.push("/admin#properties");
                            }}
                            className="flex min-h-12 w-full items-center justify-center gap-2 rounded-xl border border-blue-200 bg-blue-50 px-4 text-base font-bold text-blue-700"
                          >
                            Ver todos ({filteredProperties.length}) <ArrowRight className="size-5" aria-hidden="true" />
                          </button>
                        )}
                      </div>
                    </section>

                    <section className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
                      <h2 className="mb-4 text-lg font-bold text-slate-900">Interesados</h2>
                      <div className="space-y-2">
                        {filteredLeads.slice(0, 8).map((lead) => (
                          <SearchLeadItem
                            key={lead.id}
                            lead={lead}
                            query={normalizedQuery}
                            onSelect={(id) => handleSearchSelect("lead", id)}
                          />
                        ))}
                        {filteredLeads.length === 0 && <p className="py-8 text-center text-base text-slate-500">Sin interesados coincidentes.</p>}
                        {filteredLeads.length > 8 && (
                          <button
                            type="button"
                            onClick={() => {
                              setIsSearchFocused(false);
                              setSearchQuery("");
                              router.push("/admin#leads");
                            }}
                            className="flex min-h-12 w-full items-center justify-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 text-base font-bold text-emerald-700"
                          >
                            Ver todos ({filteredLeads.length}) <ArrowRight className="size-5" aria-hidden="true" />
                          </button>
                        )}
                      </div>
                    </section>
                  </div>
                ) : (
                  <div className="flex min-h-[55vh] flex-col items-center justify-center rounded-3xl border border-dashed border-slate-300 bg-white p-8 text-center">
                    <Search className="size-12 text-slate-300" aria-hidden="true" />
                    <p className="mt-5 text-xl font-bold text-slate-900">No encontramos resultados</p>
                    <p className="mt-2 text-base text-slate-500">Intentá con otros términos.</p>
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
