"use client";

import Link from "next/link";
import { isMockDataMode } from "@/lib/data-mode";
import { useEffect, useState } from "react";
import { ArrowRight, BarChart3, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useCurrentSession } from "@/hooks/use-current-session";
import { loadCommercialStatistics, type CommercialStatistics } from "@/lib/commercial-statistics-api";
import { AdvisorChart, EvolutionChart, countLabel, durationTone, formatDuration, formatNumber, formatPercent, panelClass } from "@/components/admin/statistics/StatisticsCharts";

type Filters = { from: string; to: string; advisor: string };
type View = "Resumen" | "Equipo" | "Atención";
type Period = "today" | "week" | "month" | "quarter" | "custom";
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
  const { user, isReady, isAdvisor } = useCurrentSession();
  const allowed = isMockDataMode || (!!user && user.source === "api" && ["TENANT_ADMIN", "SALES_MANAGER"].includes(user.apiRole || ""));
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
    const request = isMockDataMode
      ? import("@/data/statistics-sample").then(({ loadSampleCommercialStatistics }) => loadSampleCommercialStatistics(filters))
      : loadCommercialStatistics(filters, controller.signal);
    void request.then(result => {
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
  if (!allowed) return <p role="alert" className={panelClass}>Estadísticas está disponible para gerentes y administradores.</p>;
  const total = data?.total;
  const periodText = data ? `del ${new Intl.DateTimeFormat("es-AR", { timeZone: "UTC" }).format(new Date(`${data.from}T12:00:00Z`))} al ${new Intl.DateTimeFormat("es-AR", { timeZone: "UTC" }).format(new Date(`${data.to}T12:00:00Z`))}` : "en el período seleccionado";
  const advisorName = data?.advisor_options.find(a => a.id === appliedAdvisor)?.name || "Todo el equipo";
  const unanswered = total ? total.conversations - total.answered : 0;
  const periods: [Period, string][] = [["today", "Hoy"], ["week", "7 días"], ["month", "Este mes"], ["quarter", "90 días"], ["custom", "Personalizado"]];
  return <div className="inventory-view stats-view mx-auto max-w-7xl pb-8">
    {!isAdvisor && <Link href="/admin" className="stats-mobile-back">‹ Atrás</Link>}
    <header className="stats-head">
      <div><h1>Estadísticas</h1><p>Cómo vende y cómo atiende el equipo</p></div>
      <div className="stats-controls">
        <div className="stats-pills" role="group" aria-label="Período">{periods.map(([value, label]) => <button key={value} type="button" aria-pressed={period === value} onClick={() => choosePeriod(value)}>{label}</button>)}</div>
        <label className="stats-advisor"><span>Asesor</span><select value={period === "custom" ? draft.advisor : filters.advisor} onChange={e => period === "custom" ? setDraft({ ...draft, advisor: e.target.value }) : apply({ ...filters, advisor: e.target.value })}><option value="">Todo el equipo</option>{data?.advisor_options.map(advisor => <option key={advisor.id} value={advisor.id}>{advisor.name}</option>)}</select></label>
      </div>
    </header>
    {period === "custom" && <form className="stats-panel stats-custom" onSubmit={e => { e.preventDefault(); apply({ ...draft }); }}>
      <label>Desde<input type="date" value={draft.from} required onChange={e => setDraft({ ...draft, from: e.target.value })} /></label>
      <label>Hasta<input type="date" value={draft.to} min={draft.from} required onChange={e => setDraft({ ...draft, to: e.target.value })} /></label>
      <Button type="submit" disabled={loading}>Ver este período</Button>
    </form>}
    <div className="stats-subbar">
      <nav aria-label="Vistas de estadísticas" className="stats-pills">{(["Resumen", "Equipo", "Atención"] as const).map(item => <button key={item} type="button" aria-pressed={view === item} onClick={() => setView(item)}>{item}</button>)}</nav>
      {data && <p aria-live="polite">{periodText[0].toUpperCase() + periodText.slice(1)} · {advisorName}</p>}
      {(period === "custom" || filters.advisor) && <button type="button" className="stats-link" onClick={() => { setPeriod("month"); apply(initialFilters()); }}><X aria-hidden="true" size={18} />Volver a este mes y todo el equipo</button>}
    </div>
    {loading && <p role="status" className="stats-muted">Consultando métricas…</p>}
    {error && <div role="alert" className="stats-panel"><p>{error}</p><Button variant="outline" className="mt-3" onClick={() => apply({ ...filters })}>Reintentar</Button></div>}
    {!data && loading && <div className="h-64 animate-pulse rounded-3xl bg-muted" aria-hidden="true" />}
    {data && total && !error && <div aria-busy={loading} className={`stats-body ${loading ? "pointer-events-none opacity-50" : ""}`}>
      <div className="stats-kpis">
        {(view === "Atención" ? [
          ["Sin respuesta de una persona", formatNumber(unanswered), `${countLabel(unanswered, "consulta", "consultas")} de ${formatNumber(total.conversations)} sin respuesta humana`, null],
          ["Primera respuesta", formatDuration(total.response_minutes), "Tiempo medio hasta que responde una persona", durationTone(total.response_minutes)],
          ["Resolución", formatDuration(total.resolution_minutes), "Tiempo medio hasta cerrar la conversación", null],
          ["Cobertura humana", total.conversations ? formatPercent(100 * total.answered / total.conversations) : "Sin datos", `${countLabel(total.answered, "consulta respondida", "consultas respondidas")} por el equipo`, null],
        ] : [
          ["Esperan respuesta de una persona", formatNumber(unanswered), `${countLabel(unanswered, "consulta", "consultas")} de ${formatNumber(total.conversations)} todavía sin respuesta del equipo`, null],
          ["Leads ingresados", formatNumber(total.leads), `${countLabel(total.leads, "lead nuevo", "leads nuevos")} ${periodText}`, null],
          ["Cierres del período", formatNumber(total.period_won), `${countLabel(total.period_won, "cierre ganado", "cierres ganados")} con fecha registrada · conversión ${formatPercent(total.conversion)}`, null],
          ["Primera respuesta", formatDuration(total.response_minutes), "Tiempo medio hasta que responde una persona", durationTone(total.response_minutes)],
        ] as [string, string, string, string | null][]).map(([label, value, detail, tone], index) => <section key={label} className={`stats-kpi ${index === 0 ? "stats-kpi-focus" : ""}`}>
          <h2>{label}</h2><p className="stats-number">{value}</p>{tone && <span className={`stats-chip ${tone}`}>{tone === "stats-tone-mint" ? "Rápida" : tone === "stats-tone-sun" ? "Se puede mejorar" : tone === "stats-tone-rose" ? "Lenta" : "Sin datos"}</span>}<p>{detail}</p>
          {index === 0 && <button type="button" className="stats-focus-action" onClick={() => setView(view === "Atención" ? "Equipo" : "Atención")}>{view === "Atención" ? "Ver por asesor" : "Ver quiénes"}<ArrowRight aria-hidden="true" size={18} /></button>}
        </section>)}
      </div>
      {view === "Resumen" && <>
        <div className="stats-charts">
          <EvolutionChart series={data.series} onRange={selectRange} />
          <section className={panelClass}>
            <div className="stats-panel-head"><div><h2>Estado de la cartera</h2><p className="stats-muted">Leads del período, por estado de hoy</p></div></div>
            <div className="stats-bars">{([["Activos", total.active, "stats-tone-sky"], ["Ganados", total.won, "stats-tone-mint"], ["Descartados", total.lost, "stats-tone-gray"]] as const).map(([label, value, tone]) => <div key={label}><div className="stats-bar-label"><span>{label}</span><strong>{formatNumber(value)}</strong></div><div className="stats-track" aria-hidden="true"><div className={tone} style={{ width: `${total.leads ? 100 * value / total.leads : 0}%` }} /></div></div>)}</div>
            <p className="stats-muted">Suman {countLabel(total.leads, "lead", "leads")}.</p>
          </section>
        </div>
        <section className={`${panelClass} stats-compare`}>
          <div className="stats-panel-head"><div><h2>Comparar asesores</h2><p className="stats-muted">Tocá un nombre para ver solo sus números</p></div><Button variant="outline" onClick={() => setView("Equipo")}>Ver ranking<ArrowRight aria-hidden="true" className="size-4" /></Button></div>
          <div className="stats-table"><table><thead><tr>{["Asesor", "Leads", "Responde en", "Sin respuesta", "Cierres"].map(label => <th scope="col" key={label}>{label}</th>)}</tr></thead><tbody>{data.advisors.map(row => <tr key={row.id || "unassigned"}><th scope="row">{row.id ? <button type="button" className="stats-link" onClick={() => apply({ ...filters, advisor: row.id as string })}>{row.name}</button> : row.name}</th><td data-label="Leads">{formatNumber(row.leads)}</td><td data-label="Responde en"><span className={`stats-chip ${durationTone(row.response_minutes)}`}>{formatDuration(row.response_minutes)}</span></td><td data-label="Sin respuesta">{formatNumber(row.conversations - row.answered)}</td><td data-label="Cierres"><strong>{formatNumber(row.period_won)}</strong></td></tr>)}</tbody></table></div>
          {!data.advisors.length && <p className="stats-muted"><BarChart3 aria-hidden="true" className="inline size-5" /> Sin actividad para estos filtros.</p>}
        </section>
      </>}
      {view !== "Resumen" && <>
        <AdvisorChart key={view} advisors={data.advisors} attention={view === "Atención"} onAdvisor={id => apply({ ...filters, advisor: id })} />
        <section className={`${panelClass} stats-compare`}>
          <div className="stats-panel-head"><div><h2>{view === "Equipo" ? "Detalle de cartera" : "Atención por asesor"}</h2><p className="stats-muted">{view === "Equipo" ? "Estado de hoy de los leads ingresados en el período" : "Solo respuestas de personas; no cuenta la IA ni mensajes fallidos"}</p></div></div>
          <div className="stats-table"><table><caption className="sr-only">{view}, {data.from} al {data.to}</caption><thead><tr>{(view === "Equipo" ? ["Asesor", "Ingresados", "Contactados", "Activos", "Ganados", "Descartados", "Conversión"] : ["Asesor", "Consultas", "Respondidas", "Sin respuesta", "1.ª respuesta", "Resueltas", "Resolución"]).map(label => <th scope="col" key={label}>{label}</th>)}</tr></thead><tbody>{data.advisors.map(row => <tr key={row.id || "unassigned"}><th scope="row">{row.name}</th>{(view === "Equipo" ? [row.leads, row.attended, row.active, row.won, row.lost, formatPercent(row.conversion)] : [row.conversations, row.answered, row.conversations - row.answered, formatDuration(row.response_minutes), row.resolved, formatDuration(row.resolution_minutes)]).map((value, index) => <td key={index} data-label={(view === "Equipo" ? ["Ingresados", "Contactados", "Activos", "Ganados", "Descartados", "Conversión"] : ["Consultas", "Respondidas", "Sin respuesta", "1.ª respuesta", "Resueltas", "Resolución"])[index]}>{typeof value === "number" ? formatNumber(value) : value}</td>)}</tr>)}</tbody></table></div>
          {!data.advisors.length && <p className="stats-muted"><BarChart3 aria-hidden="true" className="inline size-5" /> Sin actividad para estos filtros.</p>}
        </section>
      </>}
      <section className={panelClass}><h2>Métricas adicionales</h2><dl className="stats-text-values"><div><dt>Reservas del período</dt><dd>Sin datos</dd></div><div><dt>Montos y moneda de operaciones</dt><dd>Sin datos</dd></div><div><dt>Comparación con el período anterior</dt><dd>Sin datos</dd></div></dl></section>
      {total.undated_won > 0 && <p className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">{countLabel(total.undated_won, "ganado sin fecha", "ganados sin fecha")} de cierre en la cartera seleccionada. No se atribuyen a un período.</p>}
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
