"use client";

import { useId, useState } from "react";
import { Calculator, ChevronDown } from "lucide-react";
import { FINANCING_PLANS, findFinancingPlan, financingSummary, cacPayment, fixedPayment } from "@/lib/bellomo-financing";

type Props = { defaultPrice?: number; defaultCurrency?: "USD" | "ARS"; leadName?: string; projectName?: string };
const money = (value: number, currency: string) => `${currency} ${value.toLocaleString("es-AR", { maximumFractionDigits: 2 })}`;
const field = "mt-1 min-h-11 w-full min-w-0 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100";

export default function FinancingCalculator({ defaultPrice = 0, defaultCurrency = "ARS", leadName, projectName }: Props) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const [project, setProject] = useState(findFinancingPlan(projectName)?.name ?? "");
  const [price, setPrice] = useState(defaultPrice > 0 ? String(defaultPrice) : "");
  const [currency, setCurrency] = useState(defaultCurrency);
  const [discount, setDiscount] = useState(true);
  const [exchange, setExchange] = useState("");
  const [advance, setAdvance] = useState("");
  const [mode, setMode] = useState("fixed");
  const [months, setMonths] = useState("12");
  const [base, setBase] = useState("");
  const [due, setDue] = useState("");
  const plan = FINANCING_PLANS.find(item => item.name === project);
  const summary = plan ? financingSummary(plan, Number(price), discount, currency, Number(exchange), advance === "" ? undefined : Number(advance)) : null;
  const count = Number(months);
  const max = mode === "cac" ? plan?.cacMax ?? 0 : plan?.fixed.at(-1)?.max ?? 0;
  const termValid = Number.isInteger(count) && count > 0 && count <= max;
  const rate = plan?.fixed.find(tier => count <= tier.max)?.rate;
  const payment = summary?.balance !== null && summary?.balance !== undefined && termValid && mode === "cac" ? cacPayment(summary.balance, count, Number(base), Number(due)) : null;
  const fixed = summary?.balance != null && termValid && mode === "fixed" && rate != null ? fixedPayment(summary.balance, count, rate) : null;
  const rental = plan?.stage === "alquiler";
  const rentalNet = Number(price) * (discount ? .9 : 1);

  return <section className="min-w-0 overflow-hidden rounded-2xl border border-slate-200 bg-white text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100">
    <button type="button" aria-expanded={open} aria-controls={`${id}-body`} onClick={() => setOpen(!open)} className="flex min-h-16 w-full items-center gap-3 p-4 text-left">
      <Calculator className="size-5 shrink-0 text-blue-600" aria-hidden="true" />
      <span className="min-w-0 flex-1"><span className="block text-base font-bold">Financiación Bellomo</span><span className="block text-xs text-slate-500 dark:text-slate-400">{leadName ? `Simular para ${leadName.split(" ")[0]}` : "Condiciones por proyecto"}</span></span>
      <ChevronDown className={`size-4 shrink-0 ${open ? "rotate-180" : ""}`} aria-hidden="true" />
    </button>
    {open && <div id={`${id}-body`} className="space-y-4 border-t border-slate-200 p-4 dark:border-slate-700">
      <label className="block text-sm font-medium">Proyecto o producto
        <select className={field} value={project} onChange={event => { setProject(event.target.value); setPrice(""); setMode("fixed"); setMonths("12"); setAdvance(""); setBase(""); setDue(""); }}>
          <option value="">Seleccionar condiciones</option>
          {FINANCING_PLANS.map(item => <option key={item.name} value={item.name}>{item.name}</option>)}
        </select>
      </label>
      {!plan && <p className="text-sm text-slate-500 dark:text-slate-400">{projectName ? `No hay condiciones documentadas para ${projectName}. Seleccioná el producto correspondiente.` : "Elegí un proyecto del documento para consultar sus condiciones."}</p>}
      {plan && <>
        <p className="text-xs text-slate-500 dark:text-slate-400">{plan.stage === "preventa" ? "Preventa · escritura y posesión aproximadamente en 48 a 60 meses." : rental ? "Alquiler · actualización cuatrimestral." : "Proyecto en venta."}</p>
        <div className="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2">
          <label className="block min-w-0 text-sm font-medium">{rental ? "Alquiler mensual de lista" : "Precio de lista"}<input className={field} type="number" min="0" step="0.01" value={price} onChange={e => setPrice(e.target.value)} placeholder="Ej.: 20000000" /></label>
          <label className="block min-w-0 text-sm font-medium">Moneda<select className={field} value={currency} onChange={e => { setCurrency(e.target.value as "USD" | "ARS"); setPrice(""); setAdvance(""); }}><option>ARS</option><option>USD</option></select></label>
        </div>
        <label className="flex min-h-11 items-center gap-3 text-sm"><input className="size-4 shrink-0 accent-blue-600" type="checkbox" checked={discount} onChange={e => setDiscount(e.target.checked)} />Aplicar 10% por aniversario · todos los medios de pago</label>
        {rental ? <>
          <p className="text-sm">Contrato de {plan.rentalYears?.join(" o ")} {plan.rentalYears?.length === 1 ? "año" : "años"}. Ingreso: un mes de comisión y un mes de alquiler.</p>
          {Number.isFinite(rentalNet) && rentalNet > 0 && <p className="text-sm">Alquiler mensual con el descuento seleccionado: <strong>{money(rentalNet, currency)}</strong>.</p>}
          <p className="text-xs text-amber-700 dark:text-amber-300">El documento no especifica el índice de actualización ni si el descuento modifica la comisión o todos los meses del contrato. El total de ingreso y las actualizaciones quedan pendientes de confirmación.</p>
        </> : <>
          <p className="text-sm">Entrega mínima: <strong>{"percent" in plan.minimum ? `${plan.minimum.percent}%` : money(plan.minimum.ars, "ARS")}</strong>. Reserva informada: {plan.reserve}. Sin refuerzos.</p>
          {plan.stage === "preventa" && <p className="text-xs text-slate-500 dark:text-slate-400">La entrega, reserva y comisión se unifican en un pago inicial; no se suman. Si sus importes difieren, confirmar la imputación con el equipo.</p>}
          {currency === "USD" && "ars" in plan.minimum && <label className="block text-sm font-medium">Cotización acordada · ARS por USD<input className={field} type="number" min="0.01" step="0.01" value={exchange} onChange={e => setExchange(e.target.value)} placeholder="Necesaria para convertir la entrega mínima" /></label>}
          <label className="block text-sm font-medium">Entrega inicial ({currency})<input className={field} type="number" min="0" step="0.01" value={advance} onChange={e => setAdvance(e.target.value)} placeholder={summary?.minimum != null ? `Mínimo: ${money(summary.minimum, currency)}` : "Automática según el mínimo"} /></label>
          <p className="text-xs text-slate-500 dark:text-slate-400">Los anticipos porcentuales se simulan sobre el precio con descuento. Validar esta base al cotizar. Dejá la entrega vacía para usar el mínimo.</p>
          <label className="block text-sm font-medium">Modalidad<select className={field} value={mode} onChange={e => setMode(e.target.value)}><option value="fixed">Cuotas fijas</option>{plan.cacMax && <option value="cac">Ajuste por CAC</option>}{plan.stepped && <option value="stepped">Escalonado anual · lotes de 300 m²</option>}</select></label>
          {mode === "stepped" ? <p className="text-sm text-amber-700 dark:text-amber-300">El plan escalonado solo aplica a lotes de 300 m². Faltan los importes y escalones anuales en el documento; solicitar la tabla al equipo.</p> : <>
            <label className="block text-sm font-medium">Cantidad de cuotas · máximo {max}<input className={field} type="number" min="1" max={max} step="1" value={months} onChange={e => setMonths(e.target.value)} /></label>
            {!termValid && <p role="alert" className="text-sm text-red-600">Ingresá un número entero entre 1 y {max} cuotas.</p>}
            {mode === "fixed" && <p className="text-sm text-slate-600 dark:text-slate-300">{termValid ? `Tasa mensual: ${rate?.toLocaleString("es-AR")}%. ` : ""}Interés mensual sobre el capital inicial a financiar (precio final menos entrega).</p>}
            {mode === "cac" && <>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <label className="block text-sm font-medium">Índice CAC base<input className={field} type="number" min="0.01" step="any" value={base} onChange={e => setBase(e.target.value)} /></label>
                <label className="block text-sm font-medium">Índice CAC del vencimiento<input className={field} type="number" min="0.01" step="any" value={due} onChange={e => setDue(e.target.value)} /></label>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400">Usá el índice de dos períodos anteriores a la compra y de dos períodos anteriores al vencimiento. Ingresá niveles del mismo índice, no porcentajes. No se proyectan índices futuros.</p>
            </>}
          </>}
          {summary && <div aria-live="polite" className="space-y-2 rounded-xl bg-slate-50 p-3 text-sm dark:bg-slate-900">
            <p>Descuento: <strong className="break-words">{money(summary.discountAmount, currency)}</strong></p>
            <p>Precio final: <strong className="break-words">{money(summary.net, currency)}</strong></p>
            {summary.valid ? <><p>Entrega: <strong className="break-words">{money(summary.initial!, currency)}</strong></p><p>Saldo a financiar: <strong className="break-words">{money(summary.balance!, currency)}</strong></p>
              {fixed && <><p className="text-base font-bold">Cuota fija: {money(fixed.monthly, currency)}</p><p>Intereses totales: <strong>{money(fixed.interest, currency)}</strong></p><p>Total con entrega: <strong>{money(summary.initial! + fixed.total, currency)}</strong></p><p className="text-xs">Cuota = saldo inicial ÷ cuotas + saldo inicial × tasa mensual. Importes mostrados redondeados a dos decimales.</p></>}
              {mode === "cac" && termValid && <><p>Cuota base, antes del ajuste: <strong>{money(summary.balance! / count, currency)}</strong></p>{payment !== null ? <p>Cuota con los índices ingresados: <strong>{money(payment, currency)}</strong></p> : <p>Ingresá ambos índices positivos para calcular la cuota ajustada.</p>}<p className="text-xs">Cuota = saldo ÷ cuotas × índice del vencimiento ÷ índice base. El total futuro depende del CAC.</p></>}
            </> : <p role="alert" className="text-red-600 dark:text-red-400">{summary.minimum === null ? "Completá la cotización para calcular el mínimo en USD." : "La entrega debe cubrir el mínimo y no superar el precio final."}</p>}
          </div>}
          {(!Number.isFinite(Number(price)) || Number(price) <= 0) && <p className="text-sm text-slate-500">Ingresá un precio mayor que cero para simular.</p>}
        </>}
        <p className="text-xs text-slate-500 dark:text-slate-400">Fuente: Financiación Bellomo.docx. Simulación de trabajo; no registra una reserva ni modifica la ficha del lead.</p>
      </>}
    </div>}
  </section>;
}
