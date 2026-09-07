"use client";
import { demoPropertyImage } from "@/lib/demo-property-image";
import { useEffect, useState } from "react";
import type { Project } from "@/data/bellomo";
import type { DemoProperty } from "@/lib/demo-catalog";

export type CommercialCard = Project & { inventory?: DemoProperty };
export function usePublicInventory(projects: Project[]) {
  const [properties, setProperties] = useState<DemoProperty[]>([]);
  const [category, setCategory] = useState("");
  const [error, setError] = useState("");
  useEffect(() => {
    if (process.env.NEXT_PUBLIC_LOCAL_DEMO !== "1") return;
    let active = true;
    const controller = new AbortController();
    const hash = () => setCategory(location.hash.slice(1));
    async function refresh() {
      try {
        const response = await fetch("/api/demo/properties", { cache: "no-store", signal: controller.signal });
        if (!response.ok) throw Error();
        const next = await response.json();
        if (active) { setProperties(old => JSON.stringify(old) === JSON.stringify(next) ? old : next); setError(""); }
      } catch { if (active) setError("No se pudo actualizar la disponibilidad. Intentá nuevamente en unos instantes."); }
    }
    hash(); void refresh(); const timer = setInterval(refresh, 2500);
    window.addEventListener("hashchange", hash);
    return () => { active = false; controller.abort(); clearInterval(timer); window.removeEventListener("hashchange", hash); };
  }, []);
  useEffect(() => {
    const id = new URLSearchParams(location.search).get("propiedad");
    if (!id) return;
    const timer = setTimeout(() => document.getElementById(`inmueble-${id}`)?.scrollIntoView({ block: "center", inline: "center" }), 300);
    return () => clearTimeout(timer);
  }, [properties]);
  const categoryFor = (p: DemoProperty) => p.propertyType === "Lote" ? "loteos" : p.propertyType === "Local" ? "locales-comerciales" : p.propertyType === "Cochera" ? "cocheras" : "propiedades";
  const filtered = ["loteos", "propiedades", "locales-comerciales", "cocheras"].includes(category);
  const inventory: CommercialCard[] = properties.filter(p => !filtered || categoryFor(p) === category).map(p => ({
    id: `inmueble-${p.id}`, name: p.title, type: p.propertyType, location: [p.neighborhood, p.city].filter(Boolean).join(", "),
    status: p.status === "sold" ? "Vendido" : p.status === "reserved" ? "Reservado" : "Disponible",
    description: p.description || "", inventory: p,
    media: { src: p.mainImage || demoPropertyImage(p.propertyType), alt: p.mainImage ? p.title : `Imagen ilustrativa de ${p.propertyType.toLowerCase()} · Demo`, intent: "Propiedad", section: "comercializadora", temporarySource: "bellomojujuy.com.ar", temporary: true },
  }));
  const developments = !filtered ? projects : category === "loteos" ? projects.filter(p => /lote|tierra/i.test(p.type)) : [];
  return { cards: [...developments, ...inventory] as CommercialCard[], error };
}
