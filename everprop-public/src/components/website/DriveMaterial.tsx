"use client";
import { useState } from "react";
import { ExternalLink, Search } from "lucide-react";
import { driveMaterial } from "@/lib/website-content";

export function DriveMaterial() {
  const [query,setQuery]=useState("");
  const [category,setCategory]=useState("Todo");
  const normalize=(s:string)=>s.normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase();
  const matches=driveMaterial.filter(item=>(category==="Todo"||item.category===category)&&normalize(item.title).includes(normalize(query)));
  return <div className="space-y-5">
    <h2 className="text-xl font-bold">Material oficial de Bellomo</h2>
    <p>Fotos, videos, logos, textos y fichas del Drive, reunidos acá. Las imágenes preparadas se eligen desde «Elegir material Bellomo». Abrir un original no lo publica en la web.</p>
    <label className="flex items-center gap-2 rounded-xl border p-3"><Search size={18}/><input className="min-w-0 flex-1 bg-transparent outline-none" aria-label="Buscar en material oficial" placeholder="Buscar proyecto, logo o ficha" value={query} onChange={e=>setQuery(e.target.value)}/></label>
    <div className="flex flex-wrap gap-2">{["Todo",...new Set(driveMaterial.map(item=>item.category))].map(label=><button type="button" key={label} aria-pressed={label===category} onClick={()=>setCategory(label)} className={`min-h-11 rounded-xl border px-4 ${label===category?'bg-blue-600 text-white':''}`}>{label}</button>)}</div>
    <p className="text-sm">{matches.length} archivos y carpetas · Revisado el 8/9/2026</p>
    <div className="grid gap-3 sm:grid-cols-2">{matches.map(item=><article key={item.id} className="min-w-0 rounded-xl border p-4">
      <h3 className="break-words font-semibold">{item.title}</h3>
      <p className="mt-1 text-sm">{item.category}{item.size>0?` · ${(item.size/1024/1024).toFixed(1)} MB`:''}</p>
      {item.review&&<p className="mt-2 rounded-lg bg-amber-100 p-2 text-sm text-amber-950">Pendiente de corrección en el archivo original. Revisar antes de publicar.</p>}
      <a href={item.url} target="_blank" rel="noreferrer" className="mt-3 inline-flex min-h-11 items-center gap-2 font-semibold underline">Abrir original en Drive<ExternalLink size={16}/></a>
    </article>)}</div>
    {matches.length===0&&<p>No se encontraron archivos con esa búsqueda.</p>}
  </div>;
}
