"use client";

import { useEffect, useState } from "react";
import { BarChart3 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useCurrentSession } from "@/hooks/use-current-session";
import { loadCommercialStatistics, type CommercialStatistics } from "@/lib/commercial-statistics-api";

const number = new Intl.NumberFormat("es-AR", { maximumFractionDigits: 1 });
const percent = (value: number | null) => value === null ? "Sin datos" : `${number.format(value)}%`;
const duration = (value: number | null) => value === null ? "Sin datos" : `${number.format(value)} min`;
const surface = "rounded-2xl border border-border bg-card p-5 sm:p-6";
const field = "mt-1 min-h-11 w-full rounded-lg border border-input bg-background px-3 text-sm focus-visible:outline-2 focus-visible:outline-blue-600";
function today() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Argentina/Buenos_Aires", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}
function initialFilters() {
  const to = today();
  return { from: `${to.slice(0, 7)}-01`, to, advisor: "" };
}

export default function CommercialStatisticsPage() {
  const { user, isReady } = useCurrentSession();
  const allowed = !!user && (user.source === "api" ? ["TENANT_ADMIN", "SALES_MANAGER"].includes(user.apiRole || "") : false);
  const [draft, setDraft] = useState(initialFilters);
  const [filters, setFilters] = useState(initialFilters);
  const [data, setData] = useState<CommercialStatistics | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    if (!allowed) return;
    const controller = new AbortController();
    void loadCommercialStatistics(filters, controller.signal).then(result => {
      if (!controller.signal.aborted) { setData(result.data); setError(""); setLoading(false); }
    }).catch(reason => {
      if (!controller.signal.aborted) { setError(reason instanceof Error ? reason.message : "No se pudieron cargar las estadísticas."); setLoading(false); }
    });
    return () => controller.abort();
  }, [allowed, filters]);
  function preset(kind: "today" | "week" | "month") {
    const to = today();
    const start = new Date(`${to}T12:00:00Z`);
    if (kind === "week") start.setUTCDate(start.getUTCDate() - 6);
    const from = kind === "month" ? `${to.slice(0, 7)}-01` : start.toISOString().slice(0, 10);
    setDraft(current => ({ ...current, from, to }));
  }
  if (!isReady || !user) return <p role="status">Cargando sesión…</p>;
  if (!allowed) return <p role="alert" className={surface}>El panel de Dirección está disponible para responsables comerciales con una sesión de la API.</p>;
  const total = data?.total;
  const maxWon = Math.max(1, ...data?.advisors.map(row => row.period_won) || []);
  return (
    <div className="mx-auto max-w-7xl space-y-6 pb-8">
      <header className="border-b border-border pb-5">
        <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-muted-foreground">Dirección · Equipo comercial</p>
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Rendimiento comercial</h1>
        <p className="mt-2 text-sm text-muted-foreground">Una visión de los resultados, la cartera y la atención de consultas.</p>
      </header>
      <form className={surface} onSubmit={event => { event.preventDefault(); setLoading(true); setError(""); setFilters({ ...draft }); }}>
        <div className="mb-4 flex flex-wrap gap-2" aria-label="Períodos rápidos">
          <Button type="button" variant="outline" onClick={() => preset("today")}>Hoy</Button>
          <Button type="button" variant="outline" onClick={() => preset("week")}>Últimos 7 días</Button>
          <Button type="button" variant="outline" onClick={() => preset("month")}>Este mes</Button>
        </div>
        <div className="grid items-end gap-4 sm:grid-cols-2 lg:grid-cols-[1fr_1fr_1.5fr_auto]">
          <label className="text-sm font-medium">Desde<input className={field} type="date" required value={draft.from} onChange={e => setDraft({ ...draft, from: e.target.value })} /></label>
          <label className="text-sm font-medium">Hasta<input className={field} type="date" required min={draft.from} value={draft.to} onChange={e => setDraft({ ...draft, to: e.target.value })} /></label>
          <label className="text-sm font-medium">Responsable actual<select className={field} value={draft.advisor} onChange={e => setDraft({ ...draft, advisor: e.target.value })}><option value="">Todo el equipo</option>{data?.advisor_options.map(advisor => <option key={advisor.id} value={advisor.id}>{advisor.name}</option>)}</select></label>
          <Button className="min-h-11" type="submit" disabled={loading}>Aplicar filtros</Button>
        </div>
        <p className="mt-3 text-xs text-muted-foreground">Fechas de Argentina, ambos días incluidos. Hasta 366 días por consulta.</p>
      </form>
      {loading && <p role="status" className={surface}>Consultando métricas…</p>}
      {error && <div role="alert" className="rounded-xl border border-rose-300 p-5"><p>{error}</p><Button className="mt-3" variant="outline" onClick={() => { setLoading(true); setError(""); setFilters({ ...filters }); }}>Reintentar</Button></div>}
      {!loading && !error && data && total && <>
        <p className="text-sm text-muted-foreground" aria-live="polite">Resultados del {data.from} al {data.to} · {data.advisor_options.find(a => a.id === filters.advisor)?.name || "Todo el equipo"}</p>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {[
            ["Cierres ganados en el período", number.format(total.period_won), "Leads en WON con fecha de cierre registrada"],
            ["Conversión de cohorte", percent(total.conversion), `${total.won} ganados / ${total.leads} leads ingresados`],
            ["Tasa de cierre de cohorte", percent(total.close_rate), `${total.won} ganados / ${total.won + total.lost} finalizados`],
            ["Primera respuesta humana", duration(total.response_minutes), `${total.answered} de ${total.conversations} conversaciones respondidas`],
          ].map(([label, value, detail]) => <section key={label} className={surface}><h2 className="text-sm font-medium text-muted-foreground">{label}</h2><p className="my-3 text-3xl font-bold tabular-nums">{value}</p><p className="text-xs text-muted-foreground">{detail}</p></section>)}
        </div>
        <div className="grid gap-5 lg:grid-cols-[1.5fr_1fr]">
          <section className={surface}>
            <h2 className="text-lg font-semibold">Cierres por responsable</h2><p className="mt-1 text-sm text-muted-foreground">Ganados con fecha registrada dentro del período.</p>
            <div className="mt-6 space-y-5">{data.advisors.map(row => <div key={row.id || "unassigned"}><div className="mb-2 flex justify-between gap-4 text-sm"><span>{row.name}</span><strong className="tabular-nums">{row.period_won}</strong></div><div className="h-2 rounded-full bg-muted" aria-hidden="true"><div className="h-2 rounded-full bg-blue-700 dark:bg-blue-400" style={{ width: `${100 * row.period_won / maxWon}%` }} /></div></div>)}</div>
            {data.advisors.length === 0 && <p className="mt-6 flex items-center gap-2 text-sm text-muted-foreground"><BarChart3 aria-hidden="true" className="size-5" />Sin actividad para estos filtros.</p>}
          </section>
          <section className={surface}>
            <h2 className="text-lg font-semibold">Cobertura de atención</h2>
            <dl className="mt-4 divide-y divide-border text-sm">
              {[["Leads ingresados", number.format(total.leads)], ["Con contacto registrado", `${total.attended} / ${total.leads}`], ["Consultas sin respuesta humana", number.format(total.conversations - total.answered)], ["Resolución promedio", duration(total.resolution_minutes)], ["Conversaciones resueltas", `${total.resolved} / ${total.conversations}`]].map(([label, value]) => <div key={label} className="flex justify-between gap-3 py-3"><dt className="text-muted-foreground">{label}</dt><dd className="text-right font-semibold tabular-nums">{value}</dd></div>)}
            </dl>
            {total.undated_won > 0 && <p className="mt-4 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">Hay {total.undated_won} ganados sin fecha de cierre en la cartera seleccionada. No se atribuyen a ningún período.</p>}
          </section>
        </div>
        <section className="overflow-hidden rounded-2xl border border-border bg-card">
          <div className="p-5 sm:p-6"><h2 className="text-lg font-semibold">Comparativa de cartera</h2><p className="mt-1 text-sm text-muted-foreground">Estado actual de los leads ingresados en el período. Contactados puede solaparse con los estados.</p></div>
          <div className="overflow-x-auto"><table className="w-full text-sm"><caption className="sr-only">Rendimiento por responsable actual, del {data.from} al {data.to}</caption><thead className="bg-muted/50 text-left text-xs text-muted-foreground"><tr>{["Responsable", "Leads", "Contactados", "Activos", "Ganados", "Descartados", "Conversión", "Cierre", "Respuesta", "Resolución"].map(label => <th key={label} scope="col" className="whitespace-nowrap px-4 py-3 font-semibold">{label}</th>)}</tr></thead><tbody className="divide-y divide-border">{data.advisors.map(row => <tr key={row.id || "unassigned"} className="hover:bg-muted/30"><th scope="row" className="whitespace-nowrap px-4 py-4 text-left font-medium">{row.name}</th>{[row.leads, row.attended, row.active, row.won, row.lost, percent(row.conversion), percent(row.close_rate), duration(row.response_minutes), duration(row.resolution_minutes)].map((value, index) => <td key={index} className="whitespace-nowrap px-4 py-4 tabular-nums">{value}</td>)}</tr>)}</tbody></table></div>
          {data.advisors.length === 0 && <p className="p-6 text-sm text-muted-foreground">No hay leads ni conversaciones para estos filtros.</p>}
        </section>
        <details className={surface}><summary className="cursor-pointer text-sm font-semibold focus-visible:outline-2 focus-visible:outline-blue-600">Cómo se calculan estas métricas</summary><div className="mt-4 space-y-3 text-sm leading-relaxed text-muted-foreground">
          <p>Ventas representa leads ganados (WON), no contratos ni facturación. Cierres del período usa su fecha de cierre registrada y el estado actual; si se reabre un lead deja de contar. No se reconstruyen cierres antiguos sin fecha.</p>
          <p>La cohorte incluye leads creados entre las fechas elegidas. Conversión = ganados / ingresados. Tasa de cierre = ganados / (ganados + descartados). Activos + ganados + descartados = ingresados. Contactados exige al menos un seguimiento comercial, excluyendo notas.</p>
          <p>Respuesta y resolución usan conversaciones cuya primera consulta ingresó en el período. La primera respuesta es el primer mensaje humano enviado, entregado o leído posterior a la consulta; excluye bots, fallidos y mensajes pendientes. Se usa la fecha de envío; para registros antiguos sin esa fecha se usa entrega, lectura o registro del mensaje. Las medias se ponderan por conversaciones, no por asesores. Los tiempos son minutos corridos, incluyendo noches y fines de semana.</p>
          <p>Resolución mide desde la primera consulta hasta el cierre de conversaciones actualmente resueltas. Las reabiertas no cuentan; no mide cada ciclo histórico. Sin muestra, las tasas y los tiempos muestran “Sin datos”.</p>
          <p>La atribución corresponde al responsable asignado actualmente, incluso para conversaciones. Una reasignación modifica la comparativa; no representa el autor histórico de la venta o de cada respuesta. Se excluyen leads eliminados.</p>
        </div></details>
      </>}
    </div>
  );
}
