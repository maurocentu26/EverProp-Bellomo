"use client";

import { useEffect, useState } from "react";
import { ArrowRight, BarChart3, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useCurrentSession } from "@/hooks/use-current-session";
import { loadCommercialStatistics, type CommercialStatistics } from "@/lib/commercial-statistics-api";
import { AdvisorChart, EvolutionChart, formatDuration, formatNumber, formatPercent, panelClass } from "@/components/admin/statistics/StatisticsCharts";

type Filters = { from: string; to: string; advisor: string };
type View = "Resumen" | "Equipo" | "Atención";
type Period = "today" | "week" | "month" | "quarter" | "custom";
const field = "mt-1 min-h-10 w-full rounded-lg border border-input bg-background px-3 text-sm focus-visible:outline-2 focus-visible:outline-blue-600";
function today() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Argentina/Buenos_Aires", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}
function dates(period: Exclude<Period, "custom">) {
  const to = today();
  const start = new Date(`${to}T12:00:00Z`);
  start.setUTCDate(start.getUTCDate() - (period === "week" ? 6 : period === "quarter" ? 89 : 0));
  return { from: period === "month" ? `${to.slice(0, 7)}-01` : start.toISOString().slice(0, 10), to };
}
function initialFilters(): Filters { return { ...dates("month"), advisor: "" }; }

export default function CommercialStatisticsPage() {
  const { user, isReady } = useCurrentSession();
  const allowed = !!user && user.source === "api" && ["TENANT_ADMIN", "SALES_MANAGER"].includes(user.apiRole || "");
  const [view, setView] = useState<View>("Resumen");
  const [period, setPeriod] = useState<Period>("month");
  const [draft, setDraft] = useState(initialFilters);
  const [filters, setFilters] = useState(initialFilters);
  const [data, setData] = useState<CommercialStatistics | null>(null);
  const [appliedAdvisor, setAppliedAdvisor] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    if (!allowed) return;
    const controller = new AbortController();
    void loadCommercialStatistics(filters, controller.signal).then(result => {
      if (!controller.signal.aborted) {
        setData(result.data); setAppliedAdvisor(filters.advisor); setError(""); setLoading(false);
      }
    }).catch(reason => {
      if (!controller.signal.aborted) { setError(reason instanceof Error ? reason.message : "No se pudieron cargar las estadísticas."); setLoading(false); }
    });
    return () => controller.abort();
  }, [allowed, filters]);
  function apply(next: Filters) { setDraft(next); setLoading(true); setError(""); setFilters(next); }
  function choosePeriod(next: Period) {
    setPeriod(next);
    if (next !== "custom") apply({ ...filters, ...dates(next) });
  }
  function selectRange(from: string, to: string) { setPeriod("custom"); apply({ ...filters, from, to }); }
  if (!isReady || !user) return <p role="status">Cargando sesión…</p>;
  if (!allowed) return <p role="alert" className={panelClass}>El panel de Dirección está disponible para administradores y gerentes con una sesión de la API.</p>;
  const total = data?.total;
  const advisorName = data?.advisor_options.find(a => a.id === appliedAdvisor)?.name || "Todo el equipo";
  return <div className="mx-auto max-w-7xl space-y-5 pb-8">
    <header className="flex flex-wrap items-end justify-between gap-3">
      <div><p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Dirección comercial</p><h1 className="mt-1 text-2xl font-bold tracking-tight sm:text-3xl">Estadísticas</h1><p className="mt-2 text-sm text-muted-foreground">Resultados, evolución y atención del equipo.</p></div>
      <span className="rounded-full border border-border px-3 py-1 text-xs text-muted-foreground">Zona horaria Argentina</span>
    </header>
    <section aria-label="Filtros de todo el panel" className="rounded-xl border border-border bg-card p-3 sm:p-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="text-xs font-medium text-muted-foreground">Período<select className={field} value={period} onChange={e => choosePeriod(e.target.value as Period)}><option value="today">Hoy</option><option value="week">Últimos 7 días</option><option value="month">Este mes</option><option value="quarter">Últimos 90 días</option><option value="custom">Personalizado</option></select></label>
        <label className="text-xs font-medium text-muted-foreground">Responsable actual<select className={field} value={period === "custom" ? draft.advisor : filters.advisor} onChange={e => period === "custom" ? setDraft({ ...draft, advisor: e.target.value }) : apply({ ...filters, advisor: e.target.value })}><option value="">Todo el equipo</option>{data?.advisor_options.map(advisor => <option key={advisor.id} value={advisor.id}>{advisor.name}</option>)}</select></label>
      </div>
      {period === "custom" && <form className="mt-3 grid items-end gap-3 sm:grid-cols-[1fr_1fr_auto]" onSubmit={e => { e.preventDefault(); apply({ ...draft }); }}>
        <label className="text-xs font-medium">Desde<input type="date" className={field} value={draft.from} required onChange={e => setDraft({ ...draft, from: e.target.value })} /></label>
        <label className="text-xs font-medium">Hasta<input type="date" className={field} value={draft.to} min={draft.from} required onChange={e => setDraft({ ...draft, to: e.target.value })} /></label>
        <Button type="submit" disabled={loading}>Aplicar filtros</Button>
        <p className="text-xs text-muted-foreground sm:col-span-3">Ambos días incluidos. Hasta 366 días.</p>
      </form>}
      {filters.advisor && <Button type="button" variant="outline" size="sm" className="mt-3" onClick={() => apply({ ...filters, advisor: "" })}><X className="size-3" aria-hidden="true" />Quitar filtro de responsable</Button>}
      {(period === "custom" || filters.advisor) && <Button type="button" variant="ghost" size="sm" className="mt-3" onClick={() => { setPeriod("month"); apply(initialFilters()); }}>Restablecer filtros</Button>}
    </section>
    <nav aria-label="Vistas de estadísticas" className="flex gap-1 border-b border-border">
      {(["Resumen", "Equipo", "Atención"] as const).map(item => <button key={item} type="button" aria-pressed={view === item} onClick={() => setView(item)} className={`min-h-11 border-b-2 px-4 text-sm font-semibold focus-visible:outline-2 focus-visible:outline-blue-600 ${view === item ? "border-blue-600 text-blue-700 dark:text-blue-300" : "border-transparent text-muted-foreground hover:text-foreground"}`}>{item}</button>)}
    </nav>
    {loading && <p role="status" className="text-sm text-muted-foreground">Consultando métricas…</p>}
    {error && <div role="alert" className="rounded-xl border border-rose-300 p-4"><p>{error}</p><Button variant="outline" className="mt-3" onClick={() => apply({ ...filters })}>Reintentar</Button></div>}
    {!data && loading && <div className="h-64 animate-pulse rounded-xl bg-muted" aria-hidden="true" />}
    {data && total && !error && <div aria-busy={loading} className={`space-y-5 ${loading ? "pointer-events-none opacity-50" : ""}`}>
      <p className="text-xs text-muted-foreground" aria-live="polite">{data.from} — {data.to} · {advisorName}</p>
      {data.has_simulated_data && <p className="rounded-lg border border-blue-300/50 bg-blue-50 p-3 text-xs text-blue-900 dark:bg-blue-950/40 dark:text-blue-200">Base con datos de prueba: {formatNumber(total.simulated_leads)} de los {formatNumber(total.leads)} leads del período son simulados. No representan resultados reales de ventas.</p>}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {(view === "Atención" ? [
          ["Primera respuesta", formatDuration(total.response_minutes), `n=${total.answered} conversaciones`],
          ["Resolución", formatDuration(total.resolution_minutes), `n=${total.resolved} conversaciones`],
          ["Sin respuesta humana", formatNumber(total.conversations - total.answered), `${total.conversations} consultas ingresadas`],
          ["Cobertura humana", total.conversations ? formatPercent(100 * total.answered / total.conversations) : "Sin datos", `${total.answered} respondidas`],
        ] : [
          ["Cierres del período", formatNumber(total.period_won), "Ganados con fecha registrada"],
          ["Leads ingresados", formatNumber(total.leads), `${total.attended} con contacto comercial`],
          ["Conversión", formatPercent(total.conversion), `${total.won} ganados de esta cohorte`],
          ["Tasa de cierre", formatPercent(total.close_rate), `${total.won + total.lost} leads finalizados`],
        ]).map(([label, value, detail], index) => <section key={label} className={`rounded-xl border p-4 sm:p-5 ${index === 0 ? "border-blue-700 bg-slate-900 text-white" : "border-border bg-card"}`}>
          <h2 className={`text-xs font-medium ${index === 0 ? "text-slate-300" : "text-muted-foreground"}`}>{label}</h2><p className="my-2 text-2xl font-bold tracking-tight tabular-nums sm:text-3xl">{value}</p><p className={`text-xs ${index === 0 ? "text-slate-300" : "text-muted-foreground"}`}>{detail}</p>
        </section>)}
      </div>
      {view === "Resumen" && <>
        <div className="grid gap-5 lg:grid-cols-[2fr_1fr]">
          <EvolutionChart series={data.series} onRange={selectRange} />
          <section className={panelClass}>
            <h2 className="font-semibold">Estado de la cartera</h2><p className="mt-1 text-xs text-muted-foreground">Leads ingresados en el período, por estado actual.</p>
            <div className="mt-6 space-y-5">{[["Activos", total.active, "bg-blue-700 dark:bg-blue-400"], ["Ganados", total.won, "bg-emerald-700 dark:bg-emerald-400"], ["Descartados", total.lost, "bg-slate-500"]].map(([label, value, color]) => <div key={label}><div className="mb-2 flex justify-between text-sm"><span>{label}</span><strong className="tabular-nums">{formatNumber(Number(value))}</strong></div><div className="h-2 rounded bg-muted" aria-hidden="true"><div className={`h-2 rounded ${color}`} style={{ width: `${total.leads ? 100 * Number(value) / total.leads : 0}%` }} /></div></div>)}</div>
            <p className="mt-5 text-xs text-muted-foreground">Las tres categorías suman {formatNumber(total.leads)} leads. Escala común: 0 a {formatNumber(total.leads)}.</p>
            <Button variant="outline" className="mt-5" onClick={() => setView("Equipo")}>Comparar asesores<ArrowRight aria-hidden="true" className="size-4" /></Button>
          </section>
        </div>
        <section className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-border p-4"><div><h2 className="text-sm font-semibold">Atención de consultas</h2><p className="mt-1 text-sm text-muted-foreground">{formatDuration(total.response_minutes)} hasta la primera respuesta · {total.conversations - total.answered} sin respuesta humana.</p></div><Button variant="outline" onClick={() => setView("Atención")}>Analizar atención<ArrowRight aria-hidden="true" className="size-4" /></Button></section>
      </>}
      {view !== "Resumen" && <>
        <AdvisorChart key={view} advisors={data.advisors} attention={view === "Atención"} onAdvisor={id => apply({ ...filters, advisor: id })} />
        <section className="overflow-hidden rounded-xl border border-border bg-card">
          <div className="p-4 sm:p-5"><h2 className="font-semibold">{view === "Equipo" ? "Detalle de cartera" : "Cobertura por responsable"}</h2><p className="mt-1 text-xs text-muted-foreground">{view === "Equipo" ? "Estado actual de los leads ingresados. Contactados puede solaparse con los estados." : "Medias por conversación con muestra explícita; no incluye bots ni mensajes fallidos."}</p></div>
          <div className="overflow-x-auto"><table className="w-full text-sm"><caption className="sr-only">{view}, {data.from} al {data.to}</caption><thead className="bg-muted/50 text-left text-xs text-muted-foreground"><tr>{(view === "Equipo" ? ["Responsable", "Ingresados", "Contactados", "Activos", "Ganados", "Descartados", "Conversión"] : ["Responsable", "Consultas", "Respondidas", "Sin respuesta", "1.ª respuesta", "Resueltas", "Resolución"]).map(label => <th scope="col" key={label} className="whitespace-nowrap px-4 py-3 font-semibold">{label}</th>)}</tr></thead><tbody className="divide-y divide-border">{data.advisors.map(row => <tr key={row.id || "unassigned"} className="hover:bg-muted/30"><th scope="row" className="whitespace-nowrap px-4 py-3 text-left font-medium">{row.name}</th>{(view === "Equipo" ? [row.leads, row.attended, row.active, row.won, row.lost, formatPercent(row.conversion)] : [row.conversations, row.answered, row.conversations - row.answered, formatDuration(row.response_minutes), row.resolved, formatDuration(row.resolution_minutes)]).map((value, index) => <td key={index} className="whitespace-nowrap px-4 py-3 tabular-nums">{value}</td>)}</tr>)}</tbody></table></div>
          {!data.advisors.length && <p className="flex items-center gap-2 p-5 text-sm text-muted-foreground"><BarChart3 aria-hidden="true" className="size-5" />Sin actividad para estos filtros.</p>}
        </section>
      </>}
      {total.undated_won > 0 && <p className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">{total.undated_won} ganados sin fecha de cierre en la cartera seleccionada. No se atribuyen a un período.</p>}
        <details className={panelClass}><summary className="cursor-pointer text-sm font-semibold focus-visible:outline-2 focus-visible:outline-blue-600">Cómo se calculan estas métricas</summary><div className="mt-4 space-y-3 text-sm leading-relaxed text-muted-foreground">
          <p>Ventas representa leads ganados (WON), no contratos ni facturación. Cierres del período usa su fecha de cierre registrada y el estado actual; si se reabre un lead deja de contar. No se reconstruyen cierres antiguos sin fecha.</p>
          <p>La cohorte incluye leads creados entre las fechas elegidas. Conversión = ganados / ingresados. Tasa de cierre = ganados / (ganados + descartados). Activos + ganados + descartados = ingresados. Contactados exige al menos un seguimiento comercial, excluyendo notas.</p>
          <p>Respuesta y resolución usan conversaciones cuya primera consulta ingresó en el período. La primera respuesta es el primer mensaje humano enviado, entregado o leído posterior a la consulta; excluye bots, fallidos y mensajes pendientes. Se usa la fecha de envío; para registros antiguos sin esa fecha se usa entrega, lectura o registro del mensaje. Las medias se ponderan por conversaciones, no por asesores. Los tiempos son minutos corridos, incluyendo noches y fines de semana.</p>
          <p>Resolución mide desde la primera consulta hasta el cierre de conversaciones actualmente resueltas. Las reabiertas no cuentan; no mide cada ciclo histórico. Sin muestra, las tasas y los tiempos muestran “Sin datos”.</p>
          <p>La atribución corresponde al responsable asignado actualmente, incluso para conversaciones. Una reasignación modifica la comparativa; no representa el autor histórico de la venta o de cada respuesta. Se excluyen leads eliminados.</p>
        </div></details>
    </div>}
  </div>;
}
