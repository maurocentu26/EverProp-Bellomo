"use client";
import { CollectionsLoading } from "@/components/admin/CollectionsLoading";
import { InstallmentPaymentHistory } from "@/components/admin/InstallmentPaymentHistory";
import { ExportLocalCollections } from "@/components/admin/ExportLocalCollections";
import { loadCollectionLeads } from "@/lib/collections-api";
import { loadLeadList } from "@/lib/admin-storage";

import { useState, useMemo, useEffect } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCurrentSession } from "@/hooks/use-current-session";
import adminSample, {
  type Installment,
  type Lead,
  type InstallmentPaymentMethod,
} from "@/data/admin-sample";
import {
  recordInstallmentPayment,
  createAgreementWithInstallments,
} from "@/lib/collections-api";
import { useCollections } from "@/hooks/use-collections";
import { useCollectionAction } from "@/hooks/use-collection-action";
import { isMockDataMode } from "@/lib/data-mode";
import {
  formatInstallmentAmount,
  formatDueDate,
  buildWhatsAppReminderUrl,
  evaluateInstallmentStatus,
  getTodayDateString,
} from "@/lib/installment-notifications";
import { isNotificationForUser } from "@/lib/notifications";
import { toast } from "sonner";
import {
  AlertCircle,
  Calendar,
  DollarSign,
  CheckCircle2,
  Clock,
  Plus,
  Search,
  ReceiptText,
  MessageCircle,
  ExternalLink,
  X,
  CreditCard,
  User,
  Building2,
  RotateCcw,
  Check,
} from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";

type FilterStatus = "all" | "overdue" | "dueToday" | "next7Days" | "paid";

export default function CobranzasPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const session = useCurrentSession();

  // State
  const [leads, setLeads] = useState<Lead[]>([]);
  const { agreements, installments, setInstallments, loading, error, refresh, canWrite } = useCollections();
  const { run, saving } = useCollectionAction();
  const [statusFilter, setStatusFilter] = useState<FilterStatus>(() => {
    const p = searchParams.get("status");
    if (p === "overdue" || p === "dueToday" || p === "next7Days" || p === "paid") {
      return p;
    }
    return "all";
  });
  const [searchQuery, setSearchQuery] = useState(() => searchParams.get("search") || "");
  const [selectedProject, setSelectedProject] = useState<string>("all");

  // Modals state
  const [payingInstallment, setPayingInstallment] = useState<Installment | null>(null);
  const [isNewAgreementModalOpen, setIsNewAgreementModalOpen] = useState(false);

  // Payment form state
  const [paymentAmount, setPaymentAmount] = useState<number>(0);
  const [paymentMethod, setPaymentMethod] = useState<InstallmentPaymentMethod>("TRANSFER");
  const [paymentReceipt, setPaymentReceipt] = useState("");
  const [paymentNotes, setPaymentNotes] = useState("");

  // New agreement form state
  const [newAgrLeadId, setNewAgrLeadId] = useState("");
  const [newAgrProjectName, setNewAgrProjectName] = useState("San Pablo 1");
  const [newAgrPropertyTitle, setNewAgrPropertyTitle] = useState("");
  const [newAgrCurrency, setNewAgrCurrency] = useState<"ARS" | "USD">("ARS");
  const [newAgrModality, setNewAgrModality] = useState<"FIXED" | "CAC" | "STEPPED">("FIXED");
  const [newAgrTotalPrice, setNewAgrTotalPrice] = useState<number>(15000000);
  const [newAgrDownPayment, setNewAgrDownPayment] = useState<number>(6000000);
  const [newAgrTotalInstallments, setNewAgrTotalInstallments] = useState<number>(36);
  const [newAgrDueDay, setNewAgrDueDay] = useState<number>(10);
  const [newAgrStartDate, setNewAgrStartDate] = useState(getTodayDateString());
  const [monthlyRatePct, setMonthlyRatePct] = useState(0);
  const [newAgrNotes, setNewAgrNotes] = useState("");

  const [leadsLoading, setLeadsLoading] = useState(true);
  const [leadsError, setLeadsError] = useState<string | null>(null);
  useEffect(() => {
    if (!session.user?.id) return;
    let active = true;
    const load = async () => {
      try {
        const rows = isMockDataMode ? loadLeadList(adminSample.leads, "c1") : await loadCollectionLeads();
        if (active) { setLeads(rows); setLeadsError(null); }
      } catch (reason) {
        if (active) { setLeads([]); setLeadsError(reason instanceof Error ? reason.message : "No se pudieron cargar los clientes."); }
      } finally {
        if (active) setLeadsLoading(false);
      }
    };
    void load();
    window.addEventListener("focus", load);
    return () => { active = false; window.removeEventListener("focus", load); };
  }, [session.user?.id]);

  // Filter agreements & installments by current user role/advisor assignment
  const visibleAgreements = useMemo(() => {
    if (!isMockDataMode || session.isAdmin) return agreements;
    if (!session.user) return [];
    return agreements.filter((agr) => {
      if (agr.advisorId && isNotificationForUser(agr.advisorId, session.user)) return true;
      const l = leads.find((lead) => lead.id === agr.leadId);
      if (l?.agentId && isNotificationForUser(l.agentId, session.user)) return true;
      return false;
    });
  }, [agreements, leads, session.isAdmin, session.user]);

  const visibleInstallments = useMemo(() => {
    if (!isMockDataMode || session.isAdmin) return installments;
    if (!session.user) return [];
    const allowedAgreementIds = new Set(visibleAgreements.map((a) => a.id));
    return installments.filter((inst) => {
      if (allowedAgreementIds.has(inst.agreementId)) return true;
      if (inst.advisorId && isNotificationForUser(inst.advisorId, session.user)) return true;
      return false;
    });
  }, [installments, visibleAgreements, session.isAdmin, session.user]);

  // Projects list for dropdown filter
  const availableProjects = useMemo(() => {
    const set = new Set<string>();
    visibleAgreements.forEach((a) => {
      if (a.projectName) set.add(a.projectName);
    });
    return Array.from(set);
  }, [visibleAgreements]);

  // Key metrics calculation
  const metrics = useMemo(() => {
    const todayStr = getTodayDateString();
    const todayTime = new Date(`${todayStr}T00:00:00`).getTime();
    const next7Time = todayTime + 7 * 86400000;

    let overdueArs = 0;
    let overdueUsd = 0;
    let overdueCount = 0;
    const overdueLeadIds = new Set<string>();

    let dueTodayArs = 0;
    let dueTodayUsd = 0;
    let dueTodayCount = 0;

    let next7DaysArs = 0;
    let next7DaysUsd = 0;
    let next7DaysCount = 0;

    let paidThisMonthArs = 0;
    let paidThisMonthUsd = 0;
    let paidThisMonthCount = 0;

    const currentYearMonth = todayStr.substring(0, 7); // "YYYY-MM"

    visibleInstallments.forEach((inst) => {
      const { status } = evaluateInstallmentStatus(inst, todayStr);
      const cleanDue = inst.dueDate.split("T")[0];
      const dueTime = new Date(`${cleanDue}T00:00:00`).getTime();

      if (status === "OVERDUE") {
        overdueCount++;
        overdueLeadIds.add(inst.leadId);
        if (inst.currency === "USD") overdueUsd += (inst.amountRemaining ?? inst.amountExpected);
        else overdueArs += (inst.amountRemaining ?? inst.amountExpected);
      } else if (status === "DUE_TODAY") {
        dueTodayCount++;
        if (inst.currency === "USD") dueTodayUsd += (inst.amountRemaining ?? inst.amountExpected);
        else dueTodayArs += (inst.amountRemaining ?? inst.amountExpected);
      } else if ((status === "PENDING" || status === "PARTIALLY_PAID")) {
        if (dueTime >= todayTime && dueTime <= next7Time) {
          next7DaysCount++;
          if (inst.currency === "USD") next7DaysUsd += (inst.amountRemaining ?? inst.amountExpected);
          else next7DaysArs += (inst.amountRemaining ?? inst.amountExpected);
        }
      }

      if (inst.serverManaged) {
        const amount = inst.paidThisMonth ?? 0;
        if (amount > 0) { paidThisMonthCount++; if (inst.currency === "USD") paidThisMonthUsd += amount; else paidThisMonthArs += amount; }
      } else if (inst.status === "PAID") {
        const paidMonth = (inst.paidAt || inst.dueDate).substring(0, 7);
        if (paidMonth === currentYearMonth) {
          paidThisMonthCount++;
          const amount = inst.amountPaid || inst.amountExpected;
          if (inst.currency === "USD") paidThisMonthUsd += amount;
          else paidThisMonthArs += amount;
        }
      }
    });

    return {
      overdueArs,
      overdueUsd,
      overdueCount,
      overdueLeadsCount: overdueLeadIds.size,
      dueTodayArs,
      dueTodayUsd,
      dueTodayCount,
      next7DaysArs,
      next7DaysUsd,
      next7DaysCount,
      paidThisMonthArs,
      paidThisMonthUsd,
      paidThisMonthCount,
    };
  }, [visibleInstallments]);

  // Filtered rows for the table
  const filteredInstallments = useMemo(() => {
    const todayStr = getTodayDateString();
    const todayTime = new Date(`${todayStr}T00:00:00`).getTime();
    const next7Time = todayTime + 7 * 86400000;

    return visibleInstallments.filter((inst) => {
      const agreement = agreements.find((a) => a.id === inst.agreementId);
      const lead = leads.find((l) => l.id === inst.leadId);

      // Status filter
      const { status } = evaluateInstallmentStatus(inst, todayStr);
      const cleanDue = inst.dueDate.split("T")[0];
      const dueTime = new Date(`${cleanDue}T00:00:00`).getTime();

      if (statusFilter === "overdue" && status !== "OVERDUE") return false;
      if (statusFilter === "dueToday" && status !== "DUE_TODAY") return false;
      if (statusFilter === "paid" && inst.status !== "PAID") return false;
      if (statusFilter === "next7Days") {
        if ((status !== "PENDING" && status !== "PARTIALLY_PAID") || dueTime < todayTime || dueTime > next7Time) {
          return false;
        }
      }

      // Project filter
      if (selectedProject !== "all" && agreement?.projectName !== selectedProject) {
        return false;
      }

      // Search query filter
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const leadName = lead?.name.toLowerCase() || "";
        const leadPhone = lead?.phone?.toLowerCase() || "";
        const agrCode = agreement?.publicId.toLowerCase() || "";
        const propTitle = agreement?.propertyTitle?.toLowerCase() || "";
        const projName = agreement?.projectName?.toLowerCase() || "";

        const matches =
          leadName.includes(q) ||
          leadPhone.includes(q) ||
          agrCode.includes(q) ||
          propTitle.includes(q) ||
          projName.includes(q);

        if (!matches) return false;
      }

      return true;
    }).sort((a, b) => {
      // Sort priority: OVERDUE first, then DUE_TODAY, then PENDING by dueDate, then PAID
      const priority = (item: Installment) => {
        const { status } = evaluateInstallmentStatus(item, getTodayDateString());
        if (status === "OVERDUE") return 1;
        if (status === "DUE_TODAY") return 2;
        if (status === "PENDING" || status === "PARTIALLY_PAID") return 3;
        return 4;
      };
      const pA = priority(a);
      const pB = priority(b);
      if (pA !== pB) return pA - pB;
      return a.dueDate.localeCompare(b.dueDate);
    });
  }, [visibleInstallments, agreements, leads, statusFilter, selectedProject, searchQuery]);

  // Handlers for payments
  const handleOpenPaymentModal = (inst: Installment) => {
    setPayingInstallment(inst);
    setPaymentAmount(inst.amountRemaining ?? Math.max(0, inst.amountExpected - (inst.amountPaid ?? 0)));
    setPaymentMethod("TRANSFER");
    setPaymentReceipt("");
    setPaymentNotes("");
  };

  const handleConfirmPayment = () => {
    void run(async () => {
      if (!payingInstallment) return;
      if (paymentAmount <= 0) {
        toast.error("El monto debe ser mayor a 0");
        return;
      }

      const updated = await recordInstallmentPayment(
        payingInstallment.id,
        {
          amountPaid: paymentAmount,
          paymentMethod,
          paymentReceiptNumber: paymentReceipt || "S/N",
          notes: paymentNotes || undefined,
          paidAt: getTodayDateString(),
        },
        installments,
        "c1"
      );

      setInstallments(updated);
      toast.success("Pago registrado exitosamente");
      setPayingInstallment(null);
    });
  };

  // Handlers for new agreement creation
  const handleCreateAgreement = (e: React.FormEvent) => {
    e.preventDefault();
    void run(async () => {
      if (!newAgrLeadId) {
        toast.error("Selecciona un lead para el acuerdo");
        return;
      }
      const financed = Math.max(0, newAgrTotalPrice - newAgrDownPayment);

      const targetLead = leads.find((l) => l.id === newAgrLeadId);
      const advisorId = targetLead?.agentId || session.user?.id || "usr-sales";

      const result = await createAgreementWithInstallments(
        {
          leadId: newAgrLeadId,
          advisorId,
          projectName: newAgrProjectName,
          propertyTitle: newAgrPropertyTitle || undefined,
          currency: newAgrCurrency,
          modality: newAgrModality,
          totalPrice: newAgrTotalPrice,
          downPayment: newAgrDownPayment,
          financedBalance: financed,
          totalInstallments: newAgrTotalInstallments,
          monthlyRatePct,
          dayOfMonthDue: newAgrDueDay,
          startDate: newAgrStartDate,
          notes: newAgrNotes || undefined,
        },
        agreements,
        installments,
        "c1"
      );

      await refresh();
      setInstallments(result.installments);
      setIsNewAgreementModalOpen(false);
      toast.success(`Plan creado con éxito (${newAgrTotalInstallments} cuotas generadas)`);
    });
  };

  const getLeadInitials = (name?: string) => {
    if (!name) return "CL";
    return name
      .split(" ")
      .map((n) => n[0])
      .slice(0, 2)
      .join("")
      .toUpperCase();
  };

  if (loading || leadsLoading) return <CollectionsLoading />;
  if (error || leadsError) return <section className="rounded-xl border p-5"><h2>Cobranzas y Cuotas</h2>{loading ? <p role="status">Cargando…</p> : <p role="alert">{error || leadsError}</p>}<button onClick={() => { void refresh(); window.dispatchEvent(new Event("focus")); }}>Reintentar</button></section>;

  return (
    <div className="space-y-6">
      {loading && <p role="status">Cargando cobranzas…</p>}
      {(error || leadsError) && <div role="alert" className="rounded-lg border border-red-300 p-3 text-red-700">{error || leadsError} <button onClick={() => void refresh()}>Reintentar</button></div>}
      {saving && <p role="status">Guardando…</p>}
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2 text-xs font-semibold text-slate-500 dark:text-slate-400">
            <Link href="/admin" className="hover:text-blue-600 dark:hover:text-blue-400">
              Admin
            </Link>
            <span>/</span>
            <span className="text-slate-700 dark:text-slate-200">Cobranzas & Cuotas</span>
          </div>
          <h1 className="mt-1 text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
            Cobranzas & Seguimiento de Cuotas
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Control de cobros, vencimientos y detección automática de mora por lead.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <ExportLocalCollections />
          <button
            type="button"
            disabled={!canWrite}
            onClick={() => {
              setNewAgrLeadId(leads[0]?.id || "");
              setIsNewAgreementModalOpen(true);
            }}
            className="flex items-center gap-2 rounded-xl bg-blue-600 px-3.5 py-2 text-xs font-bold text-white shadow-sm transition-all hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-blue-600 dark:hover:bg-blue-500"
          >
            <Plus className="size-4" />
            <span>Nuevo Plan de Cobro</span>
          </button>
        </div>
      </div>

      {/* KPI Cards Grid */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {/* Total en Mora */}
        <div className="rounded-xl border border-rose-200 bg-rose-50/50 p-4 shadow-sm dark:border-rose-900/50 dark:bg-rose-950/20">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-rose-700 dark:text-rose-400">
              Mora Total
            </span>
            <span className="flex size-7 items-center justify-center rounded-lg bg-rose-100 text-rose-600 dark:bg-rose-900/50 dark:text-rose-300">
              <AlertCircle className="size-4" />
            </span>
          </div>
          <div className="mt-2.5">
            <p className="text-xl font-extrabold text-rose-900 dark:text-rose-200">
              {metrics.overdueArs > 0 && formatInstallmentAmount(metrics.overdueArs, "ARS")}
              {metrics.overdueArs > 0 && metrics.overdueUsd > 0 && " + "}
              {metrics.overdueUsd > 0 && formatInstallmentAmount(metrics.overdueUsd, "USD")}
              {metrics.overdueArs === 0 && metrics.overdueUsd === 0 && "$ 0"}
            </p>
            <p className="mt-1 flex items-center gap-2 text-xs text-rose-600 dark:text-rose-400">
              <span className="font-semibold">{metrics.overdueCount} cuotas en mora</span>
              <span>·</span>
              <span>{metrics.overdueLeadsCount} clientes</span>
            </p>
          </div>
        </div>

        {/* Vencimientos de Hoy */}
        <div className="rounded-xl border border-amber-200 bg-amber-50/50 p-4 shadow-sm dark:border-amber-900/50 dark:bg-amber-950/20">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-amber-700 dark:text-amber-400">
              Vencimientos de Hoy
            </span>
            <span className="flex size-7 items-center justify-center rounded-lg bg-amber-100 text-amber-600 dark:bg-amber-900/50 dark:text-amber-300">
              <Calendar className="size-4" />
            </span>
          </div>
          <div className="mt-2.5">
            <p className="text-xl font-extrabold text-amber-900 dark:text-amber-200">
              {metrics.dueTodayArs > 0 && formatInstallmentAmount(metrics.dueTodayArs, "ARS")}
              {metrics.dueTodayArs > 0 && metrics.dueTodayUsd > 0 && " + "}
              {metrics.dueTodayUsd > 0 && formatInstallmentAmount(metrics.dueTodayUsd, "USD")}
              {metrics.dueTodayArs === 0 && metrics.dueTodayUsd === 0 && "$ 0"}
            </p>
            <p className="mt-1 text-xs text-amber-600 dark:text-amber-400">
              <span className="font-semibold">{metrics.dueTodayCount} cuotas</span> a vencer en la fecha
            </p>
          </div>
        </div>

        {/* Próximos 7 días */}
        <div className="rounded-xl border border-blue-200 bg-blue-50/50 p-4 shadow-sm dark:border-blue-900/50 dark:bg-blue-950/20">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-blue-700 dark:text-blue-400">
              Próximos 7 Días
            </span>
            <span className="flex size-7 items-center justify-center rounded-lg bg-blue-100 text-blue-600 dark:bg-blue-900/50 dark:text-blue-300">
              <Clock className="size-4" />
            </span>
          </div>
          <div className="mt-2.5">
            <p className="text-xl font-extrabold text-blue-900 dark:text-blue-200">
              {metrics.next7DaysArs > 0 && formatInstallmentAmount(metrics.next7DaysArs, "ARS")}
              {metrics.next7DaysArs > 0 && metrics.next7DaysUsd > 0 && " + "}
              {metrics.next7DaysUsd > 0 && formatInstallmentAmount(metrics.next7DaysUsd, "USD")}
              {metrics.next7DaysArs === 0 && metrics.next7DaysUsd === 0 && "$ 0"}
            </p>
            <p className="mt-1 text-xs text-blue-600 dark:text-blue-400">
              <span className="font-semibold">{metrics.next7DaysCount} cuotas</span> proyectadas a cobrar
            </p>
          </div>
        </div>

        {/* Cobrado en el Mes */}
        <div className="rounded-xl border border-emerald-200 bg-emerald-50/50 p-4 shadow-sm dark:border-emerald-900/50 dark:bg-emerald-950/20">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-emerald-700 dark:text-emerald-400">
              Cobrado este Mes
            </span>
            <span className="flex size-7 items-center justify-center rounded-lg bg-emerald-100 text-emerald-600 dark:bg-emerald-900/50 dark:text-emerald-300">
              <CheckCircle2 className="size-4" />
            </span>
          </div>
          <div className="mt-2.5">
            <p className="text-xl font-extrabold text-emerald-900 dark:text-emerald-200">
              {metrics.paidThisMonthArs > 0 && formatInstallmentAmount(metrics.paidThisMonthArs, "ARS")}
              {metrics.paidThisMonthArs > 0 && metrics.paidThisMonthUsd > 0 && " + "}
              {metrics.paidThisMonthUsd > 0 && formatInstallmentAmount(metrics.paidThisMonthUsd, "USD")}
              {metrics.paidThisMonthArs === 0 && metrics.paidThisMonthUsd === 0 && "$ 0"}
            </p>
            <p className="mt-1 text-xs text-emerald-600 dark:text-emerald-400">
              <span className="font-semibold">{metrics.paidThisMonthCount} cuotas</span> acreditadas
            </p>
          </div>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-white p-3.5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <div className="flex flex-wrap items-center justify-between gap-3">
          {/* Quick status chips */}
          <div className="flex flex-wrap items-center gap-1.5">
            <button
              type="button"
              onClick={() => setStatusFilter("all")}
              className={`rounded-lg px-3 py-1.5 text-xs font-bold transition-all ${
                statusFilter === "all"
                  ? "bg-slate-900 text-white dark:bg-white dark:text-slate-900 shadow-sm"
                  : "bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
              }`}
            >
              Todas ({visibleInstallments.length})
            </button>

            <button
              type="button"
              onClick={() => setStatusFilter("overdue")}
              className={`rounded-lg px-3 py-1.5 text-xs font-bold transition-all ${
                statusFilter === "overdue"
                  ? "bg-rose-600 text-white shadow-sm"
                  : "bg-rose-50 text-rose-700 hover:bg-rose-100 dark:bg-rose-950/40 dark:text-rose-300 dark:hover:bg-rose-900/60 border border-rose-200 dark:border-rose-900/50"
              }`}
            >
              En Mora ({metrics.overdueCount})
            </button>

            <button
              type="button"
              onClick={() => setStatusFilter("dueToday")}
              className={`rounded-lg px-3 py-1.5 text-xs font-bold transition-all ${
                statusFilter === "dueToday"
                  ? "bg-amber-600 text-white shadow-sm"
                  : "bg-amber-50 text-amber-700 hover:bg-amber-100 dark:bg-amber-950/40 dark:text-amber-300 dark:hover:bg-amber-900/60 border border-amber-200 dark:border-amber-900/50"
              }`}
            >
              Vencen Hoy ({metrics.dueTodayCount})
            </button>

            <button
              type="button"
              onClick={() => setStatusFilter("next7Days")}
              className={`rounded-lg px-3 py-1.5 text-xs font-bold transition-all ${
                statusFilter === "next7Days"
                  ? "bg-blue-600 text-white shadow-sm"
                  : "bg-blue-50 text-blue-700 hover:bg-blue-100 dark:bg-blue-950/40 dark:text-blue-300 dark:hover:bg-blue-900/60 border border-blue-200 dark:border-blue-900/50"
              }`}
            >
              Próximos 7 días ({metrics.next7DaysCount})
            </button>

            <button
              type="button"
              onClick={() => setStatusFilter("paid")}
              className={`rounded-lg px-3 py-1.5 text-xs font-bold transition-all ${
                statusFilter === "paid"
                  ? "bg-emerald-600 text-white shadow-sm"
                  : "bg-emerald-50 text-emerald-700 hover:bg-emerald-100 dark:bg-emerald-950/40 dark:text-emerald-300 dark:hover:bg-emerald-900/60 border border-emerald-200 dark:border-emerald-900/50"
              }`}
            >
              Cobradas ({metrics.paidThisMonthCount})
            </button>
          </div>

          {/* Reset Filters button */}
          {(statusFilter !== "all" || selectedProject !== "all" || searchQuery) && (
            <button
              type="button"
              onClick={() => {
                setStatusFilter("all");
                setSelectedProject("all");
                setSearchQuery("");
              }}
              className="flex items-center gap-1 text-xs font-semibold text-rose-600 hover:text-rose-700 dark:text-rose-400"
            >
              <RotateCcw className="size-3.5" />
              <span>Limpiar filtros</span>
            </button>
          )}
        </div>

        {/* Search input & project selector */}
        <div className="flex flex-col gap-2.5 sm:flex-row sm:items-center">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Buscar por cliente, teléfono, acuerdo o lote..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="h-9 w-full rounded-lg border border-slate-200 bg-slate-50 pl-9 pr-4 text-xs font-medium text-slate-800 placeholder-slate-400 focus:border-blue-500 focus:bg-white focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-200 dark:placeholder-slate-500"
            />
          </div>

          <select
            value={selectedProject}
            onChange={(e) => setSelectedProject(e.target.value)}
            className="h-9 rounded-lg border border-slate-200 bg-slate-50 px-3 text-xs font-semibold text-slate-700 focus:border-blue-500 focus:bg-white focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-300"
          >
            <option value="all">Proyecto: Todos</option>
            {availableProjects.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Table / List Container */}
      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
        {filteredInstallments.length === 0 ? (
          <div className="flex flex-col items-center justify-center p-12 text-center">
            <ReceiptText className="size-10 text-slate-300 dark:text-slate-600" />
            <p className="mt-3 text-sm font-bold text-slate-700 dark:text-slate-300">
              No se encontraron cuotas con los filtros aplicados
            </p>
            <p className="text-xs text-slate-400 mt-1">
              Probá seleccionando otro estado o limpiando los términos de búsqueda.
            </p>
          </div>
        ) : (
          <>
            {/* Desktop Table */}
            <div className="hidden overflow-x-auto md:block">
              <table className="w-full text-left text-xs">
                <thead className="border-b border-slate-200 bg-slate-50 font-bold text-slate-600 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-400">
                  <tr>
                    <th className="px-4 py-3">Cliente</th>
                    <th className="px-4 py-3">Plan / Inmueble</th>
                    <th className="px-4 py-3">Cuota</th>
                    <th className="px-4 py-3">Vencimiento & Estado</th>
                    <th className="px-4 py-3">Importe</th>
                    <th className="px-4 py-3 text-right">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60">
                  {filteredInstallments.map((inst) => {
                    const agreement = agreements.find((a) => a.id === inst.agreementId);
                    const lead = leads.find((l) => l.id === inst.leadId);
                    const statusInfo = evaluateInstallmentStatus(inst);

                    const whatsappUrl = lead?.phone && agreement
                      ? buildWhatsAppReminderUrl(lead.phone, lead, agreement, inst)
                      : null;

                    return (
                      <tr
                        key={inst.id}
                        className="transition-colors hover:bg-slate-50/80 dark:hover:bg-slate-800/40"
                      >
                        {/* Cliente */}
                        <td className="px-4 py-3.5">
                          <div className="flex items-center gap-3">
                            <Avatar className="size-8 border border-slate-200 dark:border-slate-700">
                              <AvatarFallback className="bg-slate-100 text-[10px] font-bold text-slate-700 dark:bg-slate-800 dark:text-slate-200">
                                {getLeadInitials(lead?.name)}
                              </AvatarFallback>
                            </Avatar>
                            <div>
                              <Link
                                href={`/admin/leads/${inst.leadId}`}
                                className="font-bold text-slate-900 hover:text-blue-600 dark:text-slate-100 dark:hover:text-blue-400"
                              >
                                {lead?.name || "Cliente no asignado"}
                              </Link>
                              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                                {lead?.phone || "Sin teléfono"}
                              </p>
                            </div>
                          </div>
                        </td>

                        {/* Plan & Activo */}
                        <td className="px-4 py-3.5">
                          <div className="flex flex-col">
                            <span className="font-semibold text-slate-800 dark:text-slate-200">
                              {agreement?.projectName || "Plan de Financiación"}
                            </span>
                            <span className="text-[11px] text-slate-500 dark:text-slate-400">
                              {agreement?.propertyTitle || agreement?.publicId || "Acuerdo directo"}
                            </span>
                          </div>
                        </td>

                        {/* Cuota */}
                        <td className="px-4 py-3.5">
                          <span className="inline-flex items-center rounded-md bg-slate-100 px-2 py-0.5 text-[11px] font-bold text-slate-700 dark:bg-slate-800 dark:text-slate-300">
                            {inst.installmentNumber} / {agreement?.totalInstallments || 1}
                          </span>
                        </td>

                        {/* Vencimiento & Estado */}
                        <td className="px-4 py-3.5">
                          {statusInfo.status === "OVERDUE" && (
                            <div className="flex flex-col gap-0.5">
                              <span className="inline-flex w-fit items-center gap-1 rounded-full bg-rose-100 px-2 py-0.5 text-[10px] font-bold text-rose-800 dark:bg-rose-950 dark:text-rose-300">
                                <AlertCircle className="size-3" />
                                Vencida ({statusInfo.daysOverdue} {statusInfo.daysOverdue === 1 ? "día" : "días"})
                              </span>
                              <span className="text-[11px] text-rose-600 dark:text-rose-400 font-medium">
                                Venció el {formatDueDate(inst.dueDate)}
                              </span>
                            </div>
                          )}

                          {statusInfo.status === "DUE_TODAY" && (
                            <div className="flex flex-col gap-0.5">
                              <span className="inline-flex w-fit items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-800 dark:bg-amber-950 dark:text-amber-300">
                                <Calendar className="size-3" />
                                Vence hoy
                              </span>
                              <span className="text-[11px] text-amber-700 dark:text-amber-400 font-medium">
                                {formatDueDate(inst.dueDate)}
                              </span>
                            </div>
                          )}

                          {(statusInfo.status === "PENDING" || statusInfo.status === "PARTIALLY_PAID") && (
                            <div className="flex flex-col gap-0.5">
                              <span className="inline-flex w-fit items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-700 dark:bg-slate-800 dark:text-slate-300">
                                <Clock className="size-3" />
                                {statusInfo.status === "PARTIALLY_PAID" ? "Pago parcial" : "Al día"}
                              </span>
                              <span className="text-[11px] text-slate-500 dark:text-slate-400">
                                {formatDueDate(inst.dueDate)}
                              </span>
                            </div>
                          )}

                          {statusInfo.status === "PAID" && (
                            <div className="flex flex-col gap-0.5">
                              <span className="inline-flex w-fit items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
                                <CheckCircle2 className="size-3" />
                                Cobrada
                              </span>
                              <span className="text-[11px] text-slate-500 dark:text-slate-400">
                                {formatDueDate(inst.paidAt || inst.dueDate)} · {inst.paymentReceiptNumber || "TRF"}
                              </span>
                            </div>
                          )}
                        </td>

                        {/* Importe */}
                        <td className="px-4 py-3.5 font-bold text-slate-900 dark:text-slate-100">
                          {formatInstallmentAmount(inst.amountExpected, inst.currency)}
                          {inst.serverManaged && <span className="block text-xs font-normal">Saldo: {formatInstallmentAmount(inst.amountRemaining ?? 0, inst.currency)}</span>}
                        </td>

                        {/* Acciones */}
                        <td className="px-4 py-3.5 text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            <InstallmentPaymentHistory installment={inst} />
                            {/* WhatsApp Button */}
                            {whatsappUrl && inst.status !== "PAID" ? (
                              <a
                                href={whatsappUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                title="Notificar por WhatsApp"
                                className="flex items-center gap-1 rounded-lg bg-emerald-600 px-2.5 py-1 text-[11px] font-bold text-white transition-colors hover:bg-emerald-700 shadow-sm"
                              >
                                <MessageCircle className="size-3.5" />
                                <span>WhatsApp</span>
                              </a>
                            ) : null}

                            {/* Registrar Cobro Button */}
                            {inst.status !== "PAID" && inst.status !== "CANCELLED" ? (
                              <button
                                type="button"
                                onClick={() => handleOpenPaymentModal(inst)}
                                className="flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-bold text-slate-700 transition-colors hover:bg-slate-50 hover:text-blue-600 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800 shadow-sm"
                              >
                                <CreditCard className="size-3.5 text-blue-600 dark:text-blue-400" />
                                <span>Cobrar</span>
                              </button>
                            ) : (
                              <span className="text-[11px] text-slate-400 font-medium">Registrado</span>
                            )}

                            {/* Lead Profile Link */}
                            <Link
                              href={`/admin/leads/${inst.leadId}`}
                              title="Ver ficha del lead"
                              className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800 dark:hover:text-slate-200"
                            >
                              <ExternalLink className="size-4" />
                            </Link>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Mobile Cards View */}
            <div className="divide-y divide-slate-100 md:hidden dark:divide-slate-800">
              {filteredInstallments.map((inst) => {
                const agreement = agreements.find((a) => a.id === inst.agreementId);
                const lead = leads.find((l) => l.id === inst.leadId);
                const statusInfo = evaluateInstallmentStatus(inst);

                const whatsappUrl = lead?.phone && agreement
                  ? buildWhatsAppReminderUrl(lead.phone, lead, agreement, inst)
                  : null;

                return (
                  <div key={inst.id} className="p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2.5">
                        <Avatar className="size-8 border border-slate-200 dark:border-slate-700">
                          <AvatarFallback className="bg-slate-100 text-[10px] font-bold text-slate-700 dark:bg-slate-800 dark:text-slate-200">
                            {getLeadInitials(lead?.name)}
                          </AvatarFallback>
                        </Avatar>
                        <div>
                          <Link
                            href={`/admin/leads/${inst.leadId}`}
                            className="text-xs font-bold text-slate-900 hover:text-blue-600 dark:text-slate-100"
                          >
                            {lead?.name || "Cliente"}
                          </Link>
                          <p className="text-[10px] text-slate-400">
                            {agreement?.projectName || "Plan"} · {inst.installmentNumber}/
                            {agreement?.totalInstallments || 1}
                          </p>
                        </div>
                      </div>

                      <div className="text-right">
                        <p className="text-xs font-bold text-slate-900 dark:text-slate-100">
                          {formatInstallmentAmount(inst.amountExpected, inst.currency)}
                          {inst.serverManaged && <span className="block text-xs font-normal">Saldo: {formatInstallmentAmount(inst.amountRemaining ?? 0, inst.currency)}</span>}
                        </p>
                        <p className="text-[10px] text-slate-400">{formatDueDate(inst.dueDate)}</p>
                      </div>
                    </div>

                    <div className="flex items-center justify-between pt-1">
                      <div>
                        {statusInfo.status === "OVERDUE" && (
                          <span className="inline-flex items-center gap-1 rounded-full bg-rose-100 px-2 py-0.5 text-[10px] font-bold text-rose-800 dark:bg-rose-950 dark:text-rose-300">
                            <AlertCircle className="size-3" />
                            Vencida ({statusInfo.daysOverdue}d mora)
                          </span>
                        )}
                        {statusInfo.status === "DUE_TODAY" && (
                          <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-800 dark:bg-amber-950 dark:text-amber-300">
                            <Calendar className="size-3" />
                            Vence hoy
                          </span>
                        )}
                        {(statusInfo.status === "PENDING" || statusInfo.status === "PARTIALLY_PAID") && (
                          <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-700 dark:bg-slate-800 dark:text-slate-300">
                            {statusInfo.status === "PARTIALLY_PAID" ? "Pago parcial" : "Al día"}
                          </span>
                        )}
                        {statusInfo.status === "PAID" && (
                          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
                            Cobrada
                          </span>
                        )}
                      </div>

                      <div className="flex items-center gap-1.5">
                        <InstallmentPaymentHistory installment={inst} />
                        {whatsappUrl && inst.status !== "PAID" && (
                          <a
                            href={whatsappUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center gap-1 rounded-lg bg-emerald-600 px-2.5 py-1 text-[11px] font-bold text-white"
                          >
                            <MessageCircle className="size-3.5" />
                            <span>WhatsApp</span>
                          </a>
                        )}

                        {inst.status !== "PAID" && inst.status !== "CANCELLED" && (
                          <button
                            type="button"
                            onClick={() => handleOpenPaymentModal(inst)}
                            className="flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-bold text-slate-700 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300"
                          >
                            <CreditCard className="size-3.5 text-blue-600" />
                            <span>Cobrar</span>
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>

      {/* Modal: Registrar Cobro */}
      {payingInstallment && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 backdrop-blur-sm p-4">
          <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-xl dark:border-slate-800 dark:bg-slate-900">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3 dark:border-slate-800">
              <div className="flex items-center gap-2">
                <ReceiptText className="size-5 text-blue-600 dark:text-blue-400" />
                <h2 className="text-base font-bold text-slate-900 dark:text-slate-100">
                  Registrar Cobro de Cuota
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setPayingInstallment(null)}
                className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800 dark:hover:text-slate-200"
              >
                <X className="size-4" />
              </button>
            </div>

            <div className="mt-4 space-y-4">
              {/* Cuota details banner */}
              <div className="rounded-lg bg-slate-50 p-3 text-xs dark:bg-slate-950 border border-slate-100 dark:border-slate-800">
                <p className="font-bold text-slate-800 dark:text-slate-200">
                  {leads.find((l) => l.id === payingInstallment.leadId)?.name}
                </p>
                <p className="text-slate-500 dark:text-slate-400 mt-0.5">
                  Cuota N° {payingInstallment.installmentNumber} · Vencimiento:{" "}
                  {formatDueDate(payingInstallment.dueDate)}
                </p>
                <p className="mt-1 font-extrabold text-blue-600 dark:text-blue-400">
                  Importe pactado:{" "}
                  {formatInstallmentAmount(
                    payingInstallment.amountExpected,
                    payingInstallment.currency
                  )}
                </p>
              </div>

              {/* Amount input */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                  Monto Cobrado ({payingInstallment.currency})
                </label>
                <input
                  type="number"
                  value={paymentAmount}
                  onChange={(e) => setPaymentAmount(Number(e.target.value))}
                  className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-100"
                />
              </div>

              {/* Payment Method */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                  Método de Pago
                </label>
                <select
                  value={paymentMethod}
                  onChange={(e) => setPaymentMethod(e.target.value as InstallmentPaymentMethod)}
                  className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-800 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-200"
                >
                  <option value="TRANSFER">Transferencia Bancaria</option>
                  <option value="CASH">Efectivo en Caja</option>
                  <option value="DEPOSIT">Depósito Bancario</option>
                  <option value="CHECK">Cheque</option>
                </select>
              </div>

              {/* Receipt / Reference */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                  N° de Recibo o Referencia Bancaria
                </label>
                <input
                  type="text"
                  placeholder="ej. TRF-994821"
                  value={paymentReceipt}
                  onChange={(e) => setPaymentReceipt(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-100"
                />
              </div>

              {/* Notes */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                  Notas u Observaciones (opcional)
                </label>
                <input
                  type="text"
                  placeholder="ej. Cobrado con recibo provisorio en sucursal"
                  value={paymentNotes}
                  onChange={(e) => setPaymentNotes(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-100"
                />
              </div>

              <div className="mt-6 flex items-center justify-end gap-2 pt-3 border-t border-slate-100 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setPayingInstallment(null)}
                  className="rounded-lg border border-slate-200 px-3.5 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50 dark:border-slate-800 dark:text-slate-300 dark:hover:bg-slate-800"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  disabled={saving || !canWrite} onClick={handleConfirmPayment}
                  className="flex items-center gap-1.5 rounded-lg bg-blue-600 px-4 py-2 text-xs font-bold text-white shadow-sm hover:bg-blue-700 dark:bg-blue-600 dark:hover:bg-blue-500"
                >
                  <Check className="size-3.5" />
                  <span>Confirmar Cobro</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Nuevo Plan de Cobro */}
      {isNewAgreementModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 backdrop-blur-sm p-4">
          <div className="w-full max-w-lg rounded-2xl border border-slate-200 bg-white p-6 shadow-xl dark:border-slate-800 dark:bg-slate-900 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3 dark:border-slate-800">
              <div className="flex items-center gap-2">
                <ReceiptText className="size-5 text-blue-600 dark:text-blue-400" />
                <h2 className="text-base font-bold text-slate-900 dark:text-slate-100">
                  Nuevo Plan de Cobranza & Financiación
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setIsNewAgreementModalOpen(false)}
                className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800 dark:hover:text-slate-200"
              >
                <X className="size-4" />
              </button>
            </div>

            <form onSubmit={handleCreateAgreement} className="mt-4 space-y-4">
              <label className="block text-xs">Interés mensual sobre capital inicial (%)<input className="mt-1 block w-full rounded border p-2" type="number" min="0" max="100" step="0.0001" required value={monthlyRatePct} onChange={e => setMonthlyRatePct(Number(e.target.value))} /></label>
              <p className="text-xs text-slate-500">La primera cuota vence el mes siguiente a la fecha de inicio. Los días 29–31 se ajustan al último día del mes cuando corresponda.</p>
              {/* Lead Selector */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                  Cliente / Lead Titular *
                </label>
                <select
                  value={newAgrLeadId}
                  onChange={(e) => setNewAgrLeadId(e.target.value)}
                  required
                  className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-800 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-200"
                >
                  <option value="">Seleccionar un lead...</option>
                  {leads.map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.name} ({l.phone || "Sin teléfono"})
                    </option>
                  ))}
                </select>
              </div>

              {/* Proyecto y Lote */}
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                    Proyecto / Desarrollo
                  </label>
                  <input
                    type="text"
                    value={newAgrProjectName}
                    onChange={(e) => setNewAgrProjectName(e.target.value)}
                    placeholder="ej. San Pablo 1"
                    className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-900 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-100"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                    Lote / Unidad Descriptiva
                  </label>
                  <input
                    type="text"
                    value={newAgrPropertyTitle}
                    onChange={(e) => setNewAgrPropertyTitle(e.target.value)}
                    placeholder="ej. Lote 15 Mz AP8"
                    className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-900 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-100"
                  />
                </div>
              </div>

              {/* Moneda y Modalidad */}
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                    Moneda
                  </label>
                  <select
                    value={newAgrCurrency}
                    onChange={(e) => setNewAgrCurrency(e.target.value as "ARS" | "USD")}
                    className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-800 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-200"
                  >
                    <option value="ARS">Pesos Argentinos (ARS)</option>
                    <option value="USD">Dólares (USD)</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                    Modalidad
                  </label>
                  <select
                    value={newAgrModality}
                    onChange={(e) =>
                      setNewAgrModality(e.target.value as "FIXED" | "CAC" | "STEPPED")
                    }
                    className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-800 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-200"
                  >
                    <option value="FIXED">Cuotas Fijas</option>
                    {isMockDataMode && <option value="CAC">Ajustable por CAC</option>}
                    {isMockDataMode && <option value="STEPPED">Escalonado</option>}
                  </select>
                </div>
              </div>

              {/* Precios */}
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                    Precio Total Pactado
                  </label>
                  <input
                    type="number"
                    value={newAgrTotalPrice}
                    onChange={(e) => setNewAgrTotalPrice(Number(e.target.value))}
                    className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-900 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-100"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                    Anticipo / Entrega Inicial
                  </label>
                  <input
                    type="number"
                    value={newAgrDownPayment}
                    onChange={(e) => setNewAgrDownPayment(Number(e.target.value))}
                    className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-900 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-100"
                  />
                </div>
              </div>

              {/* Saldo y Cantidad de cuotas */}
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                    Saldo Financiado
                  </label>
                  <div className="mt-1 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-extrabold text-blue-700 dark:border-slate-800 dark:bg-slate-950 dark:text-blue-300">
                    {formatInstallmentAmount(
                      Math.max(0, newAgrTotalPrice - newAgrDownPayment),
                      newAgrCurrency
                    )}
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                    Cantidad de Cuotas
                  </label>
                  <select
                    value={newAgrTotalInstallments}
                    onChange={(e) => setNewAgrTotalInstallments(Number(e.target.value))}
                    className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-800 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-200"
                  >
                    <option value={12}>12 Cuotas</option>
                    <option value={24}>24 Cuotas</option>
                    <option value={36}>36 Cuotas</option>
                    <option value={48}>48 Cuotas</option>
                    <option value={60}>60 Cuotas</option>
                  </select>
                </div>
              </div>

              {/* Día de vencimiento y fecha inicio */}
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                    Día de Vencimiento Mensual
                  </label>
                  <select
                    value={newAgrDueDay}
                    onChange={(e) => setNewAgrDueDay(Number(e.target.value))}
                    className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-800 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-200"
                  >
                    {[5, 10, 15, 20, 25].map((d) => (
                      <option key={d} value={d}>
                        Día {d} de cada mes
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                    Fecha de Inicio
                  </label>
                  <input
                    type="date"
                    value={newAgrStartDate}
                    onChange={(e) => setNewAgrStartDate(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-900 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-100"
                  />
                </div>
              </div>

              {/* Live calculation banner */}
              <div className="rounded-xl border border-blue-200 bg-blue-50/70 p-3 text-xs dark:border-blue-900/50 dark:bg-blue-950/30">
                <span className="font-bold text-blue-900 dark:text-blue-200">
                  Proyección de Cuota:
                </span>
                <p className="mt-0.5 text-blue-800 dark:text-blue-300">
                  Se generarán {newAgrTotalInstallments} cuotas mensuales de{" "}
                  <span className="font-extrabold">
                    {formatInstallmentAmount(
                      Math.round(
                        Math.max(0, newAgrTotalPrice - newAgrDownPayment) /
                          Math.max(1, newAgrTotalInstallments)
                      ),
                      newAgrCurrency
                    )}
                  </span>
                  . La cuota 1 vencerá el día {newAgrDueDay} del mes siguiente.
                </p>
              </div>

              <div className="mt-6 flex items-center justify-end gap-2 pt-3 border-t border-slate-100 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsNewAgreementModalOpen(false)}
                  className="rounded-lg border border-slate-200 px-3.5 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50 dark:border-slate-800 dark:text-slate-300 dark:hover:bg-slate-800"
                >
                  Cancelar
                </button>
                <button disabled={saving || !canWrite} type="submit"
                  className="flex items-center gap-1.5 rounded-lg bg-blue-600 px-4 py-2 text-xs font-bold text-white shadow-sm hover:bg-blue-700 dark:bg-blue-600 dark:hover:bg-blue-500"
                >
                  <Plus className="size-3.5" />
                  <span>{saving ? "Generando plan…" : "Generar Plan de Cobranza"}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
