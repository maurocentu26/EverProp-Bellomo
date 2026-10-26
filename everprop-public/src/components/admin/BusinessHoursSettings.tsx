"use client";

import { useEffect, useState } from "react";
import { apiFetch, EverpropApiError } from "@/lib/everprop-api";

import { isMockDataMode } from "@/lib/data-mode";
import { useCurrentSession } from "@/hooks/use-current-session";
import { SettingsConfirmation } from "./SettingsConfirmation";

type Day = "mon" | "tue" | "wed" | "thu" | "fri" | "sat" | "sun";
type Range = [string, string];
type Schedule = Record<Day, Range[]>;
type State = { business_hours: Schedule | null; away_message: string | null; holidays: string[]; timezone: string; summary: string | null; open_now: boolean; away_message_preview: string | null };

const DAYS: { key: Day; label: string }[] = [
  { key: "mon", label: "Lunes" }, { key: "tue", label: "Martes" }, { key: "wed", label: "Miércoles" }, { key: "thu", label: "Jueves" },
  { key: "fri", label: "Viernes" }, { key: "sat", label: "Sábado" }, { key: "sun", label: "Domingo" },
];
const DEFAULT: Schedule = { mon: [["09:00", "18:00"]], tue: [["09:00", "18:00"]], wed: [["09:00", "18:00"]], thu: [["09:00", "18:00"]], fri: [["09:00", "18:00"]], sat: [], sun: [] };

const MAX_HOLIDAYS = 60;
const formatDate = (iso: string) => new Date(`${iso}T12:00:00`).toLocaleDateString("es-AR", { weekday: "long", day: "numeric", month: "long", year: "numeric" });

function describe(schedule: Schedule | null, away: string, holidays: string[]) {
  return `${schedule ? DAYS.map(({ key, label }) => `${label}: ${schedule[key].length ? schedule[key].map(range => range.join(" a ")).join(", ") : "Cerrado"}`).join("; ") : "Siempre abierto"}. Aviso: ${away.trim() || "Automático"}. Feriados: ${holidays.length ? holidays.map(formatDate).join(", ") : "Sin feriados"}.`;
}

/** EVP-L02: tenant business hours and the away text visitors get; EVP-14: holidays. Only tenant admins see the card. */
export function BusinessHoursSettings() {
  const { user } = useCurrentSession();
  const mockWriter = ["TENANT_ADMIN", "SUPER_ADMIN"].includes(user?.apiRole || "") || (!user?.apiRole && user?.role === "ADMIN");
  const [pending, setPending] = useState<{ schedule: Schedule | null } | null>(null);
  const [state, setState] = useState<State | null>(null);
  const [schedule, setSchedule] = useState<Schedule | null>(null);
  const [away, setAway] = useState("");
  const [holidays, setHolidays] = useState<string[]>([]);
  const [newHoliday, setNewHoliday] = useState("");
  const [hidden, setHidden] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  function load(data: State) {
    setState(data);
    setSchedule(data.business_hours);
    setAway(data.away_message ?? "");
    setHolidays(data.holidays ?? []);
  }

  function addHoliday() {
    if (!newHoliday || holidays.includes(newHoliday) || holidays.length >= MAX_HOLIDAYS) return;
    setHolidays([...holidays, newHoliday].sort());
    setNewHoliday("");
  }

  useEffect(() => {
    if (isMockDataMode) {
      if (!mockWriter) { setHidden(true); return; }
      setHidden(false);
      load({ business_hours: DEFAULT, away_message: "Gracias por escribirnos. Te respondemos en nuestro próximo horario de atención.", holidays: [], timezone: "America/Argentina/Buenos_Aires", summary: "Lunes a viernes de 9 a 18", open_now: true, away_message_preview: null });
      return;
    }
    let alive = true;
    apiFetch<{ data: State }>("/api/v1/admin/business-hours")
      .then(({ data }) => { if (alive) load(data); })
      .catch((error) => {
        if (!alive) return;
        if (error instanceof EverpropApiError && [401, 403].includes(error.status)) { setHidden(true); return; }
        setMessage("No pudimos cargar el horario. Recargá la página.");
      });
    return () => { alive = false; };
  }, [mockWriter]);

  function update(day: Day, ranges: Range[]) {
    setSchedule((current) => (current ? { ...current, [day]: ranges } : current));
  }

  async function save(next: Schedule | null) {
    if (saving || hidden || !state) return;
    setSaving(true);
    setMessage("");
    try {
      const { data } = isMockDataMode ? { data: { ...state, business_hours: next, away_message: away.trim() || null, holidays, summary: null } } : await apiFetch<{ data: State }>("/api/v1/admin/business-hours", { method: "PUT", body: JSON.stringify({ business_hours: next, away_message: away.trim() || null, holidays }) });
      load(data);
      setPending(null);
      setMessage("Horario guardado.");
    } catch (error) {
      setPending(null);
      setMessage(error instanceof EverpropApiError && error.status === 422
        ? "Revisá el horario y los feriados: hasta dos franjas por día, la hora de inicio antes que la de fin, sin superponerse, y fechas válidas."
        : "No se pudo guardar. Volvé a intentarlo.");
    } finally {
      setSaving(false);
    }
  }

  if (hidden) return <section><h2>Horario de atención</h2><p>Define cuándo el equipo está disponible y qué aviso reciben los clientes.</p><p>Solo lectura. Tu cuenta no puede consultar este horario. Pedile el detalle a quien administra la inmobiliaria.</p></section>;

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
          <div className="space-y-2 border-t border-border pt-3">
            <label htmlFor="new-holiday" className="text-sm font-medium">Feriados (cerrado todo el día)</label>
            <div className="flex flex-wrap items-center gap-3">
              <input id="new-holiday" type="date" value={newHoliday} onChange={(e) => setNewHoliday(e.target.value)} className="rounded-lg border border-border bg-background px-2 py-1 text-sm" />
              <button type="button" onClick={addHoliday} disabled={!newHoliday || holidays.length >= MAX_HOLIDAYS} className="min-h-11 rounded-xl border border-border px-4 text-sm font-semibold hover:bg-muted disabled:opacity-50">Agregar feriado</button>
            </div>
            {holidays.length === 0
              ? <p className="text-sm text-muted-foreground">Sin feriados cargados.</p>
              : (
                <ul className="space-y-1 text-sm">
                  {holidays.map((date) => (
                    <li key={date} className="flex items-center gap-3">
                      <span>{formatDate(date)}</span>
                      <button type="button" onClick={() => setHolidays(holidays.filter((d) => d !== date))} aria-label={`Quitar feriado ${formatDate(date)}`} className="text-sm underline">Quitar</button>
                    </li>
                  ))}
                </ul>
              )}
            <p className="text-xs text-muted-foreground">Se guardan con el botón “Guardar horario”. Hasta {MAX_HOLIDAYS} fechas.</p>
          </div>
          <div className="border-t border-border pt-3">
            <label htmlFor="away-message" className="text-sm font-medium">Aviso fuera de horario (opcional)</label>
            <textarea id="away-message" maxLength={500} rows={3} value={away} onChange={(e) => setAway(e.target.value)}
              placeholder={state?.away_message_preview ?? "Si lo dejás vacío, se usa un aviso con el horario y cuándo vuelve el equipo."}
              className="mt-2 w-full rounded-xl border border-border bg-background p-3 text-sm" />
          </div>
          <div className="flex flex-wrap gap-3">
            <button type="button" onClick={() => setPending({ schedule })} className="min-h-11 rounded-xl bg-blue-600 px-4 text-sm font-semibold text-white">Guardar horario</button>
            {state?.business_hours && (
              <button type="button" onClick={() => setPending({ schedule: null })} className="min-h-11 rounded-xl border border-border px-4 text-sm font-semibold">Quitar horario</button>
            )}
          </div>
        </fieldset>
      )}
      {state?.summary && <p className="text-sm">Atención: {state.summary}. {state.open_now ? "Ahora está abierto." : "Ahora está cerrado."}</p>}
      <SettingsConfirmation open={pending !== null} title="¿Guardar el horario de atención?" before={describe(state?.business_hours ?? null, state?.away_message ?? "", state?.holidays ?? [])} after={describe(pending?.schedule ?? null, away, holidays)} busy={saving} onCancel={() => setPending(null)} onConfirm={() => { if (pending) void save(pending.schedule); }} />
      {message && <p role="status" className="text-sm">{message}</p>}
    </section>
  );
}
