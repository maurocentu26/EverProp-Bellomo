/* eslint-disable @next/next/no-img-element */
"use client";

import { useEffect, useRef, useState, useMemo } from "react";
import {
  Globe,
  Save,
  Star,
  Search,
  Eye,
  Edit,
  MapPin,
  ExternalLink,
  ArrowLeft,
  X,
  CheckCircle2,
  Phone,
  Image as ImageIcon
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { apiFetch, EverpropApiError } from "@/lib/everprop-api";
import {
  landingPayload,
  uploadLandingAsset,
  type LandingAsset,
  type LandingImage,
  type LandingProject,
  type ProjectOption
} from "@/lib/project-landing";

const inputClass = "mt-1 min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-base text-slate-900 focus:outline-2 focus:outline-blue-600";

type ProjectWebEditorProps = {
  fixedProjectId?: string;
  section?: "material" | "presentation" | "review";
  unitSummary?: { loaded: number; declared: number };
  onGoToStep?: (step: number) => void;
  onBusyChange?: (busy: boolean) => void;
};

export default function ProjectWebEditor({
  fixedProjectId,
  section,
  unitSummary,
  onGoToStep,
  onBusyChange
}: ProjectWebEditorProps) {
  const [projects, setProjects] = useState<ProjectOption[]>([]);
  const [selected, setSelected] = useState(fixedProjectId ?? "");
  const [project, setProject] = useState<LandingProject | null>(null);
  const [assets, setAssets] = useState<LandingAsset[]>([]);
  const [tab, setTab] = useState<"projects" | "hero">("projects");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [pendingUpload, setPendingUpload] = useState<{ projectId: string; url: string; mime_type: string; title: string; upload_token: string } | null>(null);
  const [dirty, setDirty] = useState(false);
  const [error, setError] = useState("");
  const [errors, setErrors] = useState<Record<string, string[]>>({});
  const [notice, setNotice] = useState("");
  const [retry, setRetry] = useState(0);
  const errorRef = useRef<HTMLDivElement>(null);

  // Estados para la nueva vista descriptiva de catálogo
  const [viewMode, setViewMode] = useState<"catalog" | "editor">(fixedProjectId ? "editor" : "catalog");
  const [searchQuery, setSearchQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<"ALL" | "LAND_DEVELOPMENT" | "HUASI" | "COMMERCIAL">("ALL");
  const [previewProject, setPreviewProject] = useState<ProjectOption | LandingProject | null>(null);
  const [togglingVisibility, setTogglingVisibility] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    apiFetch<{ data: ProjectOption[] }>("/api/v1/admin/web/projects", { signal: controller.signal })
      .then(({ data }) => {
        setProjects(data);
        if (fixedProjectId) {
          setSelected(fixedProjectId);
        }
        setLoading(false);
      })
      .catch((reason) => {
        if (!controller.signal.aborted) {
          setError(reason.message);
          setLoading(false);
        }
      });
    return () => controller.abort();
  }, [retry, fixedProjectId]);

  useEffect(() => {
    if (!selected) return;
    const controller = new AbortController();
    apiFetch<{ data: LandingProject; assets: LandingAsset[] }>(`/api/v1/admin/projects/${selected}/landing`, { signal: controller.signal })
      .then((result) => {
        setProject(result.data);
        setAssets(result.assets);
        setLoading(false);
      })
      .catch((reason) => {
        if (!controller.signal.aborted) {
          setError(reason.message);
          setLoading(false);
        }
      });
    return () => controller.abort();
  }, [selected, retry, section]);

  useEffect(() => {
    if (!dirty && !uploading && !pendingUpload && !saving) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty, uploading, pendingUpload, saving]);

  const busy = dirty || uploading || !!pendingUpload || saving;
  useEffect(() => { onBusyChange?.(busy); }, [busy, onBusyChange]);
  useEffect(() => () => { onBusyChange?.(false); }, [onBusyChange]);

  const permissions = projects.find((item) => item.public_id === selected);
  const ready = project?.public_id === selected && !loading;
  const editable = ready && permissions?.can_edit && !saving && !uploading;

  const missing = project ? [
    !project.name?.trim() && "Nombre público",
    !project.slug?.trim() && "URL del proyecto",
    !project.summary?.trim() && "Resumen",
    !project.category && "Categoría",
    !project.location.city?.trim() && "Ciudad",
    !project.location.province?.trim() && "Provincia",
    project.is_featured && !project.cover && "Portada para destacar en el inicio",
  ].filter((item): item is string => !!item) : [];

  const informative = project ? [
    unitSummary && (unitSummary.loaded === 0 ? "unidades sin cargar" : unitSummary.declared > 0 && unitSummary.loaded !== unitSummary.declared && "unidades cargadas distintas a las declaradas"),
    !project.description?.trim() && "descripción comercial",
    assets.length === 0 && "material comercial",
  ].filter((item): item is string => !!item) : [];

  async function confirmUpload(pending: NonNullable<typeof pendingUpload>) {
    const { projectId, ...payload } = pending;
    const { data } = await apiFetch<{ data: LandingAsset }>(`/api/v1/admin/projects/${projectId}/landing/media/confirm`, { method: "POST", body: JSON.stringify(payload), signal: AbortSignal.timeout(60_000) });
    setAssets((current) => [...current.filter((asset) => asset.url !== data.url), data]);
    setPendingUpload(null);
    setNotice("Archivo cargado. Ya podés elegirlo como imagen o documento. Guardá los cambios para usarlo en la web.");
  }

  async function upload(file?: File) {
    if (!file || !editable || pendingUpload) return;
    setUploading(true); setError(""); setErrors({}); setNotice("");
    try {
      const pending = await uploadLandingAsset(selected, file);
      setPendingUpload(pending);
      await confirmUpload(pending);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "No se pudo cargar el archivo. Revisá tu conexión y los permisos CORS de R2.");
    } finally { setUploading(false); }
  }

  async function retryConfirmation() {
    if (!pendingUpload || uploading) return;
    setUploading(true); setError("");
    try { await confirmUpload(pendingUpload); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "No se pudo confirmar el archivo."); }
    finally { setUploading(false); }
  }

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

  async function save(event?: React.FormEvent, publish = false) {
    event?.preventDefault();
    if (!project || !editable || pendingUpload || (publish && (!permissions?.can_publish || missing.length > 0))) return;
    setSaving(true); setError(""); setErrors({}); setNotice("");
    try {
      const result = await apiFetch<{ data: LandingProject }>(`/api/v1/admin/projects/${selected}/landing`, { method: "PUT", body: JSON.stringify(landingPayload(publish ? { ...project, is_visible: true } : project)) });
      setProject(result.data); setDirty(false);
      setNotice("Cambios guardados. Se verán al volver a cargar la web, dentro de 60 segundos si la integración está activada.");
      // Actualizar en la lista local de proyectos
      setProjects((current) => current.map((p) => p.public_id === result.data.public_id ? { ...p, ...result.data } : p));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "No se pudo guardar.");
      if (reason instanceof EverpropApiError) setErrors(reason.errors ?? {});
      requestAnimationFrame(() => errorRef.current?.focus());
    } finally { setSaving(false); }
  }

  // Alternar visibilidad directa desde la tarjeta del catálogo
  async function toggleProjectVisibility(item: ProjectOption, isChecked: boolean) {
    if (!item.can_publish) {
      alert("Tu cuenta no tiene permisos para cambiar la publicación de este proyecto.");
      return;
    }
    setTogglingVisibility(item.public_id);
    try {
      // Obtenemos la configuración completa si no está cargada
      const { data: currentProject } = await apiFetch<{ data: LandingProject }>(`/api/v1/admin/projects/${item.public_id}/landing`);
      const payload = landingPayload({ ...currentProject, is_visible: isChecked });
      const { data: updated } = await apiFetch<{ data: LandingProject }>(`/api/v1/admin/projects/${item.public_id}/landing`, {
        method: "PUT",
        body: JSON.stringify(payload)
      });
      setProjects((prev) => prev.map((p) => p.public_id === item.public_id ? { ...p, is_visible: updated.is_visible } : p));
      if (project?.public_id === item.public_id) {
        setProject((prev) => prev ? { ...prev, is_visible: updated.is_visible } : prev);
      }
    } catch (err) {
      alert(err instanceof Error ? err.message : "Error al actualizar la visibilidad.");
    } finally {
      setTogglingVisibility(null);
    }
  }

  // Filtrado de proyectos para la grilla
  const filteredProjects = useMemo(() => {
    return projects.filter((p) => {
      const matchesCategory =
        categoryFilter === "ALL" ||
        p.category === categoryFilter;

      const q = searchQuery.toLowerCase().trim();
      const matchesQuery =
        !q ||
        p.name.toLowerCase().includes(q) ||
        (p.slug && p.slug.toLowerCase().includes(q)) ||
        (p.summary && p.summary.toLowerCase().includes(q)) ||
        (p.location?.city && p.location.city.toLowerCase().includes(q)) ||
        (p.location?.province && p.location.province.toLowerCase().includes(q));

      return matchesCategory && matchesQuery;
    });
  }, [projects, categoryFilter, searchQuery]);

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      {/* Encabezado General */}
      {!section && (
        <header className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-6 border-b border-slate-200">
          <div>
            <h1 className="flex items-center gap-3 text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
              <Globe className="text-blue-600" aria-hidden="true" />
              Web y Catálogo de Proyectos
            </h1>
            <p className="text-sm text-slate-500 mt-1">
              Supervisá cómo se presentan tus desarrollos en la landing, fotos oficiales y textos comerciales.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <a
              href="http://localhost:3001/desarrollos"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 px-3.5 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 transition shadow-sm"
            >
              <ExternalLink className="w-4 h-4 text-slate-500" />
              Ver Landing en Vivo
            </a>
            {!fixedProjectId && viewMode === "editor" && (
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  if (dirty && !window.confirm("Hay cambios sin guardar. ¿Querés volver al catálogo y descartarlos?")) return;
                  setViewMode("catalog");
                  setDirty(false);
                }}
              >
                <ArrowLeft className="mr-2 h-4 w-4" />
                Volver al Catálogo
              </Button>
            )}
          </div>
        </header>
      )}

      {/* Alertas y Notificaciones */}
      {error && (
        <div ref={errorRef} tabIndex={-1} role="alert" className="rounded-xl border border-red-200 bg-red-50 p-4 text-red-800 dark:bg-red-950 dark:text-red-100">
          <p>{error}</p>
          {Object.entries(errors).map(([name, messages]) => (
            <a className="block underline" href={`#${name}`} key={name}>{name}: {messages.join(" ")}</a>
          ))}
          {!project && (
            <Button type="button" variant="outline" className="mt-2" onClick={() => { setLoading(true); setError(""); setRetry((n) => n + 1); }}>
              Reintentar
            </Button>
          )}
        </div>
      )}

      {notice && (
        <p role="status" className="rounded-xl bg-emerald-50 border border-emerald-200 p-4 text-emerald-800 text-sm font-medium">
          {notice}
        </p>
      )}

      {/* ======================================================== */}
      {/* VISTA 1: CATÁLOGO ENRIQUECIDO DE TARJETAS DESCRIPTIVAS  */}
      {/* ======================================================== */}
      {!fixedProjectId && viewMode === "catalog" && (
        <div className="space-y-6">
          {/* Barra de Búsqueda y Filtros */}
          <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-center bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
            <div className="md:col-span-5 relative">
              <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Buscar por nombre, eslogan o ubicación..."
                className="w-full pl-10 pr-4 py-2 text-sm rounded-lg border border-slate-300 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-slate-900 placeholder:text-slate-400"
              />
            </div>

            <div className="md:col-span-5 flex items-center gap-1.5 overflow-x-auto pb-1 md:pb-0">
              <button
                type="button"
                onClick={() => setCategoryFilter("ALL")}
                className={`px-3 py-1.5 text-xs font-medium rounded-md border transition whitespace-nowrap ${categoryFilter === "ALL" ? "border-slate-900 bg-slate-900 text-white" : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"}`}
              >
                Todos ({projects.length})
              </button>
              <button
                type="button"
                onClick={() => setCategoryFilter("LAND_DEVELOPMENT")}
                className={`px-3 py-1.5 text-xs font-medium rounded-md border transition whitespace-nowrap ${categoryFilter === "LAND_DEVELOPMENT" ? "border-slate-900 bg-slate-900 text-white" : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"}`}
              >
                Loteos ({projects.filter((p) => p.category === "LAND_DEVELOPMENT").length})
              </button>
              <button
                type="button"
                onClick={() => setCategoryFilter("HUASI")}
                className={`px-3 py-1.5 text-xs font-medium rounded-md border transition whitespace-nowrap ${categoryFilter === "HUASI" ? "border-slate-900 bg-slate-900 text-white" : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"}`}
              >
                Huasi ({projects.filter((p) => p.category === "HUASI").length})
              </button>
              <button
                type="button"
                onClick={() => setCategoryFilter("COMMERCIAL")}
                className={`px-3 py-1.5 text-xs font-medium rounded-md border transition whitespace-nowrap ${categoryFilter === "COMMERCIAL" ? "border-slate-900 bg-slate-900 text-white" : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"}`}
              >
                Comercial ({projects.filter((p) => p.category === "COMMERCIAL").length})
              </button>
            </div>

            <div className="md:col-span-2 text-right text-xs text-slate-500 font-medium">
              Mostrando <span className="font-bold text-slate-900">{filteredProjects.length}</span> proyectos
            </div>
          </div>

          {/* Grilla de Tarjetas */}
          {loading ? (
            <div className="py-12 text-center text-slate-500">Cargando catálogo descriptivo...</div>
          ) : filteredProjects.length === 0 ? (
            <div className="py-12 text-center bg-white rounded-2xl border border-slate-200">
              <Search className="w-10 h-10 text-slate-300 mx-auto mb-2" />
              <p className="text-sm font-semibold text-slate-700">No se encontraron proyectos con ese criterio.</p>
              <p className="text-xs text-slate-400 mt-1">Probá con otra palabra o limpiando el filtro.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
              {filteredProjects.map((p) => {
                const categoryBadge =
                  p.category === "HUASI" ? (
                    <span className="px-2 py-0.5 text-[11px] font-bold rounded bg-purple-50 text-purple-700 border border-purple-200">
                      EDIFICIO HUASI
                    </span>
                  ) : p.category === "COMMERCIAL" ? (
                    <span className="px-2 py-0.5 text-[11px] font-bold rounded bg-amber-50 text-amber-700 border border-amber-200">
                      COMERCIAL
                    </span>
                  ) : (
                    <span className="px-2 py-0.5 text-[11px] font-bold rounded bg-blue-50 text-blue-700 border border-blue-200">
                      LOTEO RESIDENCIAL
                    </span>
                  );

                const statusLabel = p.status_label || "En comercialización";
                const statusBadge =
                  statusLabel.includes("Pre-venta") ? (
                    <span className="px-2 py-0.5 text-[11px] font-semibold rounded bg-amber-50 text-amber-800 border border-amber-200">
                      {statusLabel}
                    </span>
                  ) : statusLabel.includes("Venta en pozo") ? (
                    <span className="px-2 py-0.5 text-[11px] font-semibold rounded bg-indigo-50 text-indigo-700 border border-indigo-200">
                      {statusLabel}
                    </span>
                  ) : (
                    <span className="px-2 py-0.5 text-[11px] font-semibold rounded bg-emerald-50 text-emerald-700 border border-emerald-200">
                      {statusLabel}
                    </span>
                  );

                return (
                  <div
                    key={p.public_id}
                    className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-xs hover:shadow-md transition flex flex-col justify-between"
                  >
                    <div>
                      {/* Portada y Logo Superpuesto */}
                      <div className="relative aspect-[16/10] bg-slate-100 overflow-hidden border-b border-slate-100">
                        {p.cover?.url ? (
                          <img
                            src={p.cover.url}
                            alt={p.cover.alt || p.name}
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <div className="w-full h-full flex flex-col items-center justify-center text-slate-400 bg-slate-50">
                            <ImageIcon className="w-8 h-8 mb-1 text-slate-300" />
                            <span className="text-xs">Sin portada asignada</span>
                          </div>
                        )}

                        {/* Badges Superpuestos */}
                        <div className="absolute top-3 left-3 flex flex-wrap gap-1.5">
                          {categoryBadge}
                          {p.is_featured && (
                            <span className="px-2 py-0.5 text-[11px] font-bold rounded bg-slate-900/80 backdrop-blur-sm text-amber-300 border border-amber-300/30">
                              Destacado Hero
                            </span>
                          )}
                        </div>

                        {/* Logo en esquina inferior */}
                        {p.logo?.url && (
                          <div className="absolute bottom-2.5 right-2.5 p-1.5 bg-white/95 backdrop-blur-sm rounded-lg shadow-sm border border-slate-200/80 max-w-[95px] max-h-[40px] flex items-center justify-center">
                            <img
                              src={p.logo.url}
                              alt={p.logo.alt || `Logo ${p.name}`}
                              className="max-h-6 w-auto object-contain"
                            />
                          </div>
                        )}
                      </div>

                      {/* Cuerpo Descriptivo */}
                      <div className="p-5 space-y-3">
                        <div className="space-y-1">
                          <div className="flex items-center justify-between gap-2">
                            <h3 className="text-lg font-bold text-slate-900 tracking-tight">{p.name}</h3>
                            {p.slug && <span className="text-xs text-slate-400 font-mono truncate max-w-[120px]">/{p.slug}</span>}
                          </div>
                          {p.summary && (
                            <p className="text-xs font-medium text-slate-600 italic">“{p.summary}”</p>
                          )}
                        </div>

                        <div className="pt-1">{statusBadge}</div>

                        {p.description && (
                          <p className="text-xs text-slate-500 line-clamp-2 leading-relaxed">
                            {p.description}
                          </p>
                        )}

                        {/* Ubicación */}
                        <div className="pt-2 border-t border-slate-100 flex items-center gap-1.5 text-xs text-slate-500">
                          <MapPin className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                          <span className="truncate">
                            {p.location?.address || (p.location?.city ? `${p.location.city}, ${p.location.province}` : "Ubicación pendiente")}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Acciones de Tarjeta */}
                    <div className="px-5 py-3.5 bg-slate-50 border-t border-slate-100 flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <label className="relative inline-flex items-center cursor-pointer">
                          <input
                            type="checkbox"
                            checked={!!p.is_visible}
                            disabled={togglingVisibility === p.public_id}
                            onChange={(e) => toggleProjectVisibility(p, e.target.checked)}
                            className="sr-only peer"
                          />
                          <div className="w-8 h-4 bg-slate-300 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-3 after:w-3 after:transition-all peer-checked:bg-emerald-600"></div>
                        </label>
                        <span className="text-xs font-medium text-slate-600">
                          {p.is_visible ? "Visible" : "Oculto"}
                        </span>
                      </div>

                      <div className="flex items-center gap-2">
                        {/* Botón Vista Previa Landing */}
                        <button
                          type="button"
                          onClick={() => setPreviewProject(p)}
                          className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold text-slate-700 bg-white border border-slate-300 rounded-md hover:bg-slate-100 transition shadow-xs"
                          title="Previsualizar en la Landing"
                        >
                          <Eye className="w-3.5 h-3.5 text-blue-600" />
                          Vista Previa
                        </button>

                        {/* Botón Editar */}
                        <button
                          type="button"
                          onClick={() => {
                            setSelected(p.public_id);
                            setViewMode("editor");
                          }}
                          className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold text-white bg-slate-900 rounded-md hover:bg-slate-800 transition shadow-xs"
                        >
                          <Edit className="w-3.5 h-3.5" />
                          Editar
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ======================================================== */}
      {/* VISTA 2: FORMULARIO DE EDICIÓN COMPLETO                   */}
      {/* ======================================================== */}
      {(fixedProjectId || viewMode === "editor") && (
        <div className="space-y-6">
          {!section && (
            <nav aria-label="Secciones de Web" className="flex items-center justify-between border-b border-slate-200 pb-3">
              <div className="flex gap-2">
                <Button type="button" variant={tab === "projects" ? "default" : "outline"} aria-pressed={tab === "projects"} onClick={() => setTab("projects")}>
                  Proyectos
                </Button>
                <Button type="button" variant={tab === "hero" ? "default" : "outline"} aria-pressed={tab === "hero"} onClick={() => setTab("hero")}>
                  <Star aria-hidden="true" className="mr-2 h-4 w-4" />
                  Hero
                </Button>
              </div>

              {project && (
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setPreviewProject(project)}
                  className="inline-flex items-center gap-1.5"
                >
                  <Eye className="w-4 h-4 text-blue-600" />
                  Previsualizar en Landing
                </Button>
              )}
            </nav>
          )}

          {/* Selector si está en modo formulario directo */}
          {!fixedProjectId && (
            <label className="block max-w-xl text-sm font-medium">
              Cambiar de proyecto
              <select
                className={inputClass}
                value={selected}
                disabled={saving || loading || uploading || !!pendingUpload}
                onChange={(event) => {
                  if (dirty && !window.confirm("Hay cambios sin guardar. ¿Querés descartarlos?")) return;
                  setSelected(event.target.value);
                  setProject(null);
                  setLoading(true);
                  setDirty(false);
                  setError("");
                  setErrors({});
                  setNotice("");
                }}
              >
                <option value="" disabled>Seleccioná un proyecto</option>
                {projects.map((item) => (
                  <option key={item.public_id} value={item.public_id}>
                    {item.name}
                  </option>
                ))}
              </select>
            </label>
          )}

          {loading && <p role="status">Cargando presentación web…</p>}
          {!loading && projects.length === 0 && !error && <p>No hay proyectos disponibles para tu cuenta.</p>}

          {ready && project && (
            <form onSubmit={(event) => { if (section === "review") event.preventDefault(); else void save(event); }} className="space-y-6">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div>
                  <h2 className="text-xl font-semibold">
                    {section === "material" ? "Material comercial" : section === "review" ? "Revisión y publicación" : tab === "hero" ? "Destacado del inicio" : "Presentación del proyecto"}
                  </h2>
                  <p className="mt-1 text-sm text-slate-600">
                    {project.is_visible ? "Visible en la landing" : "Oculto en la landing"}
                    {dirty ? " · Cambios sin guardar" : ""}
                  </p>
                </div>
                {section !== "review" && (
                  <Button type="submit" disabled={!editable || !dirty}>
                    <Save className="mr-2 h-4 w-4" aria-hidden="true" />
                    {saving ? "Guardando…" : "Guardar cambios"}
                  </Button>
                )}
              </div>

              {!permissions?.can_edit && <p>Tu cuenta puede consultar esta presentación, pero no editarla.</p>}

              {(!section || section === "material") && (
                <section className="space-y-3 rounded-xl border border-slate-200 p-4" aria-label="Archivos del proyecto">
                  <label className="block text-sm font-medium">
                    Cargar imagen o PDF público a Cloudflare R2
                    <input
                      type="file"
                      accept="image/jpeg,image/png,image/webp,image/avif,application/pdf"
                      disabled={!editable || !!pendingUpload}
                      className={inputClass}
                      onChange={(event) => {
                        const file = event.target.files?.[0];
                        event.target.value = "";
                        void upload(file);
                      }}
                    />
                  </label>
                  <p className="text-sm text-slate-600">Hasta 15 MB. Subí únicamente material aprobado para ser público.</p>
                  {uploading && <p role="status">Cargando y verificando archivo en R2…</p>}
                  {pendingUpload && !uploading && (
                    <div className="space-y-2">
                      <p role="status">El archivo se subió, pero falta confirmar su registro.</p>
                      <Button type="button" variant="outline" onClick={() => void retryConfirmation()}>Reintentar confirmación</Button>
                      <Button type="button" variant="outline" onClick={() => { setPendingUpload(null); setNotice("Registro descartado."); }}>Descartar registro pendiente</Button>
                    </div>
                  )}
                  <p className="text-sm text-slate-600">{assets.length} archivos disponibles en Cloudflare R2.</p>
                </section>
              )}

              {assets.length === 0 && (
                <p className="rounded-xl bg-amber-50 p-4 text-sm text-amber-900 dark:bg-amber-950 dark:text-amber-100">
                  Este proyecto todavía no tiene archivos disponibles. Cargá una imagen o un PDF para poder seleccionarlo.
                </p>
              )}

              {section === "review" && (
                <section className="space-y-4 rounded-xl border border-slate-200 p-4" aria-label="Resumen de publicación">
                  <dl className="grid gap-3 sm:grid-cols-2">
                    <div><dt className="font-medium">Nombre público</dt><dd>{project.name || "Pendiente"}</dd></div>
                    <div><dt className="font-medium">URL</dt><dd>{project.slug || "Pendiente"}</dd></div>
                    <div><dt className="font-medium">Ubicación</dt><dd>{[project.location.city, project.location.province].filter(Boolean).join(", ") || "Pendiente"}</dd></div>
                    {unitSummary && <div><dt className="font-medium">Unidades</dt><dd>{unitSummary.loaded} cargadas · {unitSummary.declared || "Sin cantidad"} declaradas</dd></div>}
                    <div><dt className="font-medium">Material</dt><dd>{assets.length} archivos · {project.gallery.length} imágenes en galería · {project.documents.length} documentos</dd></div>
                    <div><dt className="font-medium">Resumen</dt><dd>{project.summary || "Pendiente"}</dd></div>
                    <div><dt className="font-medium">Categoría</dt><dd>{project.category || "Pendiente"}</dd></div>
                  </dl>
                  {informative.length > 0 && (
                    <div className="space-y-2 rounded-lg bg-amber-50 p-3 text-sm text-amber-900 dark:bg-amber-950 dark:text-amber-100">
                      <p>Faltantes informativos: {informative.join(", ")}.</p>
                      {onGoToStep && (
                        <div className="flex flex-wrap gap-2">
                          <Button type="button" variant="outline" disabled={busy} onClick={() => onGoToStep(2)}>Ir a Unidades</Button>
                          <Button type="button" variant="outline" disabled={busy} onClick={() => onGoToStep(3)}>Ir a Material comercial</Button>
                        </div>
                      )}
                    </div>
                  )}
                  {project.is_visible ? (
                    <p role="status">Este proyecto ya está publicado. Podés administrar su visibilidad desde Web.</p>
                  ) : (
                    <>
                      {missing.length > 0 && (
                        <div className="space-y-2 rounded-lg bg-amber-50 p-3 text-amber-900 dark:bg-amber-950 dark:text-amber-100">
                          <p className="font-medium">Requisitos que bloquean la publicación:</p>
                          <ul className="list-inside list-disc">{missing.map((item) => <li key={item}>{item}</li>)}</ul>
                          {onGoToStep && <Button type="button" variant="outline" disabled={busy} onClick={() => onGoToStep(4)}>Volver a Presentación Web</Button>}
                        </div>
                      )}
                      <label className="flex min-h-11 items-center gap-3">
                        <input type="checkbox" className="h-5 w-5" checked={project.is_featured} disabled={!editable || !permissions?.can_publish || !project.cover} onChange={(event) => change({ is_featured: event.target.checked })} />
                        Destacar en el inicio (requiere portada)
                      </label>
                      <div className="flex flex-wrap gap-3">
                        <Button type="button" variant="outline" disabled={!editable || !dirty || !!pendingUpload} onClick={() => void save(undefined, false)}>{saving ? "Guardando…" : "Guardar borrador"}</Button>
                        <Button type="button" disabled={!editable || !permissions?.can_publish || missing.length > 0 || !!pendingUpload} onClick={() => void save(undefined, true)}>{saving ? "Publicando…" : "Publicar en Web"}</Button>
                      </div>
                      {!permissions?.can_publish && <p>Tu cuenta no tiene permiso para publicar.</p>}
                    </>
                  )}
                </section>
              )}

              {section === "material" && <fieldset disabled={!editable}>{textField("Descripción pública", "description", project.description, (description) => change({ description }), 20000, true)}</fieldset>}

              {section !== "material" && section !== "review" && (
                <fieldset disabled={!editable} className="space-y-6 disabled:opacity-70">
                  {!section && (
                    <div className="flex flex-wrap gap-6 rounded-xl border border-slate-200 p-4">
                      <label className="flex min-h-11 items-center gap-3">
                        <input type="checkbox" className="h-5 w-5" disabled={!permissions?.can_publish} checked={project.is_visible} onChange={(event) => change({ is_visible: event.target.checked, is_featured: event.target.checked && project.is_featured })} />
                        Mostrar en la landing
                      </label>
                      <label className="flex min-h-11 items-center gap-3">
                        <input type="checkbox" className="h-5 w-5" disabled={!permissions?.can_publish || !project.is_visible || !project.cover} checked={project.is_featured} onChange={(event) => change({ is_featured: event.target.checked })} />
                        Destacar en el inicio
                      </label>
                    </div>
                  )}

                  {tab === "hero" && (
                    <p className="text-sm text-slate-600">
                      El hero usa el nombre, resumen, categoría, portada y logo del proyecto. Para destacarlo, primero publicalo con una portada válida.
                    </p>
                  )}

                  <div className="grid gap-5 md:grid-cols-2">
                    {textField("Nombre público", "name", project.name, (name) => change({ name }), 160)}
                    <label className="block text-sm font-medium">
                      Categoría editorial
                      <select id="category" className={inputClass} value={project.category ?? ""} onChange={(event) => change({ category: event.target.value as LandingProject["category"] })}>
                        <option value="" disabled>Seleccioná una categoría</option>
                        <option value="HUASI">Departamentos Huasi</option>
                        <option value="LAND_DEVELOPMENT">Loteos y urbanizaciones</option>
                        <option value="COMMERCIAL">Locales y cocheras</option>
                      </select>
                      {fieldError("category")}
                    </label>
                    {textField("Resumen para tarjetas y hero", "summary", project.summary, (summary) => change({ summary }), 400, true)}
                    <label className="block text-sm font-medium">
                      Orden {tab === "hero" ? "en el hero" : "en el catálogo"}
                      <input id={tab === "hero" ? "featured_order" : "sort_order"} type="number" min={0} max={4294967295} step={1} className={inputClass} value={tab === "hero" ? project.featured_order : project.sort_order} onChange={(event) => change(tab === "hero" ? { featured_order: Number(event.target.value) } : { sort_order: Number(event.target.value) })} />
                      <span className="text-sm font-normal text-slate-500">Los números menores aparecen primero.</span>
                      {fieldError(tab === "hero" ? "featured_order" : "sort_order")}
                    </label>
                  </div>

                  <div className="grid gap-5 md:grid-cols-2">
                    {imageEditor("Portada", "cover", project.cover, (cover) => change({ cover, is_featured: !!cover && project.is_featured }))}
                    <div className="space-y-3 rounded-xl border border-slate-200 p-4">
                      {assetSelect("Logo", "logo.url", project.logo?.url ?? "", (url) => change({ logo: url ? { url, alt: project.logo?.alt ?? "" } : null }))}
                      {project.logo && textField("Texto alternativo del logo", "logo.alt", project.logo.alt, (alt) => change({ logo: { ...project.logo!, alt } }), 300)}
                    </div>
                  </div>

                  {tab === "projects" && (
                    <>
                      {textField("URL del proyecto (queda fija al publicar)", "slug", project.slug, (slug) => change({ slug }), 120)}
                      {textField("Descripción pública", "description", project.description, (description) => change({ description }), 20000, true)}
                      <div className="grid gap-5 md:grid-cols-2">
                        {textField("Ciudad", "location.city", project.location.city, (city) => change({ location: { ...project.location, city } }), 160)}
                        {textField("Provincia", "location.province", project.location.province, (province) => change({ location: { ...project.location, province } }), 160)}
                        {textField("Dirección pública", "location.address", project.location.address, (address) => change({ location: { ...project.location, address: address || null } }), 300)}
                        {textField("Etiqueta de estado", "status_label", project.status_label, (status_label) => change({ status_label: status_label || null }), 100)}
                      </div>

                      <section className="space-y-4">
                        <h3 className="text-lg font-semibold">Galería</h3>
                        {project.gallery.map((image, index) => (
                          <div key={index} className="space-y-2">
                            {imageEditor(`Imagen ${index + 1}`, `gallery.${index}`, image, (next) => change({ gallery: next ? project.gallery.map((item, i) => (i === index ? next : item)) : project.gallery.filter((_, i) => i !== index) }))}
                            <div className="flex gap-2">
                              <Button type="button" variant="outline" disabled={index === 0} onClick={() => { const gallery = [...project.gallery]; [gallery[index - 1], gallery[index]] = [gallery[index], gallery[index - 1]]; change({ gallery }); }}>Subir imagen {index + 1}</Button>
                              <Button type="button" variant="outline" onClick={() => change({ gallery: project.gallery.filter((_, i) => i !== index) })}>Quitar imagen {index + 1}</Button>
                            </div>
                          </div>
                        ))}
                        <Button type="button" variant="outline" disabled={project.gallery.length >= 100 || !assets.some((a) => a.mime_type.startsWith("image/"))} onClick={() => change({ gallery: [...project.gallery, { url: assets.find((a) => a.mime_type.startsWith("image/"))!.url, alt: "", kind: "PHOTO" }] })}>
                          Agregar imagen
                        </Button>
                        {fieldError("gallery")}
                      </section>

                      <section className="space-y-4">
                        <h3 className="text-lg font-semibold">Características</h3>
                        <p className="text-sm text-slate-600">Una por línea, en el orden en que se mostrarán. Máximo 100.</p>
                        <label className="block text-sm font-medium">
                          Listado de características
                          <textarea id="features" className={inputClass} rows={5} value={project.features.join("\n")} onChange={(event) => change({ features: event.target.value === "" ? [] : event.target.value.split("\n") })} />
                        </label>
                        {fieldError("features")}
                      </section>

                      <section className="space-y-4">
                        <h3 className="text-lg font-semibold">Documentos públicos</h3>
                        {project.documents.map((document, index) => (
                          <div className="space-y-3 rounded-xl border border-slate-200 p-4" key={index}>
                            {assetSelect(`PDF ${index + 1}`, `documents.${index}.url`, document.url, (url) => change({ documents: project.documents.map((item, i) => (i === index ? { ...item, url } : item)) }), true)}
                            {textField("Título del documento", `documents.${index}.title`, document.title, (title) => change({ documents: project.documents.map((item, i) => (i === index ? { ...item, title } : item)) }), 160)}
                            <div className="flex gap-2">
                              <Button type="button" variant="outline" disabled={index === 0} onClick={() => { const documents = [...project.documents]; [documents[index - 1], documents[index]] = [documents[index], documents[index - 1]]; change({ documents }); }}>Subir documento {index + 1}</Button>
                              <Button type="button" variant="outline" onClick={() => change({ documents: project.documents.filter((_, i) => i !== index) })}>Quitar documento {index + 1}</Button>
                            </div>
                          </div>
                        ))}
                        <Button type="button" variant="outline" disabled={project.documents.length >= 30 || !assets.some((a) => a.mime_type === "application/pdf")} onClick={() => change({ documents: [...project.documents, { url: assets.find((a) => a.mime_type === "application/pdf")!.url, title: "" }] })}>
                          Agregar PDF
                        </Button>
                        {fieldError("documents")}
                      </section>
                    </>
                  )}
                </fieldset>
              )}
            </form>
          )}
        </div>
      )}

      {/* ======================================================== */}
      {/* MODAL DE VISTA PREVIA LANDING (SIMULADOR FIEL)           */}
      {/* ======================================================== */}
      {previewProject && (
        <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-3 sm:p-6 overflow-y-auto">
          <div className="bg-white rounded-2xl shadow-2xl max-w-4xl w-full border border-slate-200 overflow-hidden flex flex-col max-h-[92vh]">
            {/* Barra de Navegador Simulado */}
            <div className="bg-slate-900 text-white px-4 py-3 flex items-center justify-between border-b border-slate-800 shrink-0">
              <div className="flex items-center gap-2">
                <span className="w-3 h-3 rounded-full bg-rose-500 inline-block" />
                <span className="w-3 h-3 rounded-full bg-amber-500 inline-block" />
                <span className="w-3 h-3 rounded-full bg-emerald-500 inline-block" />
                <span className="ml-3 font-mono text-xs text-slate-300 bg-slate-800 px-3 py-1 rounded-md border border-slate-700">
                  https://www.bellomojujuy.com.ar/proyectos/{previewProject.slug || "proyecto"}
                </span>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-xs text-emerald-400 font-medium flex items-center gap-1">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  Sincronizado con API
                </span>
                <button
                  type="button"
                  onClick={() => setPreviewProject(null)}
                  className="text-slate-400 hover:text-white p-1 rounded-md hover:bg-slate-800 transition"
                  aria-label="Cerrar vista previa"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Contenido renderizado con los estilos de la Landing de Bellomo */}
            <div className="overflow-y-auto p-6 space-y-6 bg-[#f4f6f9] text-[#00375c]">
              {/* Encabezado del Desarrollo */}
              <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                  <div className="flex items-center gap-2 mb-2">
                    <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                      {previewProject.status_label || "En comercialización"}
                    </span>
                    <span className="text-xs uppercase font-bold tracking-wider text-slate-400">
                      {previewProject.category === "HUASI" ? "Edificios Huasi" : previewProject.category === "COMMERCIAL" ? "Comercial" : "Loteos Residenciales"}
                    </span>
                  </div>
                  <h2 className="text-3xl font-extrabold text-[#00375c]">{previewProject.name}</h2>
                  {previewProject.summary && (
                    <p className="text-base text-slate-600 italic mt-1">“{previewProject.summary}”</p>
                  )}
                </div>
                {previewProject.logo?.url && (
                  <div className="shrink-0 flex items-center justify-center p-2 bg-slate-50 rounded-xl border border-slate-200 w-32 h-20">
                    <img
                      src={previewProject.logo.url}
                      alt={previewProject.logo.alt || `Logo ${previewProject.name}`}
                      className="max-h-14 w-auto object-contain"
                    />
                  </div>
                )}
              </div>

              {/* Portada y Galería */}
              <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs space-y-3">
                <div className="relative aspect-video rounded-xl overflow-hidden bg-slate-100 border border-slate-200">
                  {previewProject.cover?.url ? (
                    <img
                      src={previewProject.cover.url}
                      alt={previewProject.cover.alt || previewProject.name}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="w-full h-full flex flex-col items-center justify-center text-slate-400">
                      <ImageIcon className="w-10 h-10 mb-2 text-slate-300" />
                      <span className="text-sm font-medium">Sin imagen de portada</span>
                    </div>
                  )}
                  <div className="absolute bottom-3 left-3 bg-slate-900/80 backdrop-blur-xs text-white px-3 py-1 rounded-md text-xs font-medium">
                    Vista de Portada Oficial
                  </div>
                </div>

                {/* Galería de miniaturas */}
                {previewProject.gallery && previewProject.gallery.length > 0 && (
                  <div className="flex gap-2 overflow-x-auto pb-1">
                    {previewProject.gallery.slice(0, 6).map((img, idx) => (
                      <div key={idx} className="w-20 h-14 rounded-lg overflow-hidden border border-slate-200 shrink-0">
                        <img src={img.url} alt={img.alt || `Foto ${idx + 1}`} className="w-full h-full object-cover" />
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Memoria Descriptiva & Servicios */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="md:col-span-2 bg-white p-6 rounded-2xl border border-slate-200 shadow-xs space-y-4">
                  <h3 className="text-lg font-bold text-[#00375c] border-b border-slate-100 pb-2">
                    Memoria Descriptiva
                  </h3>
                  <p className="text-sm leading-relaxed text-slate-700 whitespace-pre-line">
                    {previewProject.description || "Sin descripción cargada aún."}
                  </p>

                  {previewProject.features && previewProject.features.length > 0 && (
                    <div className="pt-4 border-t border-slate-100">
                      <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-2">
                        Servicios y Equipamiento
                      </h4>
                      <div className="flex flex-wrap gap-2">
                        {previewProject.features.map((feat, idx) => (
                          <span
                            key={idx}
                            className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded-md bg-slate-100 text-slate-800 border border-slate-200"
                          >
                            <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                            {feat}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                {/* Columna lateral: Ubicación y Contacto */}
                <div className="space-y-4">
                  <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs space-y-3">
                    <h4 className="text-sm font-bold text-[#00375c]">Ubicación y Entorno</h4>
                    <div className="text-xs text-slate-600 space-y-1">
                      <p>
                        <span className="font-semibold text-slate-900">Ciudad:</span>{" "}
                        {previewProject.location?.city || "Pendiente"}
                      </p>
                      <p>
                        <span className="font-semibold text-slate-900">Provincia:</span>{" "}
                        {previewProject.location?.province || "Pendiente"}
                      </p>
                      <p>
                        <span className="font-semibold text-slate-900">Dirección:</span>{" "}
                        {previewProject.location?.address || "Consultar ubicación"}
                      </p>
                    </div>
                    {previewProject.description?.includes("https://") && (
                      <a
                        href={previewProject.description.match(/https:\/\/[^\s]+/)?.[0] || "#"}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="mt-3 inline-flex items-center justify-center gap-1.5 w-full py-2 text-xs font-semibold text-blue-700 bg-blue-50 border border-blue-200 rounded-lg hover:bg-blue-100 transition"
                      >
                        <MapPin className="w-3.5 h-3.5" />
                        Ver en Google Maps
                      </a>
                    )}
                  </div>

                  {/* CTA Comercial Simulado */}
                  <div className="bg-emerald-50 border border-emerald-200 p-5 rounded-2xl space-y-2">
                    <h4 className="text-sm font-bold text-emerald-900">¿Interesado en este desarrollo?</h4>
                    <p className="text-xs text-emerald-700">
                      Canal directo conectado con asesores e inteligencia artificial de EverProp.
                    </p>
                    <button
                      type="button"
                      onClick={() => alert(`Consulta simulada para ${previewProject.name}`)}
                      className="w-full mt-2 py-2.5 px-3 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-lg transition shadow-xs flex items-center justify-center gap-2"
                    >
                      <Phone className="w-4 h-4" />
                      Consultar por WhatsApp
                    </button>
                  </div>
                </div>
              </div>
            </div>

            {/* Footer del Modal */}
            <div className="bg-slate-50 px-6 py-3 border-t border-slate-200 flex items-center justify-between text-xs text-slate-500 shrink-0">
              <span>Esta es una previsualización en vivo generada a partir del contrato JSON de la API.</span>
              <Button type="button" variant="outline" onClick={() => setPreviewProject(null)}>
                Cerrar
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
