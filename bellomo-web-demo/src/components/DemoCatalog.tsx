"use client";
import { useEffect, useState } from "react";
import type { DemoProperty } from "@/lib/demo-catalog";
import { Building2, MapPin } from "lucide-react";

export default function DemoCatalog() {
  const [properties, setProperties] = useState<DemoProperty[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [limit, setLimit] = useState(9);
  useEffect(() => {
    let active = true;
    let busy = false;
    const controller = new AbortController();
    async function refresh() {
      if (busy) return;
      busy = true;
      try {
        const response = await fetch("/api/demo/properties", { cache: "no-store", signal: controller.signal });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error);
        if (active) { setProperties(data); setError(""); setLoaded(true); }
      } catch (reason) {
        if (active) { setError(reason instanceof Error ? reason.message : "Catálogo no disponible."); setProperties([]); }
      } finally { busy = false; }
    }
    void refresh();
    const interval = setInterval(refresh, 2000);
    window.addEventListener("focus", refresh);
    return () => { active = false; controller.abort(); clearInterval(interval); window.removeEventListener("focus", refresh); };
  }, []);
  const visible = properties.filter(p => `${p.title} ${p.city} ${p.neighborhood} ${p.propertyType}`.toLocaleLowerCase().includes(search.toLocaleLowerCase()));
  return <section id="catalogo-demo" className="bg-[#f4f1e9] px-5 py-20 text-[#123c4d] sm:px-8">
    <div className="mx-auto max-w-[86rem]">
      <p className="text-xs font-semibold uppercase tracking-[0.2em]">Demo local · conectada al panel</p>
      <div className="mt-4 flex flex-wrap items-end justify-between gap-6">
        <div><h2 className="font-display text-5xl">Propiedades publicadas</h2><p className="mt-3">Los cambios del panel aparecen acá automáticamente.</p></div>
        <a href="http://127.0.0.1:3001/admin/properties" target="_blank" rel="noreferrer" className="rounded-full border border-[#123c4d] px-5 py-3">Abrir panel demo</a>
      </div>
      <label className="mt-8 block max-w-lg">Buscar por nombre, tipo o ubicación
        <input value={search} onChange={e => { setSearch(e.target.value); setLimit(9); }} className="mt-2 w-full rounded-xl border border-slate-300 bg-white px-4 py-3" placeholder="Ej. casa, lote, Jujuy" />
      </label>
      {error ? <p role="alert" className="mt-6 text-red-700">{error}</p> : !loaded ? <p role="status" className="mt-6">Cargando catálogo…</p> : <>
        <p role="status" className="mt-5 text-sm">{visible.length} propiedades publicadas · Datos de demostración</p>
        {visible.length === 0 && <p className="mt-8">No hay propiedades publicadas que coincidan con tu búsqueda.</p>}
        <div className="mt-6 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {visible.slice(0, limit).map(p => <article key={p.id} className="rounded-2xl border border-slate-200 bg-white p-6" data-property-id={p.id}>
            <div className="flex items-center justify-between gap-2"><Building2 className="h-6 w-6" /><span className="text-xs uppercase">{p.operation === "sale" ? "Venta" : p.operation === "rent" ? "Alquiler" : "Temporal"} · {p.status === "reserved" ? "Reservado" : p.status === "sold" ? "Vendido" : "Disponible"}</span></div>
            <h3 className="mt-5 text-xl font-semibold">{p.title}</h3>
            <p className="mt-2 flex items-center gap-1 text-sm"><MapPin className="h-4 w-4" />{p.neighborhood}, {p.city}</p>
            <p className="mt-4 text-2xl">{p.price > 0 ? `${p.currency} ${p.price.toLocaleString("es-AR")}` : "Consultar precio"}</p>
            <p className="mt-2 text-sm">{p.propertyType}{p.area_m2 ? ` · ${p.area_m2} m²` : ""}{p.bedrooms ? ` · ${p.bedrooms} dormitorios` : ""}</p>
            {p.description && <p className="mt-3 text-sm text-slate-600">{p.description}</p>}
          </article>)}
        </div>
        {visible.length > limit && <button type="button" onClick={() => setLimit(limit + 9)} className="mt-6 rounded-full border border-[#123c4d] px-5 py-3">Ver más propiedades</button>}
      </>}
    </div>
  </section>;
}
