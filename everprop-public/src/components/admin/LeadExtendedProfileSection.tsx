"use client";

import { useEffect, useState, type ReactNode } from "react";
import { Briefcase, Home, IdCard, MapPin, Plus, ShieldCheck, Trash2 } from "lucide-react";

import { JUJUY_CITIES } from "@/data/admin-sample";
import { isMockDataMode } from "@/lib/data-mode";
import { loadEverpropProfileSuggestions } from "@/lib/everprop-api";
import {
  computeAge,
  emptyAddress,
  emptyAsset,
  HOUSING_STATUS_LABELS,
  MARITAL_STATUSES,
  PROVINCES,
  rowHasData,
  TAX_CONDITIONS,
  type LeadExtendedProfile,
  type ProfileSuggestions,
} from "@/lib/lead-extended-profile";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

const inputClass =
  "h-10 w-full min-w-0 rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900 shadow-sm outline-none placeholder:text-slate-400 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-600 aria-[invalid=true]:border-rose-500 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-100 dark:placeholder:text-slate-500 dark:disabled:bg-slate-900 dark:disabled:text-slate-400";

/** Base list first, then this tenant's previous values, without repeats (case-insensitive). */
const mergeOptions = (...lists: ReadonlyArray<readonly string[] | undefined>) => {
  const seen = new Set<string>();
  return lists.flatMap((list) => list ?? []).filter((value) => {
    const key = value.toLocaleLowerCase("es-AR");
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};

type Props = {
  /** Unique per instance: ids of inputs and datalists. */
  idPrefix: string;
  value: LeadExtendedProfile;
  onChange: (next: LeadExtendedProfile) => void;
  errors?: Record<string, string>;
  disabled?: boolean;
  /** false for READ_ONLY: the API does not send DNI, CUIT, incomes nor guarantor. */
  showSensitive?: boolean;
  /** Lead created_at, shown read-only as "Fecha de alta". */
  createdAt?: string;
};

type PendingRemoval = { list: "addresses" | "assets"; index: number } | null;

export function LeadExtendedProfileSection({ idPrefix, value, onChange, errors = {}, disabled = false, showSensitive = true, createdAt }: Props) {
  const [suggestions, setSuggestions] = useState<ProfileSuggestions | null>(null);
  const [pendingRemoval, setPendingRemoval] = useState<PendingRemoval>(null);

  useEffect(() => {
    if (isMockDataMode || disabled) return;
    let active = true;
    // Autocomplete is a convenience: without it the base lists still work.
    loadEverpropProfileSuggestions().then((data) => active && setSuggestions(data)).catch(() => undefined);
    return () => { active = false; };
  }, [disabled]);

  const id = (path: string) => `${idPrefix}-${path.replace(/\./g, "-")}`;
  const set = <B extends "personal" | "employment" | "guarantor">(block: B, key: keyof LeadExtendedProfile[B], next: string) =>
    onChange({ ...value, [block]: { ...value[block], [key]: next } });
  const setHousing = (key: "status" | "notes", next: string) => onChange({ ...value, currentHousing: { ...value.currentHousing, [key]: next } });
  const setAddress = (index: number, key: keyof LeadExtendedProfile["addresses"][number], next: string) =>
    onChange({ ...value, addresses: value.addresses.map((row, i) => (i === index ? { ...row, [key]: next } : row)) });
  const setAsset = (index: number, key: keyof LeadExtendedProfile["currentHousing"]["assets"][number], next: string) =>
    onChange({ ...value, currentHousing: { ...value.currentHousing, assets: value.currentHousing.assets.map((row, i) => (i === index ? { ...row, [key]: next } : row)) } });

  function removeRow(list: "addresses" | "assets", index: number) {
    if (list === "addresses") onChange({ ...value, addresses: value.addresses.filter((_, i) => i !== index) });
    else onChange({ ...value, currentHousing: { ...value.currentHousing, assets: value.currentHousing.assets.filter((_, i) => i !== index) } });
  }
  function requestRemoval(list: "addresses" | "assets", index: number) {
    const row = list === "addresses" ? value.addresses[index] : value.currentHousing.assets[index];
    if (row && rowHasData(row)) setPendingRemoval({ list, index });
    else removeRow(list, index);
  }

  const age = computeAge(value.personal.birthDate);

  function field(path: string, label: string, input: ReactNode, hint?: string) {
    const error = errors[path];
    return (
      <div className="min-w-0 space-y-1">
        <label htmlFor={id(path)} className="block text-xs font-semibold text-slate-700 dark:text-slate-300">{label}</label>
        {input}
        {hint && !error && <p className="text-[11px] text-slate-500 dark:text-slate-400">{hint}</p>}
        {error && <p id={`${id(path)}-error`} role="alert" className="text-xs font-medium text-rose-600">{error}</p>}
      </div>
    );
  }
  function text(path: string, label: string, current: string, update: (next: string) => void, options: { maxLength?: number; type?: string; inputMode?: "numeric" | "decimal" | "tel" | "email"; list?: string; placeholder?: string; hint?: string } = {}) {
    return field(path, label, (
      <input
        id={id(path)}
        type={options.type ?? "text"}
        inputMode={options.inputMode}
        list={options.list}
        maxLength={options.maxLength ?? 200}
        placeholder={options.placeholder}
        value={current}
        disabled={disabled}
        aria-invalid={Boolean(errors[path])}
        aria-describedby={errors[path] ? `${id(path)}-error` : undefined}
        onChange={(event) => update(event.target.value)}
        className={inputClass}
      />
    ), options.hint);
  }
  const money = (path: string, label: string, current: string, update: (next: string) => void) =>
    text(path, label, current, update, { type: "number", inputMode: "decimal", placeholder: "0" });

  const datalist = (name: string, options: string[]) => (
    <datalist id={id(`list-${name}`)}>{options.map((option) => <option key={option} value={option} />)}</datalist>
  );

  return (
    <div className="space-y-5">
      {datalist("tax", mergeOptions(TAX_CONDITIONS, suggestions?.taxConditions))}
      {datalist("marital", MARITAL_STATUSES)}
      {datalist("neighborhoods", mergeOptions(suggestions?.neighborhoods))}
      {datalist("cities", mergeOptions(JUJUY_CITIES, suggestions?.cities))}
      {datalist("provinces", mergeOptions(PROVINCES, suggestions?.provinces))}

      {!showSensitive && (
        <p role="note" className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs text-slate-600 dark:border-slate-800 dark:bg-slate-900/60 dark:text-slate-300">
          Tu rol no ve DNI, CUIT, ingresos ni datos del garante.
        </p>
      )}

      <Block icon={IdCard} title="Identidad y datos fiscales">
        <div className="grid grid-cols-1 gap-3 @md:grid-cols-2 @3xl:grid-cols-4">
          {showSensitive && text("personal.documentNumber", "DNI", value.personal.documentNumber, (v) => set("personal", "documentNumber", v), { maxLength: 20, inputMode: "numeric" })}
          {showSensitive && text("personal.taxId", "CUIT / CUIL", value.personal.taxId, (v) => set("personal", "taxId", v), { maxLength: 20, inputMode: "numeric", placeholder: "20-12345678-3" })}
          {text("personal.taxCondition", "Condición IVA", value.personal.taxCondition, (v) => set("personal", "taxCondition", v), { maxLength: 80, list: id("list-tax") })}
          {text("personal.nationality", "Nacionalidad", value.personal.nationality, (v) => set("personal", "nationality", v), { maxLength: 80, placeholder: "Argentina" })}
          {text("personal.maritalStatus", "Estado civil", value.personal.maritalStatus, (v) => set("personal", "maritalStatus", v), { maxLength: 40, list: id("list-marital") })}
          {text("personal.birthDate", "Fecha de nacimiento", value.personal.birthDate, (v) => set("personal", "birthDate", v), {
            type: "date",
            hint: age !== null ? `Edad: ${age} años` : undefined,
          })}
          {text("personal.childrenCount", "Hijos", value.personal.childrenCount, (v) => set("personal", "childrenCount", v), { type: "number", inputMode: "numeric", placeholder: "0" })}
          {createdAt && (
            <div className="min-w-0 space-y-1">
              <p className="text-xs font-semibold text-slate-700 dark:text-slate-300">Fecha de alta</p>
              <p className="flex h-10 items-center text-sm text-slate-900 dark:text-slate-100">
                {new Date(createdAt).toLocaleDateString("es-AR", { timeZone: "America/Argentina/Buenos_Aires" })}
              </p>
            </div>
          )}
        </div>
      </Block>

      <Block
        icon={MapPin}
        title="Domicilios"
        action={!disabled && value.addresses.length < 10 && (
          <Button type="button" variant="outline" onClick={() => onChange({ ...value, addresses: [...value.addresses, emptyAddress()] })} className="min-h-11 gap-1.5 text-xs font-semibold">
            <Plus className="size-3.5" aria-hidden="true" /> Agregar domicilio
          </Button>
        )}
      >
        {value.addresses.length === 0 ? (
          <p className="text-xs text-slate-500 dark:text-slate-400">Sin domicilios cargados.</p>
        ) : (
          <ol className="space-y-3">
            {value.addresses.map((address, index) => (
              <li key={index} className="rounded-xl border border-slate-200 p-3 dark:border-slate-800">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <p className="text-xs font-bold text-slate-700 dark:text-slate-300">Domicilio {index + 1}</p>
                  {!disabled && (
                    <Button type="button" variant="ghost" onClick={() => requestRemoval("addresses", index)} className="min-h-11 gap-1.5 text-xs font-semibold text-rose-700 hover:bg-rose-50 dark:text-rose-400 dark:hover:bg-rose-950/30">
                      <Trash2 className="size-3.5" aria-hidden="true" /> Quitar<span className="sr-only"> domicilio {index + 1}</span>
                    </Button>
                  )}
                </div>
                <div className="grid grid-cols-1 gap-3 @md:grid-cols-2 @2xl:grid-cols-3">
                  {text(`addresses.${index}.street`, "Calle y número", address.street, (v) => setAddress(index, "street", v), { placeholder: "Belgrano 1234" })}
                  {text(`addresses.${index}.floorAndUnit`, "Piso y depto.", address.floorAndUnit, (v) => setAddress(index, "floorAndUnit", v), { maxLength: 40 })}
                  {text(`addresses.${index}.neighborhood`, "Barrio", address.neighborhood, (v) => setAddress(index, "neighborhood", v), { maxLength: 120, list: id("list-neighborhoods") })}
                  {text(`addresses.${index}.city`, "Localidad", address.city, (v) => setAddress(index, "city", v), { maxLength: 120, list: id("list-cities") })}
                  {text(`addresses.${index}.province`, "Provincia", address.province, (v) => setAddress(index, "province", v), { maxLength: 120, list: id("list-provinces") })}
                </div>
              </li>
            ))}
          </ol>
        )}
      </Block>

      <Block icon={Briefcase} title="Datos laborales">
        <div className="grid grid-cols-1 gap-3 @md:grid-cols-2 @2xl:grid-cols-3">
          {text("employment.employer", "Empleador", value.employment.employer, (v) => set("employment", "employer", v))}
          {text("employment.profession", "Profesión", value.employment.profession, (v) => set("employment", "profession", v), { maxLength: 120 })}
          {text("employment.role", "Cargo", value.employment.role, (v) => set("employment", "role", v), { maxLength: 120 })}
          {text("employment.phone", "Teléfono laboral", value.employment.phone, (v) => set("employment", "phone", v), { maxLength: 40, type: "tel", inputMode: "tel" })}
          {text("employment.email", "Email laboral", value.employment.email, (v) => set("employment", "email", v), { maxLength: 320, type: "email", inputMode: "email" })}
          {showSensitive && money("employment.income", "Ingreso mensual", value.employment.income, (v) => set("employment", "income", v))}
        </div>
      </Block>

      {showSensitive && (
        <Block icon={ShieldCheck} title="Garante del titular">
          <div className="grid grid-cols-1 gap-3 @md:grid-cols-2 @2xl:grid-cols-3">
            {text("guarantor.name", "Nombre completo", value.guarantor.name, (v) => set("guarantor", "name", v))}
            {text("guarantor.documentNumber", "DNI", value.guarantor.documentNumber, (v) => set("guarantor", "documentNumber", v), { maxLength: 20, inputMode: "numeric" })}
            {text("guarantor.phone", "Teléfono", value.guarantor.phone, (v) => set("guarantor", "phone", v), { maxLength: 40, type: "tel", inputMode: "tel" })}
            {text("guarantor.address", "Dirección", value.guarantor.address, (v) => set("guarantor", "address", v), { maxLength: 300 })}
            {text("guarantor.employer", "Empleador", value.guarantor.employer, (v) => set("guarantor", "employer", v))}
            {text("guarantor.role", "Cargo", value.guarantor.role, (v) => set("guarantor", "role", v), { maxLength: 120 })}
            {money("guarantor.income", "Ingreso mensual", value.guarantor.income, (v) => set("guarantor", "income", v))}
          </div>
        </Block>
      )}

      <Block icon={Home} title="Vivienda actual del solicitante">
        <div className="grid grid-cols-1 gap-3 @md:grid-cols-2">
          {field("currentHousing.status", "Situación", (
            <select id={id("currentHousing.status")} value={value.currentHousing.status} disabled={disabled} onChange={(event) => setHousing("status", event.target.value)} className={inputClass}>
              <option value="">Sin informar</option>
              {Object.entries(HOUSING_STATUS_LABELS).map(([code, label]) => <option key={code} value={code}>{label}</option>)}
            </select>
          ))}
          {field("currentHousing.notes", "Observación", (
            <textarea id={id("currentHousing.notes")} rows={2} maxLength={2000} value={value.currentHousing.notes} disabled={disabled} onChange={(event) => setHousing("notes", event.target.value)} className={cn(inputClass, "h-auto py-2")} />
          ))}
        </div>
        <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
          <h4 className="text-xs font-bold text-slate-700 dark:text-slate-300">Bienes</h4>
          {!disabled && value.currentHousing.assets.length < 20 && (
            <Button type="button" variant="outline" onClick={() => onChange({ ...value, currentHousing: { ...value.currentHousing, assets: [...value.currentHousing.assets, emptyAsset()] } })} className="min-h-11 gap-1.5 text-xs font-semibold">
              <Plus className="size-3.5" aria-hidden="true" /> Agregar bien
            </Button>
          )}
        </div>
        {value.currentHousing.assets.length === 0 ? (
          <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">Sin bienes cargados.</p>
        ) : (
          <ol className="mt-2 space-y-2">
            {value.currentHousing.assets.map((asset, index) => (
              <li key={index} className="grid grid-cols-1 items-end gap-3 rounded-xl border border-slate-200 p-3 @xl:grid-cols-[1fr_1fr_8rem_auto] dark:border-slate-800">
                {money(`currentHousing.assets.${index}.value`, "Valor", asset.value, (v) => setAsset(index, "value", v))}
                {text(`currentHousing.assets.${index}.typology`, "Tipología", asset.typology, (v) => setAsset(index, "typology", v), { maxLength: 120, placeholder: "Casa, auto, terreno…" })}
                {text(`currentHousing.assets.${index}.quantity`, "Cantidad", asset.quantity, (v) => setAsset(index, "quantity", v), { type: "number", inputMode: "numeric", placeholder: "1" })}
                {!disabled && (
                  <Button type="button" variant="ghost" onClick={() => requestRemoval("assets", index)} className="min-h-11 gap-1.5 text-xs font-semibold text-rose-700 hover:bg-rose-50 dark:text-rose-400 dark:hover:bg-rose-950/30">
                    <Trash2 className="size-3.5" aria-hidden="true" /> Quitar<span className="sr-only"> bien {index + 1}</span>
                  </Button>
                )}
              </li>
            ))}
          </ol>
        )}
      </Block>

      <Dialog open={pendingRemoval !== null} onOpenChange={(open) => !open && setPendingRemoval(null)}>
        <DialogContent showCloseButton={false} className="mi-day leads-workspace lead-review sm:max-w-lg">
          <DialogTitle>{pendingRemoval?.list === "addresses" ? "¿Quitar este domicilio?" : "¿Quitar este bien?"}</DialogTitle>
          <DialogDescription>La fila tiene datos cargados. Se quita del formulario y desaparece de la ficha cuando guardes.</DialogDescription>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setPendingRemoval(null)}>Conservar</Button>
            <Button type="button" variant="destructive" onClick={() => { if (pendingRemoval) removeRow(pendingRemoval.list, pendingRemoval.index); setPendingRemoval(null); }}>Sí, quitar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Block({ icon: Icon, title, action, children }: { icon: typeof Home; title: string; action?: ReactNode; children: ReactNode }) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5 dark:border-slate-800 dark:bg-slate-900">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 pb-3 dark:border-slate-800">
        <h3 className="flex items-center gap-2 text-sm font-bold text-slate-900 dark:text-slate-100">
          <Icon className="size-4 text-blue-600 dark:text-blue-400" aria-hidden="true" /> {title}
        </h3>
        {action}
      </div>
      {/* Columns follow the block's own width (in rem), so they also adapt to the sidebar and to "Grande" text. */}
      <div className="@container">{children}</div>
    </section>
  );
}
