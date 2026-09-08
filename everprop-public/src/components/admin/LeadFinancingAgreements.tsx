"use client";

import { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import {
  type PaymentAgreement,
  type Installment,
  type InstallmentPaymentMethod,
  samplePaymentAgreements,
  sampleInstallments,
} from "@/data/admin-sample";
import {
  loadPaymentAgreementList,
  loadInstallmentList,
  recordInstallmentPayment,
  createAgreementWithInstallments,
  evaluateInstallmentsAndNotify,
} from "@/lib/admin-storage";
import {
  formatInstallmentAmount,
  formatDueDate,
  buildWhatsAppReminderUrl,
  evaluateInstallmentStatus,
  getTodayDateString,
} from "@/lib/installment-notifications";
import { toast } from "sonner";
import {
  AlertCircle,
  Calendar,
  CheckCircle2,
  Clock,
  CreditCard,
  MessageCircle,
  Plus,
  ReceiptText,
  X,
  Check,
  ArrowUpRight,
} from "lucide-react";
import { Button } from "@/components/ui/button";

interface LeadFinancingAgreementsProps {
  leadId: string;
  leadName: string;
  leadPhone?: string;
  companyId?: string;
  advisorId?: string;
}

export function LeadFinancingAgreements({
  leadId,
  leadName,
  leadPhone,
  companyId = "c1",
  advisorId = "usr-sales",
}: LeadFinancingAgreementsProps) {
  const [agreements, setAgreements] = useState<PaymentAgreement[]>([]);
  const [installments, setInstallments] = useState<Installment[]>([]);
  const [isNewPlanModalOpen, setIsNewPlanModalOpen] = useState(false);
  const [payingInstallment, setPayingInstallment] = useState<Installment | null>(null);

  // Payment form state
  const [paymentAmount, setPaymentAmount] = useState<number>(0);
  const [paymentMethod, setPaymentMethod] = useState<InstallmentPaymentMethod>("TRANSFER");
  const [paymentReceipt, setPaymentReceipt] = useState("");
  const [paymentNotes, setPaymentNotes] = useState("");

  // New plan form state
  const [projectName, setProjectName] = useState("San Pablo 1");
  const [propertyTitle, setPropertyTitle] = useState("");
  const [currency, setCurrency] = useState<"ARS" | "USD">("ARS");
  const [modality, setModality] = useState<"FIXED" | "CAC" | "STEPPED">("FIXED");
  const [totalPrice, setTotalPrice] = useState<number>(18000000);
  const [downPayment, setDownPayment] = useState<number>(7200000);
  const [totalInstallments, setTotalInstallments] = useState<number>(36);
  const [dueDay, setDueDay] = useState<number>(10);
  const [startDate, setStartDate] = useState(getTodayDateString());
  const [notes, setNotes] = useState("");

  const refreshData = () => {
    const loadedAgr = loadPaymentAgreementList(samplePaymentAgreements, companyId);
    const loadedInst = loadInstallmentList(sampleInstallments, companyId);
    setAgreements(loadedAgr.filter((a) => a.leadId === leadId));
    setInstallments(loadedInst.filter((i) => i.leadId === leadId));
  };

  useEffect(() => {
    refreshData();
    window.addEventListener("everprop_agreements_updated", refreshData);
    return () => {
      window.removeEventListener("everprop_agreements_updated", refreshData);
    };
  }, [leadId, companyId]);

  // Lead agreements and installments
  const leadAgreements = useMemo(() => {
    return agreements.filter((a) => a.leadId === leadId);
  }, [agreements, leadId]);

  const leadInstallments = useMemo(() => {
    return installments
      .filter((i) => i.leadId === leadId)
      .sort((a, b) => a.installmentNumber - b.installmentNumber);
  }, [installments, leadId]);

  // Overdue status check
  const overdueInstallments = useMemo(() => {
    const todayStr = getTodayDateString();
    return leadInstallments.filter((inst) => {
      const { status } = evaluateInstallmentStatus(inst, todayStr);
      return status === "OVERDUE";
    });
  }, [leadInstallments]);

  const handleOpenPayment = (inst: Installment) => {
    setPayingInstallment(inst);
    setPaymentAmount(inst.amountExpected);
    setPaymentMethod("TRANSFER");
    setPaymentReceipt(`TRF-${Math.floor(100000 + Math.random() * 900000)}`);
    setPaymentNotes("");
  };

  const handleConfirmPayment = () => {
    if (!payingInstallment) return;
    const allStoredInst = loadInstallmentList(sampleInstallments, companyId);

    const updated = recordInstallmentPayment(
      payingInstallment.id,
      {
        amountPaid: paymentAmount,
        paymentMethod,
        paymentReceiptNumber: paymentReceipt || "S/N",
        notes: paymentNotes || undefined,
        paidAt: getTodayDateString(),
      },
      allStoredInst,
      companyId
    );

    setInstallments(updated.filter((i) => i.leadId === leadId));
    toast.success("Cobro imputado correctamente");
    setPayingInstallment(null);
  };

  const handleCreatePlan = (e: React.FormEvent) => {
    e.preventDefault();
    const financed = Math.max(0, totalPrice - downPayment);
    const allAgreements = loadPaymentAgreementList(samplePaymentAgreements, companyId);
    const allInstallments = loadInstallmentList(sampleInstallments, companyId);

    const result = createAgreementWithInstallments(
      {
        leadId,
        advisorId,
        projectName,
        propertyTitle: propertyTitle || undefined,
        currency,
        modality,
        totalPrice,
        downPayment,
        financedBalance: financed,
        totalInstallments,
        dayOfMonthDue: dueDay,
        startDate,
        notes: notes || undefined,
      },
      allAgreements,
      allInstallments,
      companyId
    );

    setAgreements((prev) => [result.agreement, ...prev]);
    setInstallments(result.installments.filter((i) => i.leadId === leadId));
    setIsNewPlanModalOpen(false);
    toast.success(`Plan de cuotas creado con éxito (${totalInstallments} cuotas)`);
  };

  return (
    <section
      className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 shadow-sm sm:p-6"
      aria-labelledby="financing-agreements-title"
    >
      <div className="flex flex-col gap-3 border-b border-slate-200 dark:border-slate-800 pb-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-xs font-bold uppercase tracking-wider text-blue-700 dark:text-blue-400">
            Acuerdos Financieros
          </p>
          <h2
            id="financing-agreements-title"
            className="mt-1 text-lg font-bold tracking-tight text-slate-950 dark:text-slate-100"
          >
            Financiación & Seguimiento de Cuotas
          </h2>
          <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
            Planes de pago asociados al cliente, independientes de las propiedades consultadas.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Link
            href={`/admin/cobranzas?search=${encodeURIComponent(leadName)}`}
            className="flex items-center gap-1 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-800 dark:text-slate-300 dark:hover:bg-slate-800"
          >
            <span>Ver en Cobranzas</span>
            <ArrowUpRight className="size-3.5" />
          </Link>

          <Button
            onClick={() => setIsNewPlanModalOpen(true)}
            className="h-8 gap-1.5 bg-blue-600 px-3 text-xs font-semibold text-white hover:bg-blue-700 shadow-sm"
          >
            <Plus className="size-3.5" />
            <span>Crear Plan de Cuotas</span>
          </Button>
        </div>
      </div>

      {/* Mora Alert Banner if customer has debt */}
      {overdueInstallments.length > 0 && (
        <div className="mt-4 flex items-center justify-between rounded-xl border border-rose-200 bg-rose-50/70 p-3.5 text-xs dark:border-rose-900/50 dark:bg-rose-950/20">
          <div className="flex items-center gap-2.5 text-rose-800 dark:text-rose-200">
            <AlertCircle className="size-4 shrink-0 text-rose-600 dark:text-rose-400" />
            <span>
              <strong>Atención:</strong> El cliente posee{" "}
              <strong>{overdueInstallments.length} cuota(s) en mora</strong> por un total de{" "}
              <strong>
                {formatInstallmentAmount(
                  overdueInstallments.reduce((acc, curr) => acc + curr.amountExpected, 0),
                  overdueInstallments[0]?.currency
                )}
              </strong>
              .
            </span>
          </div>
          <Link
            href={`/admin/cobranzas?status=overdue&search=${encodeURIComponent(leadName)}`}
            className="font-bold text-rose-700 hover:underline dark:text-rose-300"
          >
            Gestionar mora →
          </Link>
        </div>
      )}

      {/* Main Content */}
      {leadAgreements.length === 0 ? (
        <div className="mt-5 flex min-h-40 flex-col items-center justify-center rounded-2xl border-2 border-dashed border-slate-300 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/40 p-6 text-center">
          <ReceiptText className="size-8 text-slate-400" />
          <h3 className="mt-3 text-base font-bold text-slate-950 dark:text-slate-100">
            No hay planes de cuotas activos
          </h3>
          <p className="mt-1 max-w-md text-xs text-slate-500 dark:text-slate-400">
            Generá un cronograma de financiación acordado con el cliente fijando entrega, saldo y
            cantidad de cuotas.
          </p>
        </div>
      ) : (
        <div className="mt-5 space-y-6">
          {leadAgreements.map((agreement) => {
            const agreementInstallments = leadInstallments.filter(
              (i) => i.agreementId === agreement.id
            );
            const paidCount = agreementInstallments.filter((i) => i.status === "PAID").length;

            return (
              <div
                key={agreement.id}
                className="overflow-hidden rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50"
              >
                {/* Agreement Summary Header */}
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="rounded-md bg-blue-100 px-2 py-0.5 text-[10px] font-extrabold text-blue-800 dark:bg-blue-950 dark:text-blue-300">
                        {agreement.publicId}
                      </span>
                      <h4 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                        {agreement.projectName || "Plan de Financiación"}
                      </h4>
                      {agreement.propertyTitle && (
                        <span className="text-xs text-slate-500 dark:text-slate-400">
                          · {agreement.propertyTitle}
                        </span>
                      )}
                    </div>
                    <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                      Total:{" "}
                      <strong>
                        {formatInstallmentAmount(agreement.totalPrice, agreement.currency)}
                      </strong>{" "}
                      | Anticipo:{" "}
                      {formatInstallmentAmount(agreement.downPayment, agreement.currency)} | Saldo
                      Financiado:{" "}
                      {formatInstallmentAmount(agreement.financedBalance, agreement.currency)} (
                      {agreement.totalInstallments} cuotas)
                    </p>
                  </div>

                  <div className="flex items-center gap-2">
                    <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-bold text-slate-700 dark:bg-slate-800 dark:text-slate-300">
                      {paidCount} de {agreement.totalInstallments} abonadas
                    </span>
                  </div>
                </div>

                {/* Installments Table */}
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="border-b border-slate-200 bg-slate-100/80 font-bold text-slate-600 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-400">
                      <tr>
                        <th className="px-4 py-2.5">Cuota</th>
                        <th className="px-4 py-2.5">Vencimiento</th>
                        <th className="px-4 py-2.5">Estado</th>
                        <th className="px-4 py-2.5">Importe</th>
                        <th className="px-4 py-2.5 text-right">Acciones</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                      {agreementInstallments.map((inst) => {
                        const statusInfo = evaluateInstallmentStatus(inst);
                        const whatsappUrl = leadPhone
                          ? buildWhatsAppReminderUrl(leadPhone, { name: leadName }, agreement, inst)
                          : null;

                        return (
                          <tr
                            key={inst.id}
                            className="transition-colors hover:bg-slate-50/80 dark:hover:bg-slate-800/40"
                          >
                            <td className="px-4 py-3 font-bold text-slate-900 dark:text-slate-100">
                              Cuota {inst.installmentNumber}
                            </td>
                            <td className="px-4 py-3 text-slate-600 dark:text-slate-400">
                              {formatDueDate(inst.dueDate)}
                            </td>
                            <td className="px-4 py-3">
                              {statusInfo.status === "OVERDUE" && (
                                <span className="inline-flex items-center gap-1 rounded-full bg-rose-100 px-2 py-0.5 text-[10px] font-bold text-rose-800 dark:bg-rose-950 dark:text-rose-300">
                                  <AlertCircle className="size-3" />
                                  Vencida hace {statusInfo.daysOverdue}d
                                </span>
                              )}
                              {statusInfo.status === "DUE_TODAY" && (
                                <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-800 dark:bg-amber-950 dark:text-amber-300">
                                  <Calendar className="size-3" />
                                  Vence hoy
                                </span>
                              )}
                              {statusInfo.status === "PENDING" && (
                                <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                                  Al día
                                </span>
                              )}
                              {statusInfo.status === "PAID" && (
                                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
                                  <CheckCircle2 className="size-3" />
                                  Cobrada ({formatDueDate(inst.paidAt || inst.dueDate)})
                                </span>
                              )}
                            </td>
                            <td className="px-4 py-3 font-bold text-slate-900 dark:text-slate-100">
                              {formatInstallmentAmount(inst.amountExpected, inst.currency)}
                            </td>
                            <td className="px-4 py-3 text-right">
                              <div className="flex items-center justify-end gap-1.5">
                                {whatsappUrl && inst.status !== "PAID" && (
                                  <a
                                    href={whatsappUrl}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="flex items-center gap-1 rounded-lg bg-emerald-600 px-2 py-0.5 text-[11px] font-bold text-white hover:bg-emerald-700"
                                  >
                                    <MessageCircle className="size-3" />
                                    <span>WhatsApp</span>
                                  </a>
                                )}

                                {inst.status !== "PAID" ? (
                                  <button
                                    type="button"
                                    onClick={() => handleOpenPayment(inst)}
                                    className="flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2 py-0.5 text-[11px] font-bold text-slate-700 hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300"
                                  >
                                    <CreditCard className="size-3 text-blue-600" />
                                    <span>Cobrar</span>
                                  </button>
                                ) : (
                                  <span className="text-[11px] text-slate-400 font-medium">
                                    {inst.paymentReceiptNumber || "Acreditado"}
                                  </span>
                                )}
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Modal Registrar Cobro */}
      {payingInstallment && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 backdrop-blur-sm p-4">
          <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-xl dark:border-slate-800 dark:bg-slate-900">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3 dark:border-slate-800">
              <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">
                Registrar Cobro de Cuota {payingInstallment.installmentNumber}
              </h3>
              <button
                type="button"
                onClick={() => setPayingInstallment(null)}
                className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                <X className="size-4" />
              </button>
            </div>

            <div className="mt-4 space-y-3 text-xs">
              <div>
                <label className="font-semibold text-slate-700 dark:text-slate-300">
                  Monto Cobrado ({payingInstallment.currency})
                </label>
                <input
                  type="number"
                  value={paymentAmount}
                  onChange={(e) => setPaymentAmount(Number(e.target.value))}
                  className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 font-bold dark:border-slate-800 dark:bg-slate-950 dark:text-slate-100"
                />
              </div>

              <div>
                <label className="font-semibold text-slate-700 dark:text-slate-300">
                  Método de Pago
                </label>
                <select
                  value={paymentMethod}
                  onChange={(e) => setPaymentMethod(e.target.value as InstallmentPaymentMethod)}
                  className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-200"
                >
                  <option value="TRANSFER">Transferencia Bancaria</option>
                  <option value="CASH">Efectivo en Caja</option>
                  <option value="DEPOSIT">Depósito Bancario</option>
                  <option value="CHECK">Cheque</option>
                </select>
              </div>

              <div>
                <label className="font-semibold text-slate-700 dark:text-slate-300">
                  N° de Recibo / Referencia
                </label>
                <input
                  type="text"
                  value={paymentReceipt}
                  onChange={(e) => setPaymentReceipt(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-100"
                />
              </div>

              <div className="mt-6 flex justify-end gap-2 pt-3 border-t border-slate-100 dark:border-slate-800">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPayingInstallment(null)}
                  className="dark:border-slate-800 dark:text-slate-300"
                >
                  Cancelar
                </Button>
                <Button
                  size="sm"
                  onClick={handleConfirmPayment}
                  className="bg-blue-600 text-white hover:bg-blue-700"
                >
                  Confirmar Cobro
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal Nuevo Plan de Cuotas */}
      {isNewPlanModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 backdrop-blur-sm p-4">
          <div className="w-full max-w-lg rounded-2xl border border-slate-200 bg-white p-6 shadow-xl dark:border-slate-800 dark:bg-slate-900 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3 dark:border-slate-800">
              <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">
                Crear Plan de Cuotas para {leadName}
              </h3>
              <button
                type="button"
                onClick={() => setIsNewPlanModalOpen(false)}
                className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                <X className="size-4" />
              </button>
            </div>

            <form onSubmit={handleCreatePlan} className="mt-4 space-y-3.5 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-semibold text-slate-700 dark:text-slate-300">
                    Proyecto
                  </label>
                  <input
                    type="text"
                    value={projectName}
                    onChange={(e) => setProjectName(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-100"
                  />
                </div>
                <div>
                  <label className="font-semibold text-slate-700 dark:text-slate-300">
                    Lote / Inmueble
                  </label>
                  <input
                    type="text"
                    placeholder="ej. Lote 14 Mz B"
                    value={propertyTitle}
                    onChange={(e) => setPropertyTitle(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-100"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-semibold text-slate-700 dark:text-slate-300">Moneda</label>
                  <select
                    value={currency}
                    onChange={(e) => setCurrency(e.target.value as "ARS" | "USD")}
                    className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-200"
                  >
                    <option value="ARS">Pesos (ARS)</option>
                    <option value="USD">Dólares (USD)</option>
                  </select>
                </div>
                <div>
                  <label className="font-semibold text-slate-700 dark:text-slate-300">
                    Modalidad
                  </label>
                  <select
                    value={modality}
                    onChange={(e) =>
                      setModality(e.target.value as "FIXED" | "CAC" | "STEPPED")
                    }
                    className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-200"
                  >
                    <option value="FIXED">Cuotas Fijas</option>
                    <option value="CAC">Ajustable por CAC</option>
                    <option value="STEPPED">Escalonado</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-semibold text-slate-700 dark:text-slate-300">
                    Precio Total
                  </label>
                  <input
                    type="number"
                    value={totalPrice}
                    onChange={(e) => setTotalPrice(Number(e.target.value))}
                    className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 font-bold dark:border-slate-800 dark:bg-slate-950 dark:text-slate-100"
                  />
                </div>
                <div>
                  <label className="font-semibold text-slate-700 dark:text-slate-300">
                    Anticipo Entregado
                  </label>
                  <input
                    type="number"
                    value={downPayment}
                    onChange={(e) => setDownPayment(Number(e.target.value))}
                    className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 font-bold dark:border-slate-800 dark:bg-slate-950 dark:text-slate-100"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-semibold text-slate-700 dark:text-slate-300">
                    Cantidad de Cuotas
                  </label>
                  <select
                    value={totalInstallments}
                    onChange={(e) => setTotalInstallments(Number(e.target.value))}
                    className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-200"
                  >
                    <option value={12}>12 Cuotas</option>
                    <option value={24}>24 Cuotas</option>
                    <option value={36}>36 Cuotas</option>
                    <option value={48}>48 Cuotas</option>
                  </select>
                </div>
                <div>
                  <label className="font-semibold text-slate-700 dark:text-slate-300">
                    Día Vencimiento
                  </label>
                  <select
                    value={dueDay}
                    onChange={(e) => setDueDay(Number(e.target.value))}
                    className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-200"
                  >
                    {[5, 10, 15, 20, 25].map((d) => (
                      <option key={d} value={d}>
                        Día {d}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="rounded-lg bg-blue-50/70 p-3 text-xs text-blue-900 dark:bg-blue-950/40 dark:text-blue-200">
                Se generarán {totalInstallments} cuotas mensuales de{" "}
                <span className="font-extrabold">
                  {formatInstallmentAmount(
                    Math.round(
                      Math.max(0, totalPrice - downPayment) / Math.max(1, totalInstallments)
                    ),
                    currency
                  )}
                </span>
                .
              </div>

              <div className="mt-5 flex justify-end gap-2 pt-3 border-t border-slate-100 dark:border-slate-800">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setIsNewPlanModalOpen(false)}
                  className="dark:border-slate-800 dark:text-slate-300"
                >
                  Cancelar
                </Button>
                <Button
                  type="submit"
                  size="sm"
                  className="bg-blue-600 text-white hover:bg-blue-700"
                >
                  Generar Plan
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </section>
  );
}
