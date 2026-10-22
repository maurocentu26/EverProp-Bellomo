"use client";

import { useEffect, useRef, useState } from "react";
import { Globe, Save, Star } from "lucide-react";
import { Button } from "@/components/ui/button";
import { apiFetch, EverpropApiError } from "@/lib/everprop-api";
import { landingPayload, type LandingAsset, type LandingImage, type LandingProject } from "@/lib/project-landing";

type ProjectOption = { public_id: string; name: string; can_edit: boolean; can_publish: boolean };
const inputClass = "mt-1 min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-base text-slate-900 focus:outline-2 focus:outline-blue-600";

export default function WebPage() {
  const [projects, setProjects] = useState<ProjectOption[]>([]);
  const [selected, setSelected] = useState("");
  const [project, setProject] = useState<LandingProject | null>(null);
  const [assets, setAssets] = useState<LandingAsset[]>([]);
  const [tab, setTab] = useState<"projects" | "hero">("projects");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [error, setError] = useState("");
  const [errors, setErrors] = useState<Record<string, string[]>>({});
  const [notice, setNotice] = useState("");
  const [retry, setRetry] = useState(0);
  const errorRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const controller = new AbortController();
    apiFetch<{ data: ProjectOption[] }>("/api/v1/admin/web/projects", { signal: controller.signal })
      .then(({ data }) => { setProjects(data); setSelected(data[0]?.public_id ?? ""); setLoading(false); })
      .catch((reason) => { if (!controller.signal.aborted) { setError(reason.message); setLoading(false); } });
    return () => controller.abort();
  }, [retry]);

  useEffect(() => {
    if (!selected) return;
    const controller = new AbortController();
    apiFetch<{ data: LandingProject; assets: LandingAsset[] }>(`/api/v1/admin/projects/${selected}/landing`, { signal: controller.signal })
      .then((result) => { setProject(result.data); setAssets(result.assets); setLoading(false); })
      .catch((reason) => { if (!controller.signal.aborted) { setError(reason.message); setLoading(false); } });
    return () => controller.abort();
  }, [selected, retry]);

  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  const permissions = projects.find((item) => item.public_id === selected);
  const ready = project?.public_id === selected && !loading;
  const editable = ready && permissions?.can_edit && !saving;
  function change(patch: Partial<LandingProject>) {
    setProject((value) => value ? { ...value, ...patch } : value);
    setDirty(true); setNotice("");
  }
  function fieldError(name: string) {
    return errors[name] ? <span id={`${name}-error`} className="mt-1 block text-sm text-red-700">{errors[name].join(" ")}</span> : null;
  }
  function textField(label: string, name: string, value: string | null, onChange: (value: string) => void, max: number, multiline = false) {
    const props = { id: name, value: value ?? "", onChange: (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => onChange(event.target.value), maxLength: max, className: inputClass, "aria-invalid": !!errors[name], "aria-describedby": errors[name] ? `${name}-error` : undefined };
    return <label className="block text-sm font-medium" key={name} htmlFor={name}>{label}{multiline ? <textarea {...props} rows={4} /> : <input {...props} />}{fieldError(name)}</label>;
  }
  function assetSelect(label: string, name: string, value: string, onChange: (url: string) => void, documents = false) {
    return <label className="block text-sm font-medium" htmlFor={name}>{label}
      <select id={name} className={inputClass} value={value} onChange={(event) => onChange(event.target.value)} aria-invalid={!!errors[name]}>
        <option value="">Sin archivo</option>
        {assets.filter((asset) => documents ? asset.mime_type === "application/pdf" : asset.mime_type.startsWith("image/")).map((asset) => <option key={asset.url} value={asset.url}>{asset.title}</option>)}
      </select>{fieldError(name)}
    </label>;
  }
  function imageEditor(label: string, name: string, value: LandingImage | null, onChange: (image: LandingImage | null) => void) {
    return <div className="space-y-3 rounded-xl border border-slate-200 p-4">
      {assetSelect(label, `${name}.url`, value?.url ?? "", (url) => onChange(url ? { url, alt: value?.alt ?? "", kind: value?.kind ?? "RENDER" } : null))}
      {value && <>
        {textField("Texto alternativo", `${name}.alt`, value.alt, (alt) => onChange({ ...value, alt }), 300)}
        <label className="block text-sm font-medium">Tipo de imagen<select className={inputClass} value={value.kind} onChange={(event) => onChange({ ...value, kind: event.target.value as LandingImage["kind"] })}><option value="PHOTO">Fotografía</option><option value="RENDER">Render</option></select></label>
      </>}{fieldError(name)}
    </div>;
  }
  async function save(event: React.FormEvent) {
    event.preventDefault();
    if (!project || !editable) return;
    setSaving(true); setError(""); setErrors({}); setNotice("");
    try {
      const result = await apiFetch<{ data: LandingProject }>(`/api/v1/admin/projects/${selected}/landing`, { method: "PUT", body: JSON.stringify(landingPayload(project)) });
      setProject(result.data); setDirty(false);
      setNotice("Cambios guardados. Se verán al volver a cargar la web, dentro de 60 segundos si la integración está activada.");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "No se pudo guardar.");
      if (reason instanceof EverpropApiError) setErrors(reason.errors ?? {});
      requestAnimationFrame(() => errorRef.current?.focus());
    } finally { setSaving(false); }
  }

  return <div className="mx-auto max-w-5xl space-y-6">
    <header className="space-y-2"><h1 className="flex items-center gap-3 text-3xl font-bold"><Globe aria-hidden="true" />Web</h1><p className="text-slate-600">Administrá cómo se presentan tus proyectos en la landing. El inventario comercial se conserva.</p></header>
    <nav aria-label="Secciones de Web" className="flex gap-2 border-b border-slate-200 pb-3">
      <Button type="button" variant={tab === "projects" ? "default" : "outline"} aria-pressed={tab === "projects"} onClick={() => setTab("projects")}>Proyectos</Button>
      <Button type="button" variant={tab === "hero" ? "default" : "outline"} aria-pressed={tab === "hero"} onClick={() => setTab("hero")}><Star aria-hidden="true" className="mr-2 h-4 w-4" />Hero</Button>
    </nav>
    {error && <div ref={errorRef} tabIndex={-1} role="alert" className="rounded-xl border border-red-200 bg-red-50 p-4 text-red-800 dark:bg-red-950 dark:text-red-100"><p>{error}</p>{Object.entries(errors).map(([name, messages]) => <a className="block underline" href={`#${name}`} key={name}>{name}: {messages.join(" ")}</a>)}{!project && <Button type="button" variant="outline" onClick={() => { setLoading(true); setError(""); setRetry((n) => n + 1); }}>Reintentar</Button>}</div>}
    {notice && <p role="status" className="rounded-xl bg-emerald-50 p-4 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-100">{notice}</p>}
    <label className="block max-w-xl text-sm font-medium">Proyecto existente<select className={inputClass} value={selected} disabled={saving || loading} onChange={(event) => {
      if (dirty && !window.confirm("Hay cambios sin guardar. ¿Querés descartarlos?")) return;
      setSelected(event.target.value); setProject(null); setLoading(true); setDirty(false); setError(""); setErrors({}); setNotice("");
    }}><option value="" disabled>Seleccioná un proyecto</option>{projects.map((item) => <option key={item.public_id} value={item.public_id}>{item.name}</option>)}</select></label>
    {loading && <p role="status">Cargando presentación web…</p>}
    {!loading && projects.length === 0 && !error && <p>No hay proyectos disponibles para tu cuenta.</p>}
    {ready && project && <form onSubmit={save} className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4"><div><h2 className="text-xl font-semibold">{tab === "hero" ? "Destacado del inicio" : "Presentación del proyecto"}</h2><p className="mt-1 text-sm text-slate-600">{project.is_visible ? "Visible en la landing" : "Oculto en la landing"}{dirty ? " · Cambios sin guardar" : ""}</p></div><Button type="submit" disabled={!editable || !dirty}><Save className="mr-2 h-4 w-4" aria-hidden="true" />{saving ? "Guardando…" : "Guardar cambios"}</Button></div>
      {!permissions?.can_edit && <p>Tu cuenta puede consultar esta presentación, pero no editarla.</p>}
      {assets.length === 0 && <p className="rounded-xl bg-amber-50 p-4 text-sm text-amber-900 dark:bg-amber-950 dark:text-amber-100">Este proyecto todavía no tiene archivos públicos aprobados. Hace falta registrar su correspondencia con R2 por UUID antes de elegir imágenes o documentos.</p>}
      <fieldset disabled={!editable} className="space-y-6 disabled:opacity-70">
        <div className="flex flex-wrap gap-6 rounded-xl border border-slate-200 p-4">
          <label className="flex min-h-11 items-center gap-3"><input type="checkbox" className="h-5 w-5" disabled={!permissions?.can_publish} checked={project.is_visible} onChange={(event) => change({ is_visible: event.target.checked, is_featured: event.target.checked && project.is_featured })} />Mostrar en la landing</label>
          <label className="flex min-h-11 items-center gap-3"><input type="checkbox" className="h-5 w-5" disabled={!permissions?.can_publish || !project.is_visible || !project.cover} checked={project.is_featured} onChange={(event) => change({ is_featured: event.target.checked })} />Destacar en el inicio</label>
        </div>
        {tab === "hero" && <p className="text-sm text-slate-600">El hero usa el nombre, resumen, categoría, portada y logo del proyecto. Para destacarlo, primero publicalo con una portada válida. Los textos generales del inicio se mantienen.</p>}
        <div className="grid gap-5 md:grid-cols-2">
          {textField("Nombre público", "name", project.name, (name) => change({ name }), 160)}
          <label className="block text-sm font-medium">Categoría editorial<select id="category" className={inputClass} value={project.category ?? ""} onChange={(event) => change({ category: event.target.value as LandingProject["category"] })}><option value="HUASI">Departamentos Huasi</option><option value="LAND_DEVELOPMENT">Loteos y urbanizaciones</option><option value="COMMERCIAL">Locales y cocheras</option></select>{fieldError("category")}</label>
          {textField("Resumen para tarjetas y hero", "summary", project.summary, (summary) => change({ summary }), 400, true)}
          <label className="block text-sm font-medium">Orden {tab === "hero" ? "en el hero" : "en el catálogo"}<input id={tab === "hero" ? "featured_order" : "sort_order"} type="number" min={0} max={4294967295} step={1} className={inputClass} value={tab === "hero" ? project.featured_order : project.sort_order} onChange={(event) => change(tab === "hero" ? { featured_order: Number(event.target.value) } : { sort_order: Number(event.target.value) })} /><span className="text-sm font-normal text-slate-500">Los números menores aparecen primero.</span>{fieldError(tab === "hero" ? "featured_order" : "sort_order")}</label>
        </div>
        <div className="grid gap-5 md:grid-cols-2">{imageEditor("Portada", "cover", project.cover, (cover) => change({ cover, is_featured: !!cover && project.is_featured }))}<div className="space-y-3 rounded-xl border border-slate-200 p-4">{assetSelect("Logo", "logo.url", project.logo?.url ?? "", (url) => change({ logo: url ? { url, alt: project.logo?.alt ?? "" } : null }))}{project.logo && textField("Texto alternativo del logo", "logo.alt", project.logo.alt, (alt) => change({ logo: { ...project.logo!, alt } }), 300)}</div></div>
        {tab === "projects" && <>
          {textField("URL del proyecto (queda fija al publicar)", "slug", project.slug, (slug) => change({ slug }), 120)}
          {textField("Descripción pública", "description", project.description, (description) => change({ description }), 20000, true)}
          <div className="grid gap-5 md:grid-cols-2">{textField("Ciudad", "location.city", project.location.city, (city) => change({ location: { ...project.location, city } }), 160)}{textField("Provincia", "location.province", project.location.province, (province) => change({ location: { ...project.location, province } }), 160)}{textField("Dirección pública", "location.address", project.location.address, (address) => change({ location: { ...project.location, address: address || null } }), 300)}{textField("Etiqueta de estado", "status_label", project.status_label, (status_label) => change({ status_label: status_label || null }), 100)}</div>
          <section className="space-y-4"><h3 className="text-lg font-semibold">Galería</h3>{project.gallery.map((image, index) => <div key={index} className="space-y-2">{imageEditor(`Imagen ${index + 1}`, `gallery.${index}`, image, (next) => change({ gallery: next ? project.gallery.map((item, i) => i === index ? next : item) : project.gallery.filter((_, i) => i !== index) }))}<div className="flex gap-2"><Button type="button" variant="outline" disabled={index === 0} onClick={() => { const gallery = [...project.gallery]; [gallery[index - 1], gallery[index]] = [gallery[index], gallery[index - 1]]; change({ gallery }); }}>Subir imagen {index + 1}</Button><Button type="button" variant="outline" onClick={() => change({ gallery: project.gallery.filter((_, i) => i !== index) })}>Quitar imagen {index + 1}</Button></div></div>)}<Button type="button" variant="outline" disabled={project.gallery.length >= 100 || !assets.some((a) => a.mime_type.startsWith("image/"))} onClick={() => change({ gallery: [...project.gallery, { url: assets.find((a) => a.mime_type.startsWith("image/"))!.url, alt: "", kind: "PHOTO" }] })}>Agregar imagen</Button>{fieldError("gallery")}</section>
          <section className="space-y-4"><h3 className="text-lg font-semibold">Características</h3><p className="text-sm text-slate-600">Una por línea, en el orden en que se mostrarán. Máximo 100.</p><label className="block text-sm font-medium">Listado de características<textarea id="features" className={inputClass} rows={5} value={project.features.join("\n")} onChange={(event) => change({ features: event.target.value === "" ? [] : event.target.value.split("\n") })} /></label>{fieldError("features")}</section>
          <section className="space-y-4"><h3 className="text-lg font-semibold">Documentos públicos</h3>{project.documents.map((document, index) => <div className="space-y-3 rounded-xl border border-slate-200 p-4" key={index}>{assetSelect(`PDF ${index + 1}`, `documents.${index}.url`, document.url, (url) => change({ documents: project.documents.map((item, i) => i === index ? { ...item, url } : item) }), true)}{textField("Título del documento", `documents.${index}.title`, document.title, (title) => change({ documents: project.documents.map((item, i) => i === index ? { ...item, title } : item) }), 160)}<div className="flex gap-2"><Button type="button" variant="outline" disabled={index === 0} onClick={() => { const documents = [...project.documents]; [documents[index - 1], documents[index]] = [documents[index], documents[index - 1]]; change({ documents }); }}>Subir documento {index + 1}</Button><Button type="button" variant="outline" onClick={() => change({ documents: project.documents.filter((_, i) => i !== index) })}>Quitar documento {index + 1}</Button></div></div>)}<Button type="button" variant="outline" disabled={project.documents.length >= 30 || !assets.some((a) => a.mime_type === "application/pdf")} onClick={() => change({ documents: [...project.documents, { url: assets.find((a) => a.mime_type === "application/pdf")!.url, title: "" }] })}>Agregar PDF</Button>{fieldError("documents")}</section>
        </>}
      </fieldset>
    </form>}
  </div>;
}
