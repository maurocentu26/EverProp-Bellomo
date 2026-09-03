"use client";

import { useState, useMemo, useEffect } from "react";
import { type Project, type Property, projects as sampleProjects, properties as sampleProperties } from "@/data/admin-sample";
import { loadProjectList, loadPropertyList } from "@/lib/admin-storage";
import { isMockDataMode } from "@/lib/data-mode";
import { loadEverpropCatalog } from "@/lib/everprop-api";
import { deferEffectUpdate } from "@/lib/deferred-effect";

import ProjectsOverviewWidget from "./dashboard-widgets/ProjectsOverviewWidget";
import GlobalInventoryWidget from "./dashboard-widgets/GlobalInventoryWidget";
import CommercialHeatmapWidget from "./dashboard-widgets/CommercialHeatmapWidget";

export default function EnterpriseDashboard({ companyId = "c1" }: { companyId?: string }) {
  const [projects, setProjects] = useState<Project[]>([]);
  const [properties, setProperties] = useState<Property[]>([]);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    let active = true;
    async function loadData() {
      if (!isMockDataMode) {
        try {
          const catalog = await loadEverpropCatalog();
          if (!active) return;
          setProjects(catalog.projects);
          setProperties(catalog.properties);
          setHydrated(true);
          return;
        } catch (e) {
          console.error("Error loading enterprise dashboard:", e);
        }
      }
      if (!active) return;
      setProjects(loadProjectList(sampleProjects, companyId));
      setProperties(loadPropertyList(sampleProperties, companyId));
      setHydrated(true);
    }
    void loadData();
    return () => {
      active = false;
    };
  }, [companyId]);

  // Widgets data logic
  const activeProjects = projects.filter(p => p.type !== 'commercial');
  
  // Inventory Matrix logic: filter properties that are land/lotes
  const loteos = properties.filter(p => p.propertyType === 'Lote' || p.sectorName?.toLowerCase().includes('manzana') || p.title.toLowerCase().includes('lote'));
  
  // Group by projectId for Matrix (Task 5)
  const inventoryByProject = useMemo(() => {
    const groups: Record<string, Property[]> = {};
    loteos.forEach(p => {
      const pId = p.projectId || 'unassigned';
      if (!groups[pId]) groups[pId] = [];
      groups[pId].push(p);
    });
    return groups;
  }, [loteos]);

  // Commercial properties (Task 3: we will slice in render)
  const commercials = properties.filter(p => ['Local', 'Cochera', 'Oficina'].includes(p.propertyType) || p.commercialFeatures || p.isCovered !== undefined);

  if (!hydrated) {
    return (
      <div className="space-y-8 animate-pulse">
        <div className="h-64 bg-slate-100 rounded-2xl w-full" />
        <div className="h-64 bg-slate-100 rounded-2xl w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* 1. Construction Progress Widget */}
      <ProjectsOverviewWidget activeProjects={activeProjects} />

      {/* 2. Inventory Matrix */}
      <GlobalInventoryWidget inventoryByProject={inventoryByProject} projects={projects} />

      {/* 3. Commercial Heatmap */}
      <CommercialHeatmapWidget commercials={commercials} projects={projects} />
    </div>
  );
}
