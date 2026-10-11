"use client";

import { useEffect, useState } from "react";
import { apiFetch, EverpropApiError } from "@/lib/everprop-api";

type Day = "mon" | "tue" | "wed" | "thu" | "fri" | "sat" | "sun";
type Range = [string, string];
type Schedule = Record<Day, Range[]>;
type State = { business_hours: Schedule | null; away_message: string | null; timezone: string; summary: string | null; open_now: boolean; away_message_preview: string | null };

const DAYS: { key: Day; label: string }[] = [
  { key: "mon", label: "Lunes" }, { key: "tue", label: "Martes" }, { key: "wed", label: "Miércoles" }, { key: "thu", label: "Jueves" },
  { key: "fri", label: "Viernes" }, { key: "sat", label: "Sábado" }, { key: "sun", label: "Domingo" },
];
const DEFAULT: Schedule = { mon: [["09:00", "18:00"]], tue: [["09:00", "18:00"]], wed: [["09:00", "18:00"]], thu: [["09:00", "18:00"]], fri: [["09:00", "18:00"]], sat: [], sun: [] };

/** EVP-L02: tenant business hours and the away text visitors get. Only tenant admins see the card. */
export function BusinessHoursSettings() {
  const [state, setState] = useState<State | null>(null);
  const [schedule, setSchedule] = useState<Schedule | null>(null);
  const [away, setAway] = useState("");
  const [hidden, setHidden] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  function load(data: State) {
    setState(data);
    setSchedule(data.business_hours);
    setAway(data.away_message ?? "");
  }

  useEffect(() => {
    let alive = true;
    apiFetch<{ data: State }>("/api/v1/admin/business-hours")
      .then(({ data }) => { if (alive) load(data); })
      .catch((error) => {
        if (!alive) return;
        if (error instanceof EverpropApiError && [401, 403].includes(error.status)) { setHidden(true); return; }
        setMessage("No pudimos cargar el horario. Recargá la página.");
      });
    return () => { alive = false; };
  }, []);

  function update(day: Day, ranges: Range[]) {
    setSchedule((current) => (current ? { ...current, [day]: ranges } : current));
  }

  async function save(next: Schedule | null) {
    setSaving(true);
    setMessage("");
    try {
      const { data } = await apiFetch<{ data: State }>("/api/v1/admin/business-hours", { method: "PUT", body: JSON.stringify({ business_hours: next, away_message: away.trim() || null }) });
      load(data);
      setMessage("Horario guardado.");
    } catch (error) {
      setMessage(error instanceof EverpropApiError && error.status === 422
        ? "Revisá el horario: hasta dos franjas por día, la hora de inicio antes que la de fin y sin superponerse."
        : "No se pudo guardar. Volvé a intentarlo.");
    } finally {
      setSaving(false);
    }
  }

  if (hidden) return null;

  return (
    <section aria-labelledby="business-hours-title" className="space-y-4 rounded-2xl border border-border bg-card p-5">
      <div>
        <h2 id="business-hours-title" className="font-semibold">Horario de atención</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Fuera de este horario, quien escribe recibe un aviso con el horario y cuándo lo atienden. Sin horario, se considera abierto siempre.
          {state && ` Zona horaria: ${state.timezone}.`}
        </p>
      </div>
      {state === null && !message && <p className="text-sm text-muted-foreground">Cargando…</p>}
      {state && schedule === null && (
        <button type="button" onClick={() => setSchedule(DEFAULT)} className="min-h-11 rounded-xl border border-border px-4 text-sm font-semibold hover:bg-muted">
          Definir horario
        </button>
      )}
      {schedule && (
        <fieldset className="space-y-3" disabled={saving}>
          <legend className="sr-only">Franjas por día</legend>
          {DAYS.map(({ key, label }) => (
            <div key={key} className="flex flex-wrap items-center gap-3 border-t border-border pt-3">
              <label className="flex min-w-32 items-center gap-2 text-sm font-medium">
                <input type="checkbox" checked={schedule[key].length > 0} onChange={(e) => update(key, e.target.checked ? [["09:00", "18:00"]] : [])} className="h-5 w-5" />
                {label}
              </label>
              {schedule[key].length === 0 && <span className="text-sm text-muted-foreground">Cerrado</span>}
              {schedule[key].map(([from, to], i) => (
                <span key={i} className="flex items-center gap-2 text-sm">
                  <input type="time" aria-label={`${label}, desde (franja ${i + 1})`} value={from} className="rounded-lg border border-border bg-background px-2 py-1"
                    onChange={(e) => update(key, schedule[key].map((r, j) => (j === i ? [e.target.value, r[1]] : r)))} />
                  a
                  <input type="time" aria-label={`${label}, hasta (franja ${i + 1})`} value={to} className="rounded-lg border border-border bg-background px-2 py-1"
                    onChange={(e) => update(key, schedule[key].map((r, j) => (j === i ? [r[0], e.target.value] : r)))} />
                  {i === 1 && <button type="button" onClick={() => update(key, schedule[key].slice(0, 1))} className="text-sm underline">Quitar</button>}
                </span>
              ))}
              {schedule[key].length === 1 && (
                <button type="button" onClick={() => update(key, [...schedule[key], ["14:00", "18:00"]])} className="text-sm underline">Agregar franja</button>
              )}
            </div>
          ))}
          <div className="border-t border-border pt-3">
            <label htmlFor="away-message" className="text-sm font-medium">Aviso fuera de horario (opcional)</label>
            <textarea id="away-message" maxLength={500} rows={3} value={away} onChange={(e) => setAway(e.target.value)}
              placeholder={state?.away_message_preview ?? "Si lo dejás vacío, se usa un aviso con el horario y cuándo vuelve el equipo."}
              className="mt-2 w-full rounded-xl border border-border bg-background p-3 text-sm" />
          </div>
          <div className="flex flex-wrap gap-3">
            <button type="button" onClick={() => void save(schedule)} className="min-h-11 rounded-xl bg-blue-600 px-4 text-sm font-semibold text-white">Guardar horario</button>
            {state?.business_hours && (
              <button type="button" onClick={() => void save(null)} className="min-h-11 rounded-xl border border-border px-4 text-sm font-semibold">Quitar horario</button>
            )}
          </div>
        </fieldset>
      )}
      {state?.summary && <p className="text-sm">Atención: {state.summary}. {state.open_now ? "Ahora está abierto." : "Ahora está cerrado."}</p>}
      {message && <p role="status" className="text-sm">{message}</p>}
    </section>
  );
}
