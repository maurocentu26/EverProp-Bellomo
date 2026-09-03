"use client";

import { useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Calculator, ChevronDown, ChevronUp, TrendingUp, Banknote, Percent, Calendar } from "lucide-react";
import { cn } from "@/lib/utils";

type Props = {
  /** Pre-fill with the primary property price. Optional. */
  defaultPrice?: number;
  defaultCurrency?: "USD" | "ARS";
  leadName?: string;
};

const PRESETS = [
  { label: "5 años",  months: 60  },
  { label: "10 años", months: 120 },
  { label: "15 años", months: 180 },
  { label: "20 años", months: 240 },
  { label: "30 años", months: 360 },
];

function fmt(n: number, currency: string) {
  return n.toLocaleString("es-AR", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  });
}

export default function FinancingCalculator({ defaultPrice = 0, defaultCurrency = "USD", leadName }: Props) {
  const [isOpen, setIsOpen] = useState(false);
  const [price, setPrice] = useState(defaultPrice > 0 ? String(defaultPrice) : "");
  const [downPaymentPct, setDownPaymentPct] = useState(30);
  const [annualRate, setAnnualRate] = useState(8.5);
  const [months, setMonths] = useState(120);
  const [currency, setCurrency] = useState<"USD" | "ARS">(defaultCurrency);

  const calc = useMemo(() => {
    const p = parseFloat(price.replace(/\./g, "").replace(",", ".")) || 0;
    if (p <= 0) return null;

    const downPayment = (p * downPaymentPct) / 100;
    const principal = p - downPayment;
    const monthlyRate = annualRate / 100 / 12;

    let monthlyPayment: number;
    if (monthlyRate === 0) {
      monthlyPayment = principal / months;
    } else {
      monthlyPayment =
        (principal * monthlyRate * Math.pow(1 + monthlyRate, months)) /
        (Math.pow(1 + monthlyRate, months) - 1);
    }

    const totalPaid = downPayment + monthlyPayment * months;
    const totalInterest = totalPaid - p;

    return { downPayment, principal, monthlyPayment, totalPaid, totalInterest };
  }, [price, downPaymentPct, annualRate, months]);

  return (
    <div className="rounded-[2.5rem] border border-slate-200 bg-white overflow-hidden shadow-sm">
      {/* Header — always visible, acts as toggle */}
      <button
        onClick={() => setIsOpen((v) => !v)}
        className="w-full flex items-center justify-between px-7 py-5 group"
      >
        <div className="flex items-center gap-3">
          <span className="p-2.5 rounded-2xl bg-amber-500 text-white shadow-sm shadow-amber-200">
            <Calculator className="h-5 w-5" />
          </span>
          <div className="text-left">
            <h3 className="text-lg font-bold text-slate-900 leading-tight">Simulador de Financiación</h3>
            <p className="text-xs text-slate-500 font-medium mt-0.5">
              {leadName ? `Calculá opciones para ${leadName.split(" ")[0]}` : "Simulá cuotas y plazos"}
            </p>
          </div>
        </div>
        <span className="text-slate-400 group-hover:text-slate-600 transition-colors">
          {isOpen ? <ChevronUp className="h-5 w-5" /> : <ChevronDown className="h-5 w-5" />}
        </span>
      </button>

      <AnimatePresence initial={false}>
        {isOpen && (
          <motion.div
            key="calc-body"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25, ease: "easeInOut" }}
            className="overflow-hidden"
          >
            <div className="px-7 pb-7 space-y-6 border-t border-slate-100 pt-6">

              {/* Input row */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* Price */}
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-500 uppercase tracking-widest flex items-center gap-1.5">
                    <Banknote className="h-3.5 w-3.5" /> Precio del inmueble
                  </label>
                  <div className="flex rounded-xl border border-slate-200 overflow-hidden focus-within:ring-2 focus-within:ring-blue-500">
                    <select
                      value={currency}
                      onChange={(e) => setCurrency(e.target.value as "USD" | "ARS")}
                      className="bg-slate-50 border-r border-slate-200 px-2 text-xs font-bold text-slate-700 focus:outline-none"
                    >
                      <option value="USD">USD</option>
                      <option value="ARS">ARS</option>
                    </select>
                    <input
                      type="number"
                      min={0}
                      value={price}
                      onChange={(e) => setPrice(e.target.value)}
                      placeholder="Ej: 95000"
                      className="flex-1 px-3 py-2.5 text-sm font-semibold text-slate-900 focus:outline-none bg-white"
                    />
                  </div>
                </div>

                {/* Term presets */}
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-500 uppercase tracking-widest flex items-center gap-1.5">
                    <Calendar className="h-3.5 w-3.5" /> Plazo
                  </label>
                  <div className="flex flex-wrap gap-1.5">
                    {PRESETS.map((p) => (
                      <button
                        key={p.months}
                        onClick={() => setMonths(p.months)}
                        className={cn(
                          "px-3 py-1.5 rounded-xl text-xs font-bold border transition-all",
                          months === p.months
                            ? "bg-blue-600 text-white border-blue-600 shadow-sm"
                            : "bg-white text-slate-600 border-slate-200 hover:border-blue-300"
                        )}
                      >
                        {p.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Down payment */}
                <div className="space-y-2">
                  <label className="text-xs font-bold text-slate-500 uppercase tracking-widest flex items-center justify-between">
                    <span className="flex items-center gap-1.5"><Percent className="h-3.5 w-3.5" /> Anticipo</span>
                    <span className="text-blue-600 font-black text-sm">{downPaymentPct}%</span>
                  </label>
                  <input
                    type="range"
                    min={0}
                    max={80}
                    step={5}
                    value={downPaymentPct}
                    onChange={(e) => setDownPaymentPct(Number(e.target.value))}
                    className="w-full accent-blue-600"
                  />
                  <div className="flex justify-between text-[10px] text-slate-400 font-medium">
                    <span>0%</span><span>40%</span><span>80%</span>
                  </div>
                </div>

                {/* Interest rate */}
                <div className="space-y-2">
                  <label className="text-xs font-bold text-slate-500 uppercase tracking-widest flex items-center justify-between">
                    <span className="flex items-center gap-1.5"><TrendingUp className="h-3.5 w-3.5" /> Tasa anual</span>
                    <span className="text-amber-600 font-black text-sm">{annualRate.toFixed(1)}%</span>
                  </label>
                  <input
                    type="range"
                    min={0}
                    max={30}
                    step={0.5}
                    value={annualRate}
                    onChange={(e) => setAnnualRate(Number(e.target.value))}
                    className="w-full accent-amber-500"
                  />
                  <div className="flex justify-between text-[10px] text-slate-400 font-medium">
                    <span>0%</span><span>15%</span><span>30%</span>
                  </div>
                </div>
              </div>

              {/* Results */}
              <AnimatePresence mode="wait">
                {calc ? (
                  <motion.div
                    key="results"
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.2 }}
                    className="grid grid-cols-2 sm:grid-cols-4 gap-3"
                  >
                    {/* Monthly payment — hero card */}
                    <div className="col-span-2 sm:col-span-2 rounded-2xl bg-gradient-to-br from-blue-600 to-blue-700 p-5 text-white">
                      <p className="text-xs font-bold uppercase tracking-widest opacity-75 mb-1">Cuota mensual</p>
                      <p className="text-3xl font-black leading-none tracking-tight">
                        {fmt(calc.monthlyPayment, currency)}
                      </p>
                      <p className="text-xs opacity-70 mt-1.5">
                        {months} cuotas · {annualRate}% TNA
                      </p>
                    </div>

                    {/* Down payment */}
                    <div className="rounded-2xl bg-slate-50 border border-slate-100 p-4">
                      <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-1">Anticipo</p>
                      <p className="text-lg font-black text-slate-900">{fmt(calc.downPayment, currency)}</p>
                      <p className="text-[10px] text-slate-400 mt-0.5">{downPaymentPct}% del precio</p>
                    </div>

                    {/* Principal */}
                    <div className="rounded-2xl bg-slate-50 border border-slate-100 p-4">
                      <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-1">Capital a financiar</p>
                      <p className="text-lg font-black text-slate-900">{fmt(calc.principal, currency)}</p>
                      <p className="text-[10px] text-slate-400 mt-0.5">{100 - downPaymentPct}% del precio</p>
                    </div>

                    {/* Total paid */}
                    <div className="rounded-2xl bg-amber-50 border border-amber-100 p-4">
                      <p className="text-[10px] font-bold uppercase tracking-widest text-amber-600 mb-1">Total a pagar</p>
                      <p className="text-lg font-black text-amber-700">{fmt(calc.totalPaid, currency)}</p>
                    </div>

                    {/* Total interest */}
                    <div className="rounded-2xl bg-rose-50 border border-rose-100 p-4">
                      <p className="text-[10px] font-bold uppercase tracking-widest text-rose-500 mb-1">Intereses totales</p>
                      <p className="text-lg font-black text-rose-600">{fmt(calc.totalInterest, currency)}</p>
                    </div>
                  </motion.div>
                ) : (
                  <motion.div
                    key="empty"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="rounded-2xl bg-slate-50 border border-dashed border-slate-200 p-6 text-center"
                  >
                    <Calculator className="h-8 w-8 text-slate-200 mx-auto mb-2" />
                    <p className="text-sm font-medium text-slate-400">Ingresá el precio del inmueble para ver los resultados</p>
                  </motion.div>
                )}
              </AnimatePresence>

              <p className="text-[10px] text-slate-400 text-center">
                * Simulación orientativa. Los valores reales dependen de la entidad financiera.
              </p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
