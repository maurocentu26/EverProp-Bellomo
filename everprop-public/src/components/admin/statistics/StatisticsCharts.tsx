"use client";

import { useState } from "react";
import { groupStatisticsSeries } from "@/lib/statistics-series";
import type { CommercialStatistics } from "@/lib/commercial-statistics-api";

export const formatNumber = (value: number) => new Intl.NumberFormat("es-AR", { maximumFractionDigits: 1 }).format(value);
export const formatPercent = (value: number | null) => value === null ? "Sin datos" : `${formatNumber(value)}%`;
export const formatDuration = (value: number | null) => value === null ? "Sin datos" : `${formatNumber(value)} min`;
export const panelClass = "stats-panel";
export const countLabel = (value: number, singular: string, plural: string) => `${formatNumber(value)} ${value === 1 ? singular : plural}`;
const control = "min-h-10 rounded-lg border border-input bg-background px-2 text-sm focus-visible:outline-2 focus-visible:outline-blue-600";
const shortDate = (value: string) => new Intl.DateTimeFormat("es-AR", { day: "numeric", month: "short", timeZone: "UTC" }).format(new Date(`${value}T12:00:00Z`));

export function EvolutionChart({ series, onRange }: {
  series: CommercialStatistics["series"];
  onRange: (from: string, to: string) => void;
}) {
  const [metric, setMetric] = useState<"leads" | "period_won">("leads");
  const { step, bins } = groupStatisticsSeries(series, metric);
  const max = Math.max(1, ...bins.map(bin => bin.value));
  return <section className={panelClass}>
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div><h2 className="font-semibold">Evolución del período</h2><p className="mt-1 text-xs text-muted-foreground">{step === 7 ? "Intervalos de hasta 7 días" : "Por día"} · Seleccioná una barra para ver ese intervalo.</p></div>
      <label className="text-xs text-muted-foreground">Mostrar<select className={`${control} ml-2`} value={metric} onChange={e => setMetric(e.target.value as typeof metric)}><option value="leads">Leads ingresados</option><option value="period_won">Cierres ganados</option></select></label>
    </div>
    <p className="mt-5"><strong>{formatNumber(bins.reduce((sum, bin) => sum + bin.value, 0))}</strong> {metric === "leads" ? "leads ingresados" : "cierres con fecha registrada"}</p>

    {!bins.length && <p>Sin datos para este período.</p>}
    <div className="stats-bars">{bins.map(bin => <button key={bin.from} type="button" onClick={() => onRange(bin.from, bin.to)} className="stats-bar-button" aria-label={`Filtrar del ${bin.from} al ${bin.to}: ${formatNumber(bin.value)} ${metric === "leads" ? "leads" : "cierres"}`}>
      <span className="stats-bar-label"><span>{shortDate(bin.from)}{bin.from !== bin.to && ` al ${shortDate(bin.to)}`}</span><strong>{formatNumber(bin.value)}</strong></span>
      <span className="stats-track" aria-hidden="true"><span style={{ width: `${100 * bin.value / max}%` }} /></span>
    </button>)}</div>
    {!!bins.length && <details className="mt-5"><summary>Ver valores de la evolución</summary><dl className="stats-text-values">{bins.map(bin => <div key={bin.from}><dt>{shortDate(bin.from)} al {shortDate(bin.to)}</dt><dd>{formatNumber(bin.value)} {metric === "leads" ? "leads" : "cierres"}</dd></div>)}</dl></details>}

  </section>;
}

const metricOptions = {
  leads: { label: "Leads ingresados", format: (v: number | null) => v === null ? "Sin datos" : formatNumber(v) },
  period_won: { label: "Cierres del período", format: (v: number | null) => v === null ? "Sin datos" : formatNumber(v) },
  conversion: { label: "Conversión", format: formatPercent },
  response_minutes: { label: "Primera respuesta", format: formatDuration },
  resolution_minutes: { label: "Resolución", format: formatDuration },
};

export function AdvisorChart({ advisors, onAdvisor, attention = false }: {
  advisors: CommercialStatistics["advisors"];
  onAdvisor: (id: string) => void;
  attention?: boolean;
}) {
  const [metric, setMetric] = useState<keyof typeof metricOptions>(attention ? "response_minutes" : "period_won");
  const choices = attention ? ["response_minutes", "resolution_minutes"] as const : ["period_won", "leads", "conversion"] as const;
  const rows = [...advisors].sort((a, b) => {
    const av = a[metric], bv = b[metric];
    if (av === null) return bv === null ? 0 : 1;
    if (bv === null) return -1;
    return attention ? av - bv : bv - av;
  });
  const max = metric === "conversion" ? 100 : Math.max(1, ...rows.map(row => row[metric] || 0));
  return <section className={panelClass}>
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div><h2 className="font-semibold">{attention ? "Tiempos por responsable" : "Comparar responsables"}</h2><p className="mt-1 text-xs text-muted-foreground">{attention ? "Menor tiempo primero. " : "Mayor valor primero. "}Seleccioná un asesor para filtrar todo el panel.</p></div>
      <label className="text-xs text-muted-foreground">Métrica del gráfico<select className={`${control} ml-2`} value={metric} onChange={e => setMetric(e.target.value as typeof metric)}>{choices.map(key => <option key={key} value={key}>{metricOptions[key].label}</option>)}</select></label>
    </div>
    <div className="mt-5 space-y-2">{rows.map(row => <button key={row.id || "unassigned"} type="button" disabled={!row.id} onClick={() => row.id && onAdvisor(row.id)} className="block w-full rounded-lg p-2 text-left hover:bg-muted focus-visible:outline-2 focus-visible:outline-blue-600 disabled:cursor-default">
      <span className="mb-2 flex flex-wrap justify-between gap-2 text-sm"><span className="font-medium">{row.name}</span><span className="tabular-nums">{metricOptions[metric].format(row[metric])}{attention && <span className="ml-2 text-xs text-muted-foreground"> · n={metric === "response_minutes" ? formatNumber(row.answered) : formatNumber(row.resolved)}</span>}</span></span>
      <span className="stats-track" aria-hidden="true"><span className="stats-fill" style={{ width: `${100 * (row[metric] || 0) / max}%` }} /></span>
    </button>)}</div>
    {rows.length === 0 && <p className="mt-5 text-sm text-muted-foreground">No hay actividad para comparar en este período.</p>}
    <p className="mt-4 text-xs text-muted-foreground">{attention && "Las medias no incluyen consultas sin muestra."}</p>
  </section>;
}
