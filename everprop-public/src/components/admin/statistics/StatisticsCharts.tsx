"use client";

import { useState } from "react";
import { groupStatisticsSeries } from "@/lib/statistics-series";
import type { CommercialStatistics } from "@/lib/commercial-statistics-api";

export const formatNumber = (value: number) => new Intl.NumberFormat("es-AR", { maximumFractionDigits: 1 }).format(value);
export const formatPercent = (value: number | null) => value === null ? "Sin datos" : `${formatNumber(value)}%`;
export const formatDuration = (value: number | null) => {
  if (value === null) return "Sin datos";
  if (value < 60) return `${Math.round(value)} min`;
  const minutes = Math.round(value % 60);
  return `${Math.floor(value / 60)} h${minutes ? ` ${minutes} min` : ""}`;
};
// Response-time tone: color always travels with the written time.
export const durationTone = (value: number | null) => value === null ? "stats-tone-gray" : value <= 60 ? "stats-tone-mint" : value <= 240 ? "stats-tone-sun" : "stats-tone-rose";
export const panelClass = "stats-panel";
export const countLabel = (value: number, singular: string, plural: string) => `${formatNumber(value)} ${value === 1 ? singular : plural}`;
const shortDate = (value: string) => new Intl.DateTimeFormat("es-AR", { day: "numeric", month: "short", timeZone: "UTC" }).format(new Date(`${value}T12:00:00Z`));

export function EvolutionChart({ series, onRange }: {
  series: CommercialStatistics["series"];
  onRange: (from: string, to: string) => void;
}) {
  const [metric, setMetric] = useState<"leads" | "period_won">("leads");
  const { step, bins } = groupStatisticsSeries(series, metric);
  const max = Math.max(1, ...bins.map(bin => bin.value));
  const labelEvery = Math.max(1, Math.ceil(bins.length / 5));
  const unit = metric === "leads" ? "leads" : "cierres";
  return <section className={`${panelClass} stats-evolution`}>
    <div className="stats-panel-head">
      <div><h2>Evolución del período</h2><p className="stats-muted">{step === 7 ? "Por semana" : "Por día"} · tocá una columna para ver ese intervalo</p></div>
      <label className="stats-inline-select">Mostrar<select value={metric} onChange={e => setMetric(e.target.value as typeof metric)}><option value="leads">Leads ingresados</option><option value="period_won">Cierres ganados</option></select></label>
    </div>
    <p className="stats-evolution-total"><strong>{formatNumber(bins.reduce((sum, bin) => sum + bin.value, 0))}</strong> {metric === "leads" ? "leads ingresados" : "cierres con fecha registrada"}</p>
    {!bins.length && <p>Sin datos para este período.</p>}
    <div className="stats-columns" style={{ gridTemplateColumns: `repeat(${Math.max(bins.length, 1)}, minmax(0, 1fr))` }}>{bins.map((bin, index) => <button key={bin.from} type="button" onClick={() => onRange(bin.from, bin.to)} className="stats-column" title={`${shortDate(bin.from)}${bin.from !== bin.to ? ` al ${shortDate(bin.to)}` : ""}: ${formatNumber(bin.value)} ${unit}`} aria-label={`Filtrar del ${bin.from} al ${bin.to}: ${formatNumber(bin.value)} ${unit}`}>
      <span className="stats-column-value">{formatNumber(bin.value)}</span>
      <span className="stats-column-track" aria-hidden="true"><span style={{ height: `${Math.max(bin.value ? 4 : 0, 100 * bin.value / max)}%` }} /></span>
      <span className={`stats-column-label ${index % labelEvery ? "stats-column-label-hidden" : ""}`}>{shortDate(bin.from)}</span>
    </button>)}</div>
    {!!bins.length && <details className="stats-details"><summary>Ver valores de la evolución</summary><dl className="stats-text-values">{bins.map(bin => <div key={bin.from}><dt>{shortDate(bin.from)} al {shortDate(bin.to)}</dt><dd>{formatNumber(bin.value)} {unit}</dd></div>)}</dl></details>}
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
    <div className="stats-panel-head">
      <div><h2>{attention ? "Tiempos por asesor" : "Ranking de asesores"}</h2><p className="stats-muted">{attention ? "El más rápido primero. " : "El mejor primero. "}Tocá un asesor para ver solo sus números.</p></div>
      <label className="stats-inline-select">Ordenar por<select value={metric} onChange={e => setMetric(e.target.value as typeof metric)}>{choices.map(key => <option key={key} value={key}>{metricOptions[key].label}</option>)}</select></label>
    </div>
    <div className="stats-bars">{rows.map(row => <button key={row.id || "unassigned"} type="button" disabled={!row.id} onClick={() => row.id && onAdvisor(row.id)} className="stats-bar-button">
      <span className="stats-bar-label"><span>{row.name}</span><strong>{metricOptions[metric].format(row[metric])}</strong></span>
      <span className="stats-track" aria-hidden="true"><span className={attention ? durationTone(row[metric]) : "stats-fill"} style={{ width: `${100 * (row[metric] || 0) / max}%` }} /></span>
      {attention && <span className="stats-muted">{metric === "response_minutes" ? countLabel(row.answered, "consulta respondida", "consultas respondidas") : countLabel(row.resolved, "consulta resuelta", "consultas resueltas")}</span>}
    </button>)}</div>
    {rows.length === 0 && <p className="stats-muted">No hay actividad para comparar en este período.</p>}
  </section>;
}
