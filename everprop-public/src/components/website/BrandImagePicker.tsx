"use client";

import { useState } from "react";
import { Images, Search } from "lucide-react";
import { brandLibrary } from "@/lib/website-content";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";

export function BrandImagePicker({ onSelect }: { onSelect: (src: string) => void }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("Todo");
  const normalize = (text: string) => text.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  const matches = brandLibrary.filter(item => (category === "Todo" || item.category === category) && normalize(item.label).includes(normalize(query)));
  return <>
    <button type="button" onClick={() => setOpen(true)} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"><Images className="h-4 w-4"/>Elegir material Bellomo</button>
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="flex max-h-[90dvh] flex-col overflow-hidden sm:max-w-4xl">
        <DialogTitle>Material de Bellomo</DialogTitle>
        <DialogDescription>Elegí una imagen del archivo de Bellomo. Usá la foto del desarrollo correspondiente. Los renders están identificados.</DialogDescription>
        <label className="flex items-center gap-2 rounded-xl border border-slate-300 px-3"><Search className="h-4 w-4 shrink-0"/><input aria-label="Buscar material Bellomo" placeholder="Buscar por desarrollo o nombre" className="min-h-11 min-w-0 w-full bg-transparent text-sm outline-none" value={query} onChange={e => setQuery(e.target.value)}/></label>
        <div className="flex flex-wrap gap-2" role="group" aria-label="Tipo de material">{["Todo", "Fotos", "Logos", "Renders"].map(label => <button key={label} type="button" aria-pressed={category === label} onClick={() => setCategory(label)} className={`min-h-11 rounded-xl border px-4 text-sm font-semibold ${category === label ? "border-blue-600 bg-blue-600 text-white" : "border-slate-300"}`}>{label}</button>)}</div>
        <div className="grid min-h-0 grid-cols-1 gap-3 overflow-y-auto p-1 sm:grid-cols-2 lg:grid-cols-3">
          {matches.map(item => <button type="button" key={item.id} onClick={() => { onSelect(item.src); setOpen(false); }} aria-label={`Usar ${item.label}`} className="overflow-hidden rounded-xl border border-slate-300 text-left hover:border-blue-600 focus-visible:outline-2 focus-visible:outline-blue-600">
            <div className={`flex h-36 items-center justify-center p-2 ${item.id === 'bellomo-oficial' ? 'bg-slate-900' : 'bg-white'}`}><img src={item.src} alt="" loading="lazy" className={`h-full w-full ${item.category === "Logos" ? "object-contain" : "object-cover"}`}/></div>
            <span className="block px-3 pt-3 text-sm font-semibold">{item.label}</span><span className="block px-3 pb-3 pt-1 text-xs text-slate-500">{item.category} · Seleccionar</span>
          </button>)}
          {!matches.length && <p role="status" className="col-span-full p-6 text-sm">No encontramos material con ese nombre.</p>}
        </div>
      </DialogContent>
    </Dialog>
  </>;
}
