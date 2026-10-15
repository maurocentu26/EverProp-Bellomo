"use client";

import { useEffect, useState } from "react";
import { EverpropApiError } from "@/lib/everprop-api";
import { getAssistantUsage, type AssistantUsage } from "@/lib/assistant-api";

const usd = (n: number) => n.toLocaleString("es-AR", { style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: n < 1 ? 4 : 2 });
const int = (n: number) => n.toLocaleString("es-AR");
const thisMonth = () => new Date().toISOString().slice(0, 7);

/** EVP-23: how much the AI spends this month against the tenant's own cap. Tenant admins only. */
export function AssistantUsagePanel() {
  const [period, setPeriod] = useState(thisMonth());
  const [data, setData] = useState<AssistantUsage | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let alive = true;
    getAssistantUsage(period)
      .then(({ data }) => { if (alive) { setData(data); setError(""); } })
      .catch((e) => {
        if (!alive) return;
        setData(null);
        setError(e instanceof EverpropApiError && e.status === 403 ? "Solo el administrador ve el uso de la IA." : "No pudimos cargar el uso. Recargá la página.");
      });
    return () => { alive = false; };
  }, [period]);

  const max = Math.max(0, ...(data?.by_day.map((d) => d.usd) ?? []));
  const near = data !== null && data.used_pct !== null && data.used_pct >= 80;

  return (
    <div className="mx-auto w-full max-w-4xl space-y-6 p-4 sm:p-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Uso de la IA</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Gasto del asistente y del copiloto contra el tope de tu empresa. Al llegar al tope, la IA deriva a un asesor en lugar de responder.
          </p>
        </div>
        <label className="grid gap-1 text-sm font-medium">
          Mes
          <input type="month" value={period} max={thisMonth()} onChange={(e) => e.target.value && setPeriod(e.target.value)}
            className="min-h-11 rounded-xl border border-border bg-background px-3" />
        </label>
      </header>

      {error && <p role="status" className="text-sm">{error}</p>}
      {!data && !error && <p className="text-sm text-muted-foreground">Cargando…</p>}

      {data && (
        <>
          <section aria-label="Resumen del mes" className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-2xl border border-border bg-card p-4">
              <p className="text-sm text-muted-foreground">Gastado</p>
              <p className="mt-1 text-3xl font-bold tabular-nums">{usd(data.spent_usd)}</p>
              {data.open_reservations_usd > 0 && (
                <p className="mt-1 text-xs text-muted-foreground">Incluye {usd(data.open_reservations_usd)} reservados de llamadas en curso.</p>
              )}
            </div>
            <div className="rounded-2xl border border-border bg-card p-4">
              <p className="text-sm text-muted-foreground">Tope del mes</p>
              <p className="mt-1 text-3xl font-bold tabular-nums">{usd(data.cap_usd)}</p>
              {data.used_pct !== null && (
                <div className="mt-2">
                  <div className="h-2 rounded-full bg-muted" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={data.used_pct} aria-label="Porcentaje del tope usado">
                    <div className={`h-2 rounded-full ${near ? "bg-amber-500" : "bg-blue-600"}`} style={{ width: `${data.used_pct > 0 ? Math.max(1, data.used_pct) : 0}%` }} />
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">{data.used_pct.toLocaleString("es-AR")} % usado{near ? " · cerca del tope" : ""}</p>
                </div>
              )}
            </div>
            <div className="rounded-2xl border border-border bg-card p-4">
              <p className="text-sm text-muted-foreground">Respuestas frenadas por el tope</p>
              <p className="mt-1 text-3xl font-bold tabular-nums">{int(data.assistant.blocked_by_cap + data.copilot.blocked_by_cap)}</p>
              <p className="mt-1 text-xs text-muted-foreground">Se derivaron a un asesor.</p>
            </div>
          </section>

          <section aria-labelledby="by-day" className="rounded-2xl border border-border bg-card p-4">
            <h2 id="by-day" className="font-semibold">
              Gasto por día <span className="text-sm font-normal text-muted-foreground">({data.timezone})</span>
            </h2>
            {data.by_day.length === 0 ? (
              <p className="mt-3 text-sm text-muted-foreground">Sin consumo en este mes.</p>
            ) : (
              <>
                {/* Single series: no legend, the title names it; the table below is the accessible view. */}
                <div className="mt-4 flex h-40 items-end gap-0.5" aria-hidden>
                  {data.by_day.map((d) => (
                    <div key={d.date} title={`${d.date}: ${usd(d.usd)}`} className="group flex h-full min-w-0 flex-1 items-end">
                      <div className="w-full rounded-t-[4px] bg-blue-600 group-hover:bg-blue-500" style={{ height: `${max > 0 ? Math.max(2, (d.usd / max) * 100) : 0}%` }} />
                    </div>
                  ))}
                </div>
                <details className="mt-3 text-sm">
                  <summary className="cursor-pointer text-muted-foreground">Ver como tabla</summary>
                  <table className="mt-2 w-full text-left tabular-nums">
                    <thead>
                      <tr className="text-muted-foreground"><th className="py-1 font-medium">Día</th><th className="py-1 text-right font-medium">Gasto</th></tr>
                    </thead>
                    <tbody>
                      {data.by_day.map((d) => (
                        <tr key={d.date} className="border-t border-border"><td className="py-1">{d.date}</td><td className="py-1 text-right">{usd(d.usd)}</td></tr>
                      ))}
                    </tbody>
                  </table>
                </details>
              </>
            )}
          </section>

          <section aria-label="Detalle por uso" className="grid gap-3 sm:grid-cols-2">
            <UsageCard title="Asistente (responde solo)" kind={data.assistant} />
            <UsageCard title="Copiloto (sugiere al asesor)" kind={data.copilot}
              extra={`${usd(data.copilot.spent_usd)} / ${usd(data.copilot.cap_usd)}`} />
          </section>
        </>
      )}
    </div>
  );
}

function UsageCard({ title, kind, extra }: { title: string; kind: AssistantUsage["assistant"]; extra?: string }) {
  return (
    <div className="rounded-2xl border border-border bg-card p-4 text-sm">
      <h2 className="font-semibold">{title}</h2>
      <dl className="mt-2 grid grid-cols-2 gap-y-1 tabular-nums">
        <dt className="text-muted-foreground">Respuestas generadas</dt><dd className="text-right">{int(kind.runs)}</dd>
        <dt className="text-muted-foreground">Tokens leídos</dt><dd className="text-right">{int(kind.input_tokens)}</dd>
        <dt className="text-muted-foreground">Tokens escritos</dt><dd className="text-right">{int(kind.output_tokens)}</dd>
        {extra && <><dt className="text-muted-foreground">Gasto / tope propio</dt><dd className="text-right">{extra}</dd></>}
      </dl>
    </div>
  );
}
