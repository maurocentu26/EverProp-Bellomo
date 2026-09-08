"use client";

import { useState, useMemo, useEffect, useId } from "react";
import {
  Calculator,
  ChevronDown,
  ChevronUp,
  Percent,
  Calendar,
  Building2,
  CheckCircle2,
  AlertCircle,
  HelpCircle,
  ReceiptText,
  Check,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  FINANCING_PLANS,
  findFinancingPlan,
  financingSummary,
  fixedPayment,
  cacPayment,
  type FinancingPlan,
} from "@/lib/bellomo-financing";
import {
  createAgreementWithInstallments,
  loadPaymentAgreementList,
  loadInstallmentList,
} from "@/lib/admin-storage";
import { samplePaymentAgreements, sampleInstallments } from "@/data/admin-sample";
import { getTodayDateString } from "@/lib/installment-notifications";
import { toast } from "sonner";

export type FinancingCalculatorProps = {
  /** Pre-fill with the primary property price */
  defaultPrice?: number;
  defaultCurrency?: "USD" | "ARS";
  leadName?: string;
  leadId?: string;
  advisorId?: string;
  propertyTitle?: string;
  projectName?: string;
  companyId?: string;
  className?: string;
  onPlanCreated?: () => void;
};

function fmt(n: number, currency: "USD" | "ARS") {
  return n.toLocaleString("es-AR", {
    style: "currency",
    currency,
    maximumFractionDigits: 2,
  });
}

export default function FinancingCalculator({
  defaultPrice = 0,
  defaultCurrency = "USD",
  leadName,
  leadId,
  advisorId,
  propertyTitle,
  projectName,
  companyId = "c1",
  className,
  onPlanCreated,
}: FinancingCalculatorProps) {
  const componentId = useId();
  const [isOpen, setIsOpen] = useState(Boolean(projectName || defaultPrice > 0));

  // Matched initial plan
  const initialPlan = useMemo(() => {
    return findFinancingPlan(projectName);
  }, [projectName]);

  const [selectedPlanName, setSelectedPlanName] = useState<string>(
    initialPlan?.name ?? "San Pablo 1"
  );

  // Sync plan if projectName changes
  useEffect(() => {
    if (projectName) {
      const match = findFinancingPlan(projectName);
      if (match) {
        setSelectedPlanName(match.name);
        setIsOpen(true);
      }
    }
  }, [projectName]);

  const activePlan: FinancingPlan | undefined = useMemo(() => {
    return (
      FINANCING_PLANS.find((p) => p.name === selectedPlanName) ??
      initialPlan ??
      FINANCING_PLANS[0]
    );
  }, [selectedPlanName, initialPlan]);

  const [priceInput, setPriceInput] = useState<string>(
    defaultPrice > 0 ? String(defaultPrice) : ""
  );
  const [currency, setCurrency] = useState<"USD" | "ARS">(defaultCurrency);
  const [discount, setDiscount] = useState<boolean>(false);
  const [exchangeInput, setExchangeInput] = useState<string>("1400");
  const [advanceInput, setAdvanceInput] = useState<string>("");
  const [mode, setMode] = useState<"fixed" | "cac" | "stepped">("fixed");
  const [monthsInput, setMonthsInput] = useState<string>("36");
  const [cacBaseInput, setCacBaseInput] = useState<string>("");
  const [cacDueInput, setCacDueInput] = useState<string>("");

  // Sync default price if it changes from props
  useEffect(() => {
    if (defaultPrice > 0) {
      setPriceInput(String(defaultPrice));
    }
  }, [defaultPrice]);

  const isRental = activePlan?.stage === "alquiler";
  const numericPrice = parseFloat(priceInput) || 0;
  const numericExchange = parseFloat(exchangeInput) || 0;
  const numericAdvance = advanceInput.trim() !== "" ? parseFloat(advanceInput) : undefined;
  const numericMonths = parseInt(monthsInput, 10) || 0;
  const numericCacBase = parseFloat(cacBaseInput) || 0;
  const numericCacDue = parseFloat(cacDueInput) || 0;

  // Maximum months allowed in plan
  const maxMonths = useMemo(() => {
    if (!activePlan) return 48;
    if (mode === "fixed") {
      const fixedMax = Math.max(...activePlan.fixed.map((f) => f.max), 12);
      return fixedMax;
    }
    if (mode === "cac" && activePlan.cacMax) {
      return activePlan.cacMax;
    }
    return 48;
  }, [activePlan, mode]);

  // Adjust months if exceeding max
  useEffect(() => {
    if (numericMonths > maxMonths) {
      setMonthsInput(String(maxMonths));
    }
  }, [maxMonths, numericMonths]);

  // Summary calculation
  const summary = useMemo(() => {
    if (!activePlan || numericPrice <= 0) return null;
    return financingSummary(
      activePlan,
      numericPrice,
      discount,
      currency,
      numericExchange,
      numericAdvance
    );
  }, [activePlan, numericPrice, discount, currency, numericExchange, numericAdvance]);

  // Interest rate for fixed mode
  const monthlyRate = useMemo(() => {
    if (!activePlan || mode !== "fixed") return 0;
    const tier = activePlan.fixed.find((f) => numericMonths <= f.max);
    return tier?.rate ?? activePlan.fixed[activePlan.fixed.length - 1]?.rate ?? 4;
  }, [activePlan, mode, numericMonths]);

  // Fixed payments
  const fixedCalc = useMemo(() => {
    if (mode !== "fixed" || !summary?.valid || summary.balance === null) return null;
    return fixedPayment(summary.balance, numericMonths, monthlyRate);
  }, [mode, summary, numericMonths, monthlyRate]);

  // CAC payment
  const cacPaymentResult = useMemo(() => {
    if (
      mode !== "cac" ||
      !summary?.valid ||
      summary.balance === null ||
      numericCacBase <= 0 ||
      numericCacDue <= 0
    ) {
      return null;
    }
    return cacPayment(summary.balance, numericMonths, numericCacBase, numericCacDue);
  }, [mode, summary, numericMonths, numericCacBase, numericCacDue]);

  // Confirmation modal state for creating payment agreement
  const [isConfirmModalOpen, setIsConfirmModalOpen] = useState(false);
  const [confirmDueDay, setConfirmDueDay] = useState<number>(10);
  const [confirmStartDate, setConfirmStartDate] = useState<string>(getTodayDateString());
  const [confirmNotes, setConfirmNotes] = useState<string>("");
  const [isCreatingPlan, setIsCreatingPlan] = useState(false);

  const handleConfirmCreatePlan = (e: React.FormEvent) => {
    e.preventDefault();
    if (!leadId) {
      toast.error("No se encontró un lead activo para vincular el plan de pago.");
      return;
    }
    if (!summary?.valid || summary.balance === null) {
      toast.error("La financiación no es válida o no cubre el anticipo mínimo.");
      return;
    }

    setIsCreatingPlan(true);

    try {
      const allAgreements = loadPaymentAgreementList(samplePaymentAgreements, companyId);
      const allInstallments = loadInstallmentList(sampleInstallments, companyId);

      const finalTotalPrice = summary.net;
      const finalDownPayment = summary.initial ?? 0;
      const finalFinancedBalance = summary.balance;

      const modalityMap: Record<string, "FIXED" | "CAC" | "STEPPED"> = {
        fixed: "FIXED",
        cac: "CAC",
        stepped: "STEPPED",
      };

      const result = createAgreementWithInstallments(
        {
          leadId,
          advisorId: advisorId || "usr-sales",
          projectName: selectedPlanName || projectName || "Financiación Bellomo",
          propertyTitle: propertyTitle || undefined,
          currency,
          modality: modalityMap[mode] || "FIXED",
          totalPrice: finalTotalPrice,
          downPayment: finalDownPayment,
          financedBalance: finalFinancedBalance,
          totalInstallments: numericMonths,
          dayOfMonthDue: confirmDueDay,
          startDate: confirmStartDate,
          notes: confirmNotes
            ? `Plan desde calculadora: ${confirmNotes}`
            : `Plan comercial generado desde el simulador (${selectedPlanName})`,
        },
        allAgreements,
        allInstallments,
        companyId
      );

      if (typeof window !== "undefined") {
        window.dispatchEvent(new Event("everprop_agreements_updated"));
        try {
          const channel = new BroadcastChannel("everprop_agreements");
          channel.postMessage({ type: "AGREEMENT_CREATED", agreementId: result.agreement.id });
          channel.close();
        } catch {
          // ignore
        }
      }

      onPlanCreated?.();
      toast.success(
        `Plan ${result.agreement.publicId} creado exitosamente con ${numericMonths} cuotas`
      );
      setIsConfirmModalOpen(false);
    } catch (err: any) {
      console.error("Error al crear plan de pago:", err);
      toast.error("Error al generar el plan de pago.");
    } finally {
      setIsCreatingPlan(false);
    }
  };

  return (
    <div
      className={cn(
        "rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm transition-all",
        className
      )}
    >
      {/* Header Button */}
      <button
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        aria-expanded={isOpen}
        aria-controls={`${componentId}-body`}
        className="w-full flex items-center justify-between p-4 sm:p-5 text-left hover:bg-slate-50/50 dark:hover:bg-slate-800/40 rounded-2xl transition-colors cursor-pointer"
      >
        <div className="flex items-center gap-3 min-w-0">
          <div className="size-9 rounded-xl bg-blue-50 dark:bg-blue-950/60 border border-blue-200 dark:border-blue-900 flex items-center justify-center text-blue-600 dark:text-blue-400 shrink-0">
            <Calculator className="size-4" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100 tracking-tight">
                Simulador de Financiación Bellomo
              </h3>
              {activePlan && (
                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700">
                  {activePlan.name}
                </span>
              )}
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 truncate">
              {leadName ? `Simulación personalizada para ${leadName}` : "Condiciones oficiales según documento comercial"}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {isOpen ? (
            <ChevronUp className="size-4 text-slate-400" />
          ) : (
            <ChevronDown className="size-4 text-slate-400" />
          )}
        </div>
      </button>

      {/* Body */}
      {isOpen && (
        <div
          id={`${componentId}-body`}
          className="border-t border-slate-100 dark:border-slate-800 p-4 sm:p-5 space-y-5"
        >
          {/* Row 1: Plan selector & Stage */}
          <div className="grid grid-cols-1 sm:grid-cols-12 gap-3 items-end">
            <div className="sm:col-span-8">
              <label
                htmlFor={`${componentId}-plan`}
                className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1"
              >
                Plan / Desarrollo comercial
              </label>
              <select
                id={`${componentId}-plan`}
                value={selectedPlanName}
                onChange={(e) => setSelectedPlanName(e.target.value)}
                className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-xs font-semibold text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500 cursor-pointer"
              >
                {FINANCING_PLANS.map((plan) => (
                  <option key={plan.name} value={plan.name}>
                    {plan.name} ({plan.stage.toUpperCase()})
                  </option>
                ))}
              </select>
            </div>

            <div className="sm:col-span-4">
              <div className="rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50 p-2 text-center">
                <span className="block text-[10px] uppercase font-bold text-slate-400">Etapa</span>
                <span className="text-xs font-bold text-blue-700 dark:text-blue-300 uppercase">
                  {activePlan?.stage === "preventa"
                    ? "Preventa (Posesión 48-60m)"
                    : activePlan?.stage === "alquiler"
                    ? "Alquiler Comercial"
                    : "Venta Consolidada"}
                </span>
              </div>
            </div>
          </div>

          {/* Row 2: Price, Currency & Discount */}
          <div className="grid grid-cols-1 sm:grid-cols-12 gap-3">
            <div className="sm:col-span-6">
              <label
                htmlFor={`${componentId}-price`}
                className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1"
              >
                {isRental ? "Alquiler mensual de lista" : "Precio de lista"}
              </label>
              <input
                id={`${componentId}-price`}
                type="number"
                min="0"
                step="any"
                value={priceInput}
                onChange={(e) => setPriceInput(e.target.value)}
                placeholder="Ej. 19428"
                className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-xs font-semibold text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div className="sm:col-span-3">
              <label
                htmlFor={`${componentId}-currency`}
                className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1"
              >
                Moneda
              </label>
              <select
                id={`${componentId}-currency`}
                value={currency}
                onChange={(e) => setCurrency(e.target.value as "USD" | "ARS")}
                className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-xs font-semibold text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500 cursor-pointer"
              >
                <option value="USD">USD (Dólares)</option>
                <option value="ARS">ARS (Pesos)</option>
              </select>
            </div>

            <div className="sm:col-span-3 flex items-end pb-1">
              <label className="flex items-center gap-2 text-xs font-semibold text-slate-700 dark:text-slate-300 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={discount}
                  onChange={(e) => setDiscount(e.target.checked)}
                  className="size-4 rounded border-slate-300 dark:border-slate-700 text-blue-600 focus:ring-blue-500 accent-blue-600"
                />
                <span>-10% Aniversario</span>
              </label>
            </div>
          </div>

          {/* If Plan requires ARS minimum conversion for USD price */}
          {currency === "USD" && activePlan && "ars" in activePlan.minimum && (
            <div className="p-3 rounded-xl border border-blue-100 dark:border-blue-900/60 bg-blue-50/50 dark:bg-blue-950/20 text-xs space-y-1.5">
              <div className="flex items-center justify-between gap-3">
                <span className="font-bold text-blue-900 dark:text-blue-300">
                  Entrega mínima en pesos: {fmt(activePlan.minimum.ars, "ARS")}
                </span>
                <div className="flex items-center gap-2">
                  <span className="text-slate-500 dark:text-slate-400">TC Acordado:</span>
                  <input
                    type="number"
                    value={exchangeInput}
                    onChange={(e) => setExchangeInput(e.target.value)}
                    className="w-24 rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 py-1 text-xs font-bold text-slate-900 dark:text-slate-100"
                    placeholder="1400"
                  />
                </div>
              </div>
            </div>
          )}

          {/* Row 3: Advance payment, Mode, and Installments */}
          {!isRental && (
            <div className="grid grid-cols-1 sm:grid-cols-12 gap-3">
              {/* Advance Input */}
              <div className="sm:col-span-4">
                <label
                  htmlFor={`${componentId}-advance`}
                  className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1"
                >
                  Entrega inicial ({currency})
                </label>
                <input
                  id={`${componentId}-advance`}
                  type="number"
                  min="0"
                  step="any"
                  value={advanceInput}
                  onChange={(e) => setAdvanceInput(e.target.value)}
                  placeholder={
                    summary?.minimum != null
                      ? `Mín: ${fmt(summary.minimum, currency)}`
                      : "Mínimo del plan"
                  }
                  className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-xs font-semibold text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <span className="block text-[10px] text-slate-500 dark:text-slate-400 mt-1">
                  {activePlan && "percent" in activePlan.minimum
                    ? `Mínimo: ${activePlan.minimum.percent}% del valor`
                    : "Mínimo fijado por desarrollo"}
                </span>
              </div>

              {/* Mode */}
              <div className="sm:col-span-4">
                <label
                  htmlFor={`${componentId}-mode`}
                  className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1"
                >
                  Modalidad de pago
                </label>
                <select
                  id={`${componentId}-mode`}
                  value={mode}
                  onChange={(e) => setMode(e.target.value as "fixed" | "cac" | "stepped")}
                  className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-xs font-semibold text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500 cursor-pointer"
                >
                  <option value="fixed">Cuotas fijas (Tasa mensual)</option>
                  {activePlan?.cacMax && <option value="cac">Ajuste por CAC (Hasta {activePlan.cacMax} cuotas)</option>}
                  {activePlan?.stepped && <option value="stepped">Escalonado anual (300 m²)</option>}
                </select>
                <span className="block text-[10px] text-slate-500 dark:text-slate-400 mt-1">
                  Reserva informada: {activePlan?.reserve ?? "No informada"}
                </span>
              </div>

              {/* Installments count */}
              <div className="sm:col-span-4">
                <label
                  htmlFor={`${componentId}-months`}
                  className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1"
                >
                  Plazo en cuotas (Máx. {maxMonths})
                </label>
                <input
                  id={`${componentId}-months`}
                  type="number"
                  min="1"
                  max={maxMonths}
                  step="1"
                  value={monthsInput}
                  onChange={(e) => setMonthsInput(e.target.value)}
                  className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-xs font-semibold text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                {mode === "fixed" && (
                  <span className="block text-[10px] text-blue-600 dark:text-blue-400 font-semibold mt-1">
                    Tasa mensual aplicada: {monthlyRate}%
                  </span>
                )}
              </div>
            </div>
          )}

          {/* CAC Inputs if Mode === 'cac' */}
          {mode === "cac" && !isRental && (
            <div className="p-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/40 grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label
                  htmlFor={`${componentId}-cac-base`}
                  className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1"
                >
                  Índice CAC base (compra)
                </label>
                <input
                  id={`${componentId}-cac-base`}
                  type="number"
                  min="0.01"
                  step="any"
                  value={cacBaseInput}
                  onChange={(e) => setCacBaseInput(e.target.value)}
                  placeholder="Ej. 1000.50"
                  className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-xs font-semibold"
                />
              </div>
              <div>
                <label
                  htmlFor={`${componentId}-cac-due`}
                  className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1"
                >
                  Índice CAC al vencimiento
                </label>
                <input
                  id={`${componentId}-cac-due`}
                  type="number"
                  min="0.01"
                  step="any"
                  value={cacDueInput}
                  onChange={(e) => setCacDueInput(e.target.value)}
                  placeholder="Ej. 1045.20"
                  className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-xs font-semibold"
                />
              </div>
            </div>
          )}

          {/* Results Summary Box */}
          {summary && summary.valid ? (
            <div className="space-y-3">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-800">
                  <span className="block text-[10px] uppercase font-bold text-slate-400">Precio Lista</span>
                  <span className="text-xs font-bold text-slate-900 dark:text-slate-100">
                    {fmt(numericPrice, currency)}
                  </span>
                  {discount && (
                    <span className="block text-[10px] text-emerald-600 dark:text-emerald-400 font-bold">
                      -10% ({fmt(summary.discountAmount, currency)})
                    </span>
                  )}
                </div>

                <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-800">
                  <span className="block text-[10px] uppercase font-bold text-slate-400">Precio Final</span>
                  <span className="text-xs font-bold text-slate-900 dark:text-slate-100">
                    {fmt(summary.net, currency)}
                  </span>
                </div>

                <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-800">
                  <span className="block text-[10px] uppercase font-bold text-slate-400">Entrega Inicial</span>
                  <span className="text-xs font-bold text-slate-900 dark:text-slate-100">
                    {fmt(summary.initial ?? 0, currency)}
                  </span>
                </div>

                <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-800">
                  <span className="block text-[10px] uppercase font-bold text-slate-400">Saldo a Financiar</span>
                  <span className="text-xs font-bold text-slate-900 dark:text-slate-100">
                    {fmt(summary.balance ?? 0, currency)}
                  </span>
                </div>
              </div>

              {/* Main Installment Banner */}
              {mode === "fixed" && fixedCalc && (
                <div className="rounded-xl bg-slate-900 dark:bg-slate-800 text-white p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                  <div>
                    <span className="block text-xs uppercase font-bold text-slate-400 tracking-wider">
                      Cuota Mensual Estimada ({numericMonths} cuotas fijas)
                    </span>
                    <span className="text-2xl sm:text-3xl font-black tracking-tight text-white">
                      {fmt(fixedCalc.monthly, currency)}
                    </span>
                    <span className="block text-xs text-slate-400 mt-0.5">
                      Tasa fija {monthlyRate}% mensual sobre capital inicial
                    </span>
                  </div>

                  <div className="sm:text-right border-t sm:border-t-0 sm:border-l border-slate-700 sm:pl-4 pt-3 sm:pt-0 space-y-0.5">
                    <div className="text-xs text-slate-300">
                      Intereses totales: <strong className="text-white">{fmt(fixedCalc.interest, currency)}</strong>
                    </div>
                    <div className="text-xs text-slate-300">
                      Total con entrega: <strong className="text-white">{fmt((summary.initial ?? 0) + fixedCalc.total, currency)}</strong>
                    </div>
                  </div>
                </div>
              )}

              {mode === "cac" && (
                <div className="rounded-xl bg-slate-900 dark:bg-slate-800 text-white p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                  <div>
                    <span className="block text-xs uppercase font-bold text-slate-400 tracking-wider">
                      Cuota Base (Antes de ajuste CAC)
                    </span>
                    <span className="text-2xl sm:text-3xl font-black tracking-tight text-white">
                      {summary.balance ? fmt(summary.balance / numericMonths, currency) : "-"}
                    </span>
                    {cacPaymentResult !== null && (
                      <span className="block text-xs text-blue-300 mt-1 font-bold">
                        Cuota ajustada según índices: {fmt(cacPaymentResult, currency)}
                      </span>
                    )}
                  </div>

                  <div className="sm:text-right border-t sm:border-t-0 sm:border-l border-slate-700 sm:pl-4 pt-3 sm:pt-0 text-xs text-slate-300">
                    Ajuste mensual directo: Saldo ÷ cuotas × (CAC vencimiento ÷ CAC base).
                  </div>
                </div>
              )}

              {mode === "stepped" && (
                <div className="rounded-xl border border-amber-200 dark:border-amber-800/60 bg-amber-50 dark:bg-amber-950/30 p-4 text-xs text-amber-900 dark:text-amber-200">
                  El plan escalonado aplica a lotes de 300 m² en 72 cuotas. Solicitar escala anual vigente a gerencia comercial.
                </div>
              )}

              {/* Botón: Crear plan de pago con esta financiación */}
              <div className="pt-2">
                <button
                  type="button"
                  onClick={() => setIsConfirmModalOpen(true)}
                  className="w-full flex items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-xs font-bold text-white shadow-sm hover:bg-blue-700 transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 cursor-pointer"
                >
                  <ReceiptText className="size-4" />
                  <span>Crear plan de pago con esta financiación</span>
                </button>
                <p className="text-[11px] text-slate-500 dark:text-slate-400 text-center mt-1.5">
                  {leadName
                    ? `Genera el contrato comercial y el cronograma de ${numericMonths} cuotas para ${leadName}.`
                    : `Genera el contrato y el cronograma de ${numericMonths} cuotas a pagar.`}
                </p>
              </div>
            </div>
          ) : (
            numericPrice > 0 && (
              <div className="rounded-xl border border-amber-200 dark:border-amber-800/60 bg-amber-50 dark:bg-amber-950/30 p-3.5 text-xs text-amber-900 dark:text-amber-200 flex items-start gap-2.5">
                <AlertCircle className="size-4 shrink-0 text-amber-600 mt-0.5" />
                <div>
                  <p className="font-bold">La entrega ingresada no cubre el mínimo requerido por el plan.</p>
                  <p className="mt-0.5 text-[11px] opacity-90">
                    {summary?.minimum != null
                      ? `La entrega mínima requerida para este lote es de ${fmt(summary.minimum, currency)}.`
                      : "Completá la cotización para calcular el valor de entrega mínima."}
                  </p>
                </div>
              </div>
            )
          )}

          {/* Rental summary */}
          {isRental && numericPrice > 0 && (
            <div className="rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 p-4 text-xs space-y-1.5">
              <p className="font-bold text-slate-800 dark:text-slate-200">
                Condiciones de locación comercial:
              </p>
              <p className="text-slate-600 dark:text-slate-400">
                Contrato de {activePlan?.rentalYears?.join(" o ")} años. Ingreso inicial: 1 mes de comisión inmobiliaria + 1 mes de depósito/adelanto. Actualización cuatrimestral.
              </p>
              {discount && (
                <p className="text-emerald-600 dark:text-emerald-400 font-bold">
                  Alquiler bonificado: {fmt(numericPrice * 0.9, currency)} mensual.
                </p>
              )}
            </div>
          )}

          {/* Footer disclaimer */}
          <div className="pt-1 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between text-[10px] text-slate-400">
            <span>Fuente: Condiciones oficiales de Financiación Bellomo.</span>
            <span>Simulación orientativa de trabajo.</span>
          </div>
        </div>
      )}

      {/* Modal de Confirmación para Crear Plan de Pago */}
      {isConfirmModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 backdrop-blur-sm p-4">
          <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-xl dark:border-slate-800 dark:bg-slate-900">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3 dark:border-slate-800">
              <div className="flex items-center gap-2">
                <ReceiptText className="size-5 text-blue-600 dark:text-blue-400" />
                <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">
                  Confirmar Plan de Pago
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setIsConfirmModalOpen(false)}
                className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                <X className="size-4" />
              </button>
            </div>

            <form onSubmit={handleConfirmCreatePlan} className="mt-4 space-y-3.5 text-xs">
              {/* Resumen de la financiación simulada */}
              <div className="rounded-xl bg-slate-50 p-3.5 dark:bg-slate-950 border border-slate-200/80 dark:border-slate-800 space-y-1.5">
                <div className="flex justify-between">
                  <span className="text-slate-500 dark:text-slate-400">Cliente:</span>
                  <strong className="text-slate-900 dark:text-slate-100">{leadName || "Cliente actual"}</strong>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500 dark:text-slate-400">Desarrollo:</span>
                  <strong className="text-slate-900 dark:text-slate-100">
                    {selectedPlanName} {propertyTitle ? `(${propertyTitle})` : ""}
                  </strong>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500 dark:text-slate-400">Precio Total:</span>
                  <strong className="text-slate-900 dark:text-slate-100">
                    {fmt(summary?.net ?? numericPrice, currency)}
                  </strong>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500 dark:text-slate-400">Anticipo Pactado:</span>
                  <strong className="text-slate-900 dark:text-slate-100">
                    {fmt(summary?.initial ?? 0, currency)}
                  </strong>
                </div>
                <div className="flex justify-between border-t border-slate-200 dark:border-slate-800 pt-1.5">
                  <span className="text-slate-700 dark:text-slate-300 font-bold">Saldo Financiado:</span>
                  <strong className="text-blue-600 dark:text-blue-400 font-extrabold">
                    {fmt(summary?.balance ?? 0, currency)}
                  </strong>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500 dark:text-slate-400">Modalidad & Plazo:</span>
                  <span className="font-semibold text-slate-800 dark:text-slate-200">
                    {mode === "fixed" ? `Fija (${monthlyRate}% mens.)` : mode === "cac" ? "Ajustable CAC" : "Escalonado"} · {numericMonths} cuotas
                  </span>
                </div>
                {mode === "fixed" && fixedCalc && (
                  <div className="flex justify-between bg-blue-50 dark:bg-blue-950/40 p-2 rounded-lg mt-1 text-blue-900 dark:text-blue-200">
                    <span className="font-bold">Cuota Mensual:</span>
                    <span className="font-extrabold">{fmt(fixedCalc.monthly, currency)} / mes</span>
                  </div>
                )}
              </div>

              {/* Parámetros operativos */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-semibold text-slate-700 dark:text-slate-300">
                    Día de Vencimiento
                  </label>
                  <select
                    value={confirmDueDay}
                    onChange={(e) => setConfirmDueDay(Number(e.target.value))}
                    className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-200 font-semibold"
                  >
                    {[5, 10, 15, 20, 25].map((d) => (
                      <option key={d} value={d}>
                        Día {d} de cada mes
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="font-semibold text-slate-700 dark:text-slate-300">
                    Fecha de Inicio
                  </label>
                  <input
                    type="date"
                    value={confirmStartDate}
                    onChange={(e) => setConfirmStartDate(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-100"
                  />
                </div>
              </div>

              <div>
                <label className="font-semibold text-slate-700 dark:text-slate-300">
                  Notas adicionales (opcional)
                </label>
                <input
                  type="text"
                  placeholder="ej. Se pactó anticipo en 2 partes"
                  value={confirmNotes}
                  onChange={(e) => setConfirmNotes(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-100"
                />
              </div>

              <div className="mt-5 flex justify-end gap-2 pt-3 border-t border-slate-100 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsConfirmModalOpen(false)}
                  className="rounded-lg border border-slate-200 px-3.5 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50 dark:border-slate-800 dark:text-slate-300 dark:hover:bg-slate-800"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isCreatingPlan}
                  className="flex items-center gap-1.5 rounded-lg bg-blue-600 px-4 py-2 text-xs font-bold text-white shadow-sm hover:bg-blue-700 disabled:opacity-50"
                >
                  <Check className="size-3.5" />
                  <span>{isCreatingPlan ? "Creando..." : "Confirmar y Generar Plan"}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
