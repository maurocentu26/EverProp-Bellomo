"use client";
/* eslint-disable @next/next/no-img-element -- Authenticated media must retain the browser session cookie. */
import { useState } from "react";
import { ArrowDownToLine, ArrowLeft, ArrowRight, FileText, ImageIcon, MapPin, ExternalLink, RotateCcw } from "lucide-react";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { useBellomoMaterials } from "@/hooks/use-bellomo-materials";
import type { PublicMaterialProject } from "@/lib/bellomo-policy";

export type Resource = PublicMaterialProject["assets"][number] & { projectName?: string };
export const kindNames: Record<string,string> = { photo:"Fotografía", render:"Render", technical:"Documentación técnica", commercial:"Material comercial", logo:"Identidad", brand:"Marca Bellomo" };
export function ResourceGrid({ assets }: { assets: Resource[] }) {
  const [selected,setSelected] = useState<Resource | null>(null);
  const pictures = assets.filter(a => ["photo","render","logo"].includes(a.kind));
  const current = selected ? pictures.findIndex(a=>a.id===selected.id) : -1;
  return <>
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {assets.map(asset => {
        const picture = ["photo", "render", "logo"].includes(asset.kind);
        return <article key={asset.id} className="group overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
          {picture ? <button type="button" onClick={()=>setSelected(asset)} className="relative block aspect-[16/10] w-full overflow-hidden bg-muted text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring" aria-label={"Ampliar: " + asset.projectName + " · " + asset.title}>
            <img src={asset.url} alt={(asset.projectName || "") + " · " + asset.title} loading="lazy" className={asset.kind === "logo" ? "h-full w-full bg-white p-8 object-contain" : "h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.03]"} />
            <span className="absolute left-3 top-3 rounded-md bg-white/95 px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-slate-800">{kindNames[asset.kind]}</span>
          </button> : <div className="flex h-20 items-center gap-3 border-b border-border bg-muted/40 px-4">
            <span className="flex size-10 items-center justify-center rounded-xl bg-card text-primary"><FileText className="size-5" aria-hidden="true" /></span>
            <span className="text-xs font-semibold text-muted-foreground">{kindNames[asset.kind]}</span>
          </div>}
          <div className="p-4">
            {asset.projectName && <p className="mb-1 text-xs font-medium text-muted-foreground">{asset.projectName}</p>}
            <h3 className="text-sm font-bold text-foreground">{asset.title}</h3>
            <p className="mt-1 text-[11px] leading-5 text-muted-foreground">{asset.version}</p>
            {asset.kind === "commercial" && <p className="mt-1 text-[11px] leading-5 text-muted-foreground">Confirmar condiciones y vigencia antes de cotizar.</p>}
            <div className="mt-3 flex flex-wrap items-center justify-between gap-3 border-t border-border pt-3 text-xs font-semibold">
              {picture ? <button type="button" onClick={()=>setSelected(asset)} className="inline-flex items-center gap-1.5 text-primary hover:underline"><ImageIcon className="size-3.5" /> Ampliar</button> :
                <a href={asset.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 text-primary hover:underline"><ExternalLink className="size-3.5" /> Abrir documento</a>}
              <a href={asset.url+"?download=1"} className="inline-flex items-center gap-1.5 text-muted-foreground hover:text-foreground" aria-label={"Descargar " + (asset.projectName || "") + " " + asset.title}><ArrowDownToLine className="size-3.5" /> Descargar</a>
            </div>
          </div>
        </article>;
      })}
    </div>
    <Dialog open={!!selected} onOpenChange={open=>{if(!open)setSelected(null);}}>
      <DialogContent className="admin-workspace max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-5xl">
        <DialogTitle className="pr-8">{selected?.projectName} · {selected?.title}</DialogTitle>
        <DialogDescription>{selected?.kind === "render" ? "Representación proyectada del desarrollo." : selected?.kind === "logo" ? "Identidad gráfica del desarrollo." : "Imagen de referencia del desarrollo."} {selected?.version}</DialogDescription>
        {selected && <img src={selected.url} alt={selected.title} className={"max-h-[65dvh] w-full rounded-lg object-contain " + (selected.kind === "logo" ? "bg-white p-8" : "bg-muted")} />}
        <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2">
          <button type="button" disabled={current<=0} onClick={()=>setSelected(pictures[current-1])} className="inline-flex min-h-11 min-w-0 items-center justify-center gap-1 rounded-lg px-1 text-xs sm:px-3 sm:text-sm disabled:opacity-40"><ArrowLeft className="size-4 shrink-0" aria-hidden="true" /> <span className="sr-only min-[380px]:not-sr-only">Anterior</span></button>
          <span className="whitespace-nowrap text-xs text-muted-foreground" aria-live="polite">{current+1} / {pictures.length}</span>
          <button type="button" disabled={current<0 || current>=pictures.length-1} onClick={()=>setSelected(pictures[current+1])} className="inline-flex min-h-11 min-w-0 items-center justify-center gap-1 rounded-lg px-1 text-xs sm:px-3 sm:text-sm disabled:opacity-40"><span className="sr-only min-[380px]:not-sr-only">Siguiente</span> <ArrowRight className="size-4 shrink-0" aria-hidden="true" /></button>
        </div>
      </DialogContent>
    </Dialog>
  </>;
}
export function MaterialErrorNotice({message,retry}:{message:string;retry:()=>void}) {
  return <div role="alert" className="rounded-xl border border-border bg-card p-5">
    <p className="text-sm text-muted-foreground">{message}</p>
    <button type="button" onClick={retry} className="mt-3 inline-flex items-center gap-2 text-sm font-semibold text-primary"><RotateCcw className="size-4" /> Reintentar</button>
  </div>;
}
export function ProjectMaterials({projectId}:{projectId:string}) {
  const {data,error,loading,retry}=useBellomoMaterials();
  if(loading) return <div className="h-24 animate-pulse rounded-2xl bg-muted" role="status" aria-label="Cargando material del desarrollo" />;
  if(error) return <MaterialErrorNotice message={error} retry={retry}/>;
  const project=data?.projects.find(p=>p.operationalIds.includes(projectId));
  if(!project)return null;
  const gallery=project.assets.filter(a=>["photo","render"].includes(a.kind));
  const documents=project.assets.filter(a=>["commercial","technical"].includes(a.kind));
  const logo=project.assets.find(a=>a.kind==="logo");
  return <section className="space-y-5" aria-label="Material del desarrollo">
    <div className="flex flex-wrap items-start justify-between gap-4 rounded-2xl border border-border bg-card p-5">
      <div className="flex min-w-0 flex-wrap items-center gap-4">{logo && <img src={logo.url} alt={"Logo de " + project.name} className="h-16 w-28 shrink-0 rounded-lg bg-white p-2 object-contain" />}<div><h2 className="text-lg font-bold">Conocé el desarrollo</h2><p className="mt-1 text-sm text-muted-foreground">{project.tagline || project.location}</p></div></div>
      {project.mapUrl && <a href={project.mapUrl} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-border px-4 text-sm font-semibold"><MapPin className="size-4" /> Ver ubicación</a>}
    </div>
    <p className="text-xs leading-5 text-muted-foreground">Material general del desarrollo. La disponibilidad de cada unidad se consulta en Inventario.</p>
    {gallery.length>0 && <ResourceGrid assets={gallery.map(a=>({...a,projectName:project.name}))}/>}
    {documents.length>0 && <><div><h2 className="text-lg font-bold">Documentación del proyecto</h2><p className="mt-1 text-xs text-muted-foreground">Fichas de referencia. Confirmá condiciones y vigencia antes de preparar una cotización.</p></div><ResourceGrid assets={documents.map(a=>({...a,projectName:project.name}))}/></>}
  </section>;
}
