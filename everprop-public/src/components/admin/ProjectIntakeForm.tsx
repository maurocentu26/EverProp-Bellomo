"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft, Check, FolderPlus, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { apiFetch, EverpropApiError, loadEverpropPropertiesByProject } from "@/lib/everprop-api";
import { useAuth } from "@/lib/auth-context";
import { JUJUY_CITIES, type Property } from "@/data/admin-sample";
import { emptyIntakeBasics, intakeBasics, intakePayload, type IntakeBasics, type IntakeOption, type ProjectIntake } from "@/lib/project-intake";
import { GenerateLotsModal } from "@/components/admin/GenerateLotsModal";
import NewPropertyForm from "@/components/admin/NewPropertyForm";
import ProjectWebEditor from "@/components/admin/ProjectWebEditor";

const steps = ["Datos básicos", "Unidades", "Material comercial", "Presentación Web", "Revisión y publicación"];
const fieldClass = "mt-2 min-h-11 w-full rounded-lg border border-border bg-background px-3 py-2 text-base focus-visible:outline-2 focus-visible:outline-ring";
type PendingCreate = { request_key: string; payload: ReturnType<typeof intakePayload> };

export default function ProjectIntakeForm() {
  const router = useRouter();
  const query = useSearchParams();
  const { currentUser } = useAuth();
  const projectId = query.get("project") ?? "";
  const step = Math.min(5, Math.max(1, Number(query.get("step")) || 1));
  const [intake, setIntake] = useState<ProjectIntake | null>(null);
  const [options, setOptions] = useState<IntakeOption[]>([]);
  const [canCreate, setCanCreate] = useState(false);
  const [form, setForm] = useState<IntakeBasics>(emptyIntakeBasics);
  const [properties, setProperties] = useState<Property[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [editorBusy, setEditorBusy] = useState(false);
  const [manual, setManual] = useState(false);
  const [unitSaving, setUnitSaving] = useState(false);
  const [lots, setLots] = useState(false);
  const [pending, setPending] = useState<PendingCreate | null>(null);
  const [error, setError] = useState("");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({});
  const [notice, setNotice] = useState("");
  const [attempt, setAttempt] = useState(0);
  const submitLock = useRef(false);
  const errorRef = useRef<HTMLDivElement>(null);
  const storageKey = currentUser ? `everprop:intake-request:${currentUser.id}` : "";

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true); setError("");
    const request = projectId
      ? apiFetch<{ data: ProjectIntake }>(`/api/v1/admin/project-intakes/${encodeURIComponent(projectId)}`, { signal: controller.signal }).then(async ({ data }) => {
          const units = await loadEverpropPropertiesByProject(projectId);
          if (controller.signal.aborted) return;
          setIntake(data); setForm(intakeBasics(data.project)); setProperties(units); setDirty(false);
        })
      : apiFetch<{ data: IntakeOption[]; can_create: boolean }>("/api/v1/admin/project-intakes", { signal: controller.signal }).then(({ data, can_create }) => {
          if (controller.signal.aborted) return;
          setOptions(data); setCanCreate(can_create); setIntake(null);
        });
    request.catch((reason) => { if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : "No se pudo cargar el ingreso."); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [projectId, attempt]);

  useEffect(() => {
    if (!storageKey || projectId) return;
    try {
      const stored = sessionStorage.getItem(storageKey);
      if (stored) {
        const saved: PendingCreate = JSON.parse(stored);
        if (typeof saved.request_key === "string" && saved.payload) {
          setPending(saved);
          setForm({ ...saved.payload, address: saved.payload.address ?? "", progress: saved.payload.progress == null ? "" : String(saved.payload.progress), total_units: saved.payload.total_units ? String(saved.payload.total_units) : "" });
        }
      }
    } catch { setError("No se pudo recuperar la solicitud. Revisá los ingresos recientes antes de iniciar otro."); }
  }, [storageKey, projectId]);

  const blocked = saving || editorBusy || manual || lots;
  useEffect(() => {
    if (!dirty && !blocked && !pending) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty, blocked, pending]);
  const setWebBusy = useCallback((busy: boolean) => setEditorBusy(busy), []);

  function go(next: number) {
    if (blocked || dirty || !projectId) return;
    setNotice(""); setError("");
    router.replace(`/admin/desarrollos/nuevo?project=${encodeURIComponent(projectId)}&step=${next}`);
  }
  function change(key: keyof IntakeBasics, value: string) { setForm((previous) => ({ ...previous, [key]: value })); setDirty(true); setNotice(""); }
  function showError(reason: unknown) {
    setError(reason instanceof Error ? reason.message : "No se pudo guardar el proyecto.");
    if (reason instanceof EverpropApiError) setFieldErrors(reason.errors ?? {});
    requestAnimationFrame(() => errorRef.current?.focus());
  }
  async function saveBasics(event: React.FormEvent) {
    event.preventDefault();
    if (submitLock.current || !storageKey) return;
    submitLock.current = true; setSaving(true); setError(""); setFieldErrors({});
    try {
      const payload = pending?.payload ?? intakePayload(form);
      if (!projectId) {
        const request = pending ?? { request_key: crypto.randomUUID(), payload };
        // Keep the exact retry request across reloads until the server acknowledges the project.
        sessionStorage.setItem(storageKey, JSON.stringify(request)); setPending(request);
        const { data } = await apiFetch<{ data: ProjectIntake }>("/api/v1/admin/project-intakes", { method: "POST", body: JSON.stringify({ ...request.payload, request_key: request.request_key }) });
        sessionStorage.removeItem(storageKey); setPending(null); setDirty(false); setIntake(data);
        router.replace(`/admin/desarrollos/nuevo?project=${data.project.public_id}&step=2`);
      } else {
        await apiFetch(`/api/v1/admin/projects/${projectId}`, { method: "PUT", body: JSON.stringify(payload) });
        setDirty(false); setNotice("Datos guardados. Podés continuar o retomarlo después."); setAttempt((value) => value + 1);
      }
    } catch (reason) {
      if (reason instanceof EverpropApiError && reason.status === 422 && !projectId) {
        sessionStorage.removeItem(storageKey); setPending(null);
      }
      showError(reason);
    } finally { submitLock.current = false; setSaving(false); }
  }
  function input(label: string, key: keyof IntakeBasics, type = "text", max?: number) {
    return <label className="block text-sm font-medium" htmlFor={`intake-${key}`}>{label}<input id={`intake-${key}`} type={type} value={form[key]} onChange={(event) => change(key, event.target.value)} className={fieldClass} min={type === "number" ? 0 : undefined} max={max} step={type === "number" ? 1 : undefined} maxLength={type === "text" ? (key === "name" ? 200 : key === "address" ? 500 : 160) : undefined} aria-invalid={!!fieldErrors[key]} aria-describedby={fieldErrors[key] ? `intake-${key}-error` : undefined} />{fieldErrors[key] && <span id={`intake-${key}-error`} className="mt-1 block text-sm text-red-700 dark:text-red-300">{fieldErrors[key].join(" ")}</span>}</label>;
  }

  return <div className="mx-auto max-w-5xl space-y-6 pb-10">
    <Link href="/admin/desarrollos" className="inline-flex min-h-11 items-center gap-2 text-sm text-muted-foreground" onClick={(event) => { if (dirty || blocked || pending) { event.preventDefault(); setError("Guardá los cambios o terminá la operación antes de salir."); } }}><ArrowLeft className="size-4" aria-hidden="true" />Proyectos y desarrollos</Link>
    <header className="space-y-2"><p className="text-sm font-medium text-muted-foreground">Inventario · Ingreso de proyectos</p><h1 className="text-3xl font-bold tracking-tight">{intake?.project.name ?? "Nuevo proyecto"}</h1><p className="text-muted-foreground">Completá lo que ya conocés, guardá el avance y prepará su publicación.</p></header>
    <nav aria-label="Pasos del ingreso"><ol className="grid gap-2 sm:grid-cols-5">{steps.map((label, index) => <li key={label}><button type="button" disabled={!projectId || blocked || dirty} onClick={() => go(index + 1)} aria-current={step === index + 1 ? "step" : undefined} className={`flex min-h-14 w-full items-center gap-2 rounded-xl border px-3 py-2 text-left text-sm disabled:cursor-not-allowed ${step === index + 1 ? "border-primary bg-primary/10 font-semibold" : "border-border text-muted-foreground"}`}><span className="flex size-6 shrink-0 items-center justify-center rounded-full border text-xs">{index + 1}</span>{label}</button></li>)}</ol></nav>
    {error && <div ref={errorRef} tabIndex={-1} role="alert" className="rounded-xl border border-red-300 bg-red-50 p-4 text-red-900 dark:bg-red-950 dark:text-red-100">{error}<Button type="button" variant="outline" className="ml-3" disabled={blocked || dirty || !!pending} onClick={() => setAttempt((value) => value + 1)}>Volver a cargar</Button></div>}
    {notice && <p role="status" className="rounded-xl bg-emerald-50 p-4 text-emerald-900 dark:bg-emerald-950 dark:text-emerald-100"><Check className="mr-2 inline size-4" aria-hidden="true" />{notice}</p>}
    {loading ? <p role="status" className="p-8">Cargando proyecto…</p> : <>
      {(!projectId || step === 1) && <>
        {!projectId && options.length > 0 && <section className="rounded-xl border border-border p-5"><h2 className="font-semibold">Retomar un ingreso</h2><ul className="mt-2 divide-y divide-border">{options.map((option) => <li key={option.public_id}><Link className="flex min-h-11 flex-wrap items-center justify-between gap-2 py-2 text-sm underline underline-offset-4" href={`/admin/desarrollos/nuevo?project=${option.public_id}&step=1`} onClick={(event) => { if (dirty || blocked || pending) { event.preventDefault(); setError("Guardá o resolvé el alta pendiente antes de retomar otro ingreso."); } }}>{option.name}<span className="text-xs text-muted-foreground">{option.is_visible ? "Publicado" : "Borrador"}</span></Link></li>)}</ul></section>}
        {(!projectId && !canCreate) || (intake && !intake.can_edit) ? <p role="status">Tu perfil no tiene permiso para ingresar o editar este proyecto.</p> : <form onSubmit={saveBasics} className="space-y-6 rounded-2xl border border-border bg-card p-5 sm:p-8">
          <div><h2 className="text-xl font-semibold">1. Datos básicos</h2><p className="mt-1 text-sm text-muted-foreground">El proyecto se guarda oculto. Las unidades se cargan en el paso siguiente.</p></div>
          {pending && <p role="status" className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900 dark:bg-amber-950 dark:text-amber-100">Falta confirmar el alta anterior. Reintentá la misma solicitud para recuperar el proyecto sin duplicarlo.</p>}
          <fieldset disabled={saving || !!pending} className="grid gap-5 sm:grid-cols-2">
            {input("Nombre del proyecto *", "name")}
            <label className="block text-sm font-medium">Tipo de proyecto *<select required className={fieldClass} value={form.project_type} onChange={(event) => change("project_type", event.target.value)}><option value="">Seleccionar tipo</option><option value="LAND_DEVELOPMENT">Loteo / urbanización</option><option value="BUILDING">Edificio</option><option value="COMMERCIAL">Locales / cocheras</option></select>{fieldErrors.project_type && <span role="alert">{fieldErrors.project_type.join(" ")}</span>}</label>
            <label className="block text-sm font-medium" htmlFor="intake-city">Ciudad / localidad *<input id="intake-city" list="intake-cities" className={fieldClass} value={form.city} maxLength={160} onChange={(event) => change("city", event.target.value)} aria-invalid={!!fieldErrors.city} /><datalist id="intake-cities">{JUJUY_CITIES.map((city) => <option key={city} value={city} />)}</datalist>{fieldErrors.city && <span role="alert">{fieldErrors.city.join(" ")}</span>}</label>
            {input("Provincia *", "province")}{input("Dirección", "address")}
            <label className="block text-sm font-medium">Etapa del desarrollo<select className={fieldClass} value={form.status} onChange={(event) => change("status", event.target.value)}><option value="UNKNOWN">Sin confirmar</option><option value="PLANNING">En planificación</option><option value="PRE_SALE">Preventa</option><option value="UNDER_CONSTRUCTION">En construcción</option><option value="COMPLETED">Finalizado</option><option value="AVAILABLE">Disponible (inventario heredado)</option></select>{fieldErrors.status && <span role="alert">{fieldErrors.status.join(" ")}</span>}</label>
            <div>{input("Avance de obra (%)", "progress", "number", 100)}<p className="mt-1 text-xs text-muted-foreground">Dejalo vacío si todavía no fue confirmado.</p></div>
            <div>{input("Unidades totales declaradas", "total_units", "number", 4294967295)}<p className="mt-1 text-xs text-muted-foreground">Opcional. Este dato no crea unidades.</p></div>
          </fieldset>
          <Button type="submit" disabled={saving || !storageKey}><Save className="mr-2 size-4" aria-hidden="true" />{saving ? "Guardando…" : pending ? "Reintentar alta" : projectId ? "Guardar datos" : "Guardar y continuar"}</Button>
        </form>}
      </>}
      {intake && step === 2 && <section className="space-y-5 rounded-2xl border border-border bg-card p-5 sm:p-8"><h2 className="text-xl font-semibold">2. Unidades del proyecto</h2><p className="text-muted-foreground">{properties.length} cargadas · {intake.project.total_units || "Sin cantidad"} declaradas. La disponibilidad de cada unidad se administra en Inventario.</p>{intake.project.total_units > 0 && properties.length !== intake.project.total_units && <p className="text-sm text-amber-800 dark:text-amber-200">La cantidad cargada todavía no coincide con la declarada. Podés continuar y completarla después.</p>}
        {intake.can_edit && <div className="flex flex-wrap gap-3"><Button type="button" variant="outline" disabled={manual || lots} onClick={() => setManual(true)}><FolderPlus className="mr-2 size-4" aria-hidden="true" />Cargar una unidad</Button>{intake.project.project_type === "LAND_DEVELOPMENT" && <Button type="button" variant="outline" disabled={manual || lots} onClick={() => setLots(true)}>Generar lotes por manzana</Button>}</div>}
        {manual && <div className="space-y-4 border-t border-border pt-4"><p className="text-sm text-muted-foreground">Guardá la unidad o cancelá su carga para continuar con el proyecto.</p><NewPropertyForm onBusyChange={setUnitSaving} initialProjectId={projectId} initialCategory={intake.project.project_type === "LAND_DEVELOPMENT" ? "loteo" : intake.project.project_type === "BUILDING" ? "tradicional" : "comercial"} initialType={intake.project.project_type === "LAND_DEVELOPMENT" ? "Lote" : intake.project.project_type === "BUILDING" ? "Departamento" : "Local"} onSaved={() => { setManual(false); setAttempt((value) => value + 1); }} /><Button type="button" variant="outline" disabled={unitSaving} onClick={() => setManual(false)}>Cancelar carga de unidad</Button></div>}
        {properties.length > 0 && <ul className="divide-y divide-border">{properties.map((unit) => <li key={unit.id} className="flex flex-wrap justify-between gap-2 py-3 text-sm"><span>{unit.title}</span><span className="text-muted-foreground">{unit.unitNumber ?? "Sin número"} · {unit.propertyType}</span></li>)}</ul>}
        <GenerateLotsModal intakeMode open={lots} onOpenChange={setLots} defaultProjectId={projectId} onSuccess={() => { setLots(false); setAttempt((value) => value + 1); }} />
      </section>}
      {intake && step >= 3 && <section className="rounded-2xl border border-border bg-card p-5 sm:p-8"><h2 className="mb-5 text-xl font-semibold">{step}. {steps[step - 1]}</h2><ProjectWebEditor key={`${projectId}-${step}`} fixedProjectId={projectId} section={step === 3 ? "material" : step === 4 ? "presentation" : "review"} unitSummary={{ loaded: properties.length, declared: intake.project.total_units }} onGoToStep={go} onBusyChange={setWebBusy} /></section>}
      {projectId && intake && <footer className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-card p-4"><Button type="button" variant="outline" disabled={step === 1 || blocked || dirty} onClick={() => go(step - 1)}>Anterior</Button><p className="text-sm text-muted-foreground">{dirty || editorBusy ? "Guardá los cambios para continuar." : "El avance guardado queda disponible para retomar."}</p>{step < 5 ? <Button type="button" disabled={blocked || dirty} onClick={() => go(step + 1)}>Continuar</Button> : <Link href="/admin/desarrollos" className="inline-flex min-h-11 items-center px-4 text-sm underline" onClick={(event) => { if (blocked || dirty) event.preventDefault(); }}>Volver al listado</Link>}</footer>}
    </>}
  </div>;
}
