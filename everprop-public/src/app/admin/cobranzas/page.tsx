"use client";
import { CollectionsLoading } from "@/components/admin/CollectionsLoading";
import { CollectionEmailPreview } from "@/components/admin/CollectionEmailPreview";
import { ExportBillingPayments } from "@/components/admin/ExportBillingPayments";
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
  type Project,
  type LeadInterest,
} from "@/data/admin-sample";
import { loadEverpropLeadById, loadEverpropProjects } from "@/lib/everprop-api";
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
  CheckCircle2,
  Clock,
  Plus,
  Search,
  ReceiptText,
  MessageCircle,
  ExternalLink,
  X,
  CreditCard,
  RotateCcw,
} from "lucide-react";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
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
  const [reviewPayment, setReviewPayment] = useState(false);
  const [reviewAgreement, setReviewAgreement] = useState(false);
  const [paymentAmount, setPaymentAmount] = useState<number>(0);
  const [paymentMethod, setPaymentMethod] = useState<InstallmentPaymentMethod>("TRANSFER");
  const [paymentReceipt, setPaymentReceipt] = useState("");
  const [paymentNotes, setPaymentNotes] = useState("");

  // New agreement form state
  const [newAgrLeadId, setNewAgrLeadId] = useState("");
  const [newAgrProjectName, setNewAgrProjectName] = useState("");
  const [newAgrPropertyTitle, setNewAgrPropertyTitle] = useState("");
  const [fullLead, setFullLead] = useState<Lead | null>(null);
  const [allProjects, setAllProjects] = useState<Project[]>([]);
  const [noInterestModalOpen, setNoInterestModalOpen] = useState(false);
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
    let active = true;
    async function loadProjects() {
      try {
        const p = await loadEverpropProjects();
        if (active) setAllProjects(p);
      } catch (e) {}
    }
    loadProjects();
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!newAgrLeadId || !isNewAgreementModalOpen) {
      setFullLead(null);
      return;
    }
    let active = true;
    async function fetchLead() {
      try {
        const lead = await loadEverpropLeadById(newAgrLeadId);
        if (active) {
          setFullLead(lead);
          if (!lead.interests || lead.interests.length === 0) {
            setNoInterestModalOpen(true);
          } else {
            const project = allProjects.find(p => p.id === lead.interests![0].projectId);
            setNewAgrProjectName(project?.name || "");
            setNewAgrPropertyTitle(lead.interests[0].propertyTitle || "");
          }
        }
      } catch (e) {}
    }
    fetchLead();
    return () => { active = false; };
  }, [newAgrLeadId, isNewAgreementModalOpen, allProjects]);

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
    let pendingThisMonthArs = 0;
    let pendingThisMonthUsd = 0;
    let pendingThisMonthCount = 0;

    const currentYearMonth = todayStr.substring(0, 7); // "YYYY-MM"

    visibleInstallments.forEach((inst) => {
      const { status } = evaluateInstallmentStatus(inst, todayStr);
      const cleanDue = inst.dueDate.split("T")[0];
      const dueTime = new Date(`${cleanDue}T00:00:00`).getTime();
      if (cleanDue.startsWith(currentYearMonth) && status !== "PAID" && status !== "CANCELLED") {
        pendingThisMonthCount++;
        const balance = inst.amountRemaining ?? Math.max(0, inst.amountExpected - (inst.amountPaid ?? 0));
        if (inst.currency === "USD") pendingThisMonthUsd += balance;
        else if (inst.currency === "ARS") pendingThisMonthArs += balance;
      }

      if (status === "OVERDUE") {
        overdueCount++;
        overdueLeadIds.add(inst.leadId);
        if (inst.currency === "USD") overdueUsd += (inst.amountRemaining ?? inst.amountExpected);
        else if (inst.currency === "ARS") overdueArs += (inst.amountRemaining ?? inst.amountExpected);
      } else if (status === "DUE_TODAY") {
        dueTodayCount++;
        if (inst.currency === "USD") dueTodayUsd += (inst.amountRemaining ?? inst.amountExpected);
        else if (inst.currency === "ARS") dueTodayArs += (inst.amountRemaining ?? inst.amountExpected);
      } else if ((status === "PENDING" || status === "PARTIALLY_PAID")) {
        if (dueTime >= todayTime && dueTime <= next7Time) {
          next7DaysCount++;
          if (inst.currency === "USD") next7DaysUsd += (inst.amountRemaining ?? inst.amountExpected);
          else if (inst.currency === "ARS") next7DaysArs += (inst.amountRemaining ?? inst.amountExpected);
        }
      }

      if (inst.serverManaged) {
        const amount = inst.paidThisMonth ?? 0;
        if (amount > 0) { paidThisMonthCount++; if (inst.currency === "USD") paidThisMonthUsd += amount; else if (inst.currency === "ARS") paidThisMonthArs += amount; }
      } else if (inst.status === "PAID") {
        const paidMonth = (inst.paidAt || inst.dueDate).substring(0, 7);
        if (paidMonth === currentYearMonth) {
          paidThisMonthCount++;
          const amount = inst.amountPaid || inst.amountExpected;
          if (inst.currency === "USD") paidThisMonthUsd += amount;
          else if (inst.currency === "ARS") paidThisMonthArs += amount;
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
      pendingThisMonthArs,
      pendingThisMonthUsd,
      pendingThisMonthCount,
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
        if ((status !== "PENDING" && status !== "PARTIALLY_PAID" && status !== "DUE_TODAY") || dueTime < todayTime || dueTime > next7Time) {
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

  const urgentInstallment = useMemo(() => visibleInstallments
    .filter(inst => inst.status !== "PAID" && inst.status !== "CANCELLED")
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate))[0], [visibleInstallments]);
  const urgentAgreement = agreements.find(a => a.id === urgentInstallment?.agreementId);
  const urgentLead = leads.find(l => l.id === urgentInstallment?.leadId);
  const paymentAgreement = agreements.find(a => a.id === payingInstallment?.agreementId);

  // Handlers for payments
  const handleOpenPaymentModal = (inst: Installment) => {
    if (!canWrite || !inst.currency) return;
    setReviewPayment(false);
    setPayingInstallment(inst);
    setPaymentAmount(inst.amountRemaining ?? Math.max(0, inst.amountExpected - (inst.amountPaid ?? 0)));
    setPaymentMethod("TRANSFER");
    setPaymentReceipt("");
    setPaymentNotes("");
  };

  const handleConfirmPayment = () => {
    void run(async () => {
      if (!payingInstallment || !canWrite || !reviewPayment || !payingInstallment.currency) return;
      if (!Number.isFinite(paymentAmount) || paymentAmount <= 0 || paymentAmount > (payingInstallment.amountRemaining ?? Math.max(0, payingInstallment.amountExpected - (payingInstallment.amountPaid ?? 0)))) {
        toast.error("El monto debe ser mayor a cero y no superar el saldo");
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

  const modalLeadProjects = fullLead ? Array.from(new Set((fullLead.interests || []).map(i => i.projectId).filter(Boolean))).map(id => ({ id: id as string, title: allProjects.find(p => p.id === id)?.name || "Proyecto" })) : [];
  const modalLeadAssets = fullLead ? (fullLead.interests || []).map(i => ({ id: i.propertyId || i.id, title: i.propertyTitle || "Activo", projectId: i.projectId })).filter(a => a.title) : [];
  const finalProjectName = modalLeadProjects.length === 1 ? modalLeadProjects[0].title : newAgrProjectName;
  const finalPropertyTitle = modalLeadAssets.length === 1 ? modalLeadAssets[0].title : newAgrPropertyTitle;
  const financedCents = Math.round(Math.max(0, newAgrTotalPrice - newAgrDownPayment) * 100);
  const projectedFirstAmount = isMockDataMode
    ? Math.round(financedCents / 100 / Math.max(1, newAgrTotalInstallments))
    : (Math.ceil(financedCents / Math.max(1, newAgrTotalInstallments)) + Math.round(financedCents * monthlyRatePct / 100)) / 100;
  const [startYear, startMonth] = newAgrStartDate.split("-").map(Number);
  const firstDueDate = new Date(startYear, startMonth, newAgrDueDay);
  const firstDueDateString = `${firstDueDate.getFullYear()}-${String(firstDueDate.getMonth() + 1).padStart(2, "0")}-${String(firstDueDate.getDate()).padStart(2, "0")}`;

  // Handlers for new agreement creation
  const handleCreateAgreement = (e: React.FormEvent) => {
    e.preventDefault();
    void run(async () => {
      if (!newAgrLeadId || !fullLead) {
        toast.error("Selecciona un lead para el acuerdo");
        return;
      }
      
      if (!finalProjectName) {
        toast.error("Debes seleccionar o tener asignado un proyecto para generar el plan.");
        return;
      }

      if (!canWrite) return;
      if (!reviewAgreement) { setReviewAgreement(true); return; }
      const financed = Math.max(0, newAgrTotalPrice - newAgrDownPayment);

      const targetLead = leads.find((l) => l.id === newAgrLeadId);
      const advisorId = targetLead?.agentId || session.user?.id || "usr-sales";

      const result = await createAgreementWithInstallments(
        {
          leadId: newAgrLeadId,
          advisorId,
          projectName: finalProjectName,
          propertyTitle: finalPropertyTitle || undefined,
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

  if (loading || leadsLoading) return <div className="collections-view"><CollectionsLoading /></div>;
  if (error || leadsError) return <section className="collections-view rounded-xl border p-5"><h2>Cobranzas y Cuotas</h2>{loading ? <p role="status">Cargando…</p> : <p role="alert">{error || leadsError}</p>}<button onClick={() => { void refresh(); window.dispatchEvent(new Event("focus")); }}>Reintentar</button></section>;


  return (
    <div className="collections-view space-y-6">
      {loading && <p role="status">Cargando cobranzas…</p>}
      {(error || leadsError) && <div role="alert" className="rounded-lg border border-red-300 p-3 text-red-700">{error || leadsError} <button onClick={() => void refresh()}>Reintentar</button></div>}
      {saving && <p role="status">Guardando…</p>}
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="mt-1 text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
            Cobranzas & Cuotas
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Planes de pago de tus clientes.
          </p>
        </div>

        <div className="collections-header-actions flex flex-wrap items-center gap-2">
          <ExportLocalCollections />
          <ExportBillingPayments />
          <button
            type="button"
            disabled={!canWrite}
            onClick={() => {
              setReviewAgreement(false);
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

      <section className="collections-overview" aria-label="Resumen de cobranzas">
        <article className="collections-priority">
          <div className="flex items-center gap-2"><AlertCircle aria-hidden="true" /><h2>{urgentInstallment ? (evaluateInstallmentStatus(urgentInstallment).status === "OVERDUE" ? "Cuota vencida con saldo" : "Próxima cuota a vencer") : "Sin cuotas pendientes"}</h2></div>
          {urgentInstallment ? <>
            <p className="collections-amount">{formatInstallmentAmount(urgentInstallment.amountRemaining ?? Math.max(0, urgentInstallment.amountExpected - (urgentInstallment.amountPaid ?? 0)), urgentInstallment.currency)}</p>
            <h3>{urgentLead?.name || "Cliente sin identificar"}</h3>
            <p>{urgentAgreement?.projectName || "Proyecto sin confirmar"} · {urgentAgreement?.propertyTitle || "Unidad sin confirmar"}</p>
            <p>Cuota {urgentInstallment.installmentNumber}{urgentAgreement ? ` de ${urgentAgreement.totalInstallments}` : ""} · Vencimiento {formatDueDate(urgentInstallment.dueDate)}</p>
            <div className="collections-actions">
              <button className="collections-cta" disabled={!canWrite || !urgentInstallment.currency} onClick={() => handleOpenPaymentModal(urgentInstallment)}><CreditCard aria-hidden="true" />Registrar pago</button>
              <Link href={`/admin/leads/${urgentInstallment.leadId}`}>Ver cliente</Link>
            </div>
          </> : <p>Las cuotas cargadas no tienen cobros pendientes.</p>}
        </article>
        <div className="collections-summary">
          <article><h2>Cobrado este mes</h2><strong>{formatInstallmentAmount(metrics.paidThisMonthUsd, "USD")}</strong><p>+ {formatInstallmentAmount(metrics.paidThisMonthArs, "ARS")}</p><p>{metrics.paidThisMonthCount} {metrics.paidThisMonthCount === 1 ? "cuota con pagos" : "cuotas con pagos"}</p></article>
          <article><h2>Por cobrar este mes</h2><strong>{formatInstallmentAmount(metrics.pendingThisMonthUsd, "USD")}</strong><p>+ {formatInstallmentAmount(metrics.pendingThisMonthArs, "ARS")}</p><p>{metrics.pendingThisMonthCount} {metrics.pendingThisMonthCount === 1 ? "cuota pendiente" : "cuotas pendientes"}</p><p>Hoy: {metrics.dueTodayCount} · En 7 días: {metrics.next7DaysCount}</p><p>{metrics.overdueCount} vencidas · {metrics.overdueLeadsCount} clientes</p></article>
          {visibleInstallments.some(inst => !inst.currency) && <p role="status">Hay cuotas con moneda sin confirmar. Sus importes no se suman a ARS ni USD.</p>}
        </div>
      </section>

      {/* Filter and Search Bar */}
      <div className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-white p-3.5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <div className="flex flex-wrap items-center justify-between gap-3">
          {/* Quick status chips */}
          <div className="collections-status-filters flex flex-wrap items-center gap-1.5">
            <button
              type="button"
              aria-pressed={statusFilter === "all"} onClick={() => setStatusFilter("all")}
              className={`rounded-lg px-3 py-1.5 text-xs font-bold transition-all ${
                statusFilter === "all"
                  ? "bg-slate-900 text-white dark:bg-white dark:text-slate-900 shadow-sm"
                  : "bg-slate-100 text-slate-600 hover:bg-muted dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
              }`}
            >
              Todas ({visibleInstallments.length})
            </button>

            <button
              type="button"
              aria-pressed={statusFilter === "overdue"} onClick={() => setStatusFilter("overdue")}
              className={`rounded-lg px-3 py-1.5 text-xs font-bold transition-all ${
                statusFilter === "overdue"
                  ? "bg-rose-600 text-white shadow-sm"
                  : "bg-rose-50 text-rose-700 hover:bg-rose-100 dark:bg-rose-950/40 dark:text-rose-300 dark:hover:bg-rose-900/60 border border-rose-200 dark:border-rose-900/50"
              }`}
            >
              Vencidas ({metrics.overdueCount})
            </button>

            <button
              type="button"
              aria-pressed={statusFilter === "dueToday"} onClick={() => setStatusFilter("dueToday")}
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
              aria-pressed={statusFilter === "next7Days"} onClick={() => setStatusFilter("next7Days")}
              className={`rounded-lg px-3 py-1.5 text-xs font-bold transition-all ${
                statusFilter === "next7Days"
                  ? "bg-blue-600 text-white shadow-sm"
                  : "bg-blue-50 text-blue-700 hover:bg-blue-100 dark:bg-blue-950/40 dark:text-blue-300 dark:hover:bg-blue-900/60 border border-blue-200 dark:border-blue-900/50"
              }`}
            >
              Por vencer · 7 días ({metrics.next7DaysCount + metrics.dueTodayCount})
            </button>

            <button
              type="button"
              aria-pressed={statusFilter === "paid"} onClick={() => setStatusFilter("paid")}
              className={`rounded-lg px-3 py-1.5 text-xs font-bold transition-all ${
                statusFilter === "paid"
                  ? "bg-emerald-600 text-white shadow-sm"
                  : "bg-emerald-50 text-emerald-700 hover:bg-emerald-100 dark:bg-emerald-950/40 dark:text-emerald-300 dark:hover:bg-emerald-900/60 border border-emerald-200 dark:border-emerald-900/50"
              }`}
            >
              Pagadas ({visibleInstallments.filter(inst => inst.status === "PAID").length})
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
              aria-label="Buscar cuotas"
              placeholder="Cliente, teléfono, acuerdo o unidad"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="h-9 w-full rounded-lg border border-slate-200 bg-slate-50 pl-9 pr-4 text-xs font-medium text-slate-800 placeholder-slate-400 focus:border-blue-500 focus:bg-white focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-200 dark:placeholder-slate-500"
            />
          </div>

          <select
            aria-label="Filtrar por proyecto"
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
            <div className="collections-installments">
              {filteredInstallments.map((inst) => {
                const agreement = agreements.find((a) => a.id === inst.agreementId);
                const lead = leads.find((l) => l.id === inst.leadId);
                const statusInfo = evaluateInstallmentStatus(inst);

                const whatsappUrl = lead?.phone && agreement
                  ? buildWhatsAppReminderUrl(lead.phone, lead, agreement, inst)
                  : null;

                return (
                  <article key={inst.id} className="collections-installment">
                    <div className="collections-installment-heading">
                      <div className="flex items-start gap-2.5 min-w-0">
                        <Avatar className="size-8 border border-slate-200 dark:border-slate-700">
                          <AvatarFallback className="bg-slate-100 text-xs font-bold text-slate-700 dark:bg-slate-800 dark:text-slate-200">
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
                          <p className="text-xs text-slate-400">
                            {lead?.phone || "Teléfono sin confirmar"}
                          </p>
                          <p>{agreement?.projectName || "Proyecto sin confirmar"} · {agreement?.propertyTitle || "Unidad sin confirmar"}</p>
                          <p>Cuota {inst.installmentNumber} de {agreement?.totalInstallments || "sin confirmar"}
                          </p>
                        </div>
                      </div>

                      <div>
                        <p className="collections-installment-amount">
                          {formatInstallmentAmount(inst.amountExpected, inst.currency)}
                          {inst.serverManaged && <span className="block text-xs font-normal">Saldo: {formatInstallmentAmount(inst.amountRemaining ?? 0, inst.currency)}</span>}
                        </p>
                        <p>Vencimiento: {formatDueDate(inst.dueDate)}</p>
                      </div>
                    </div>

                    <div className="collections-mobile-status">
                      <div>
                        {statusInfo.status === "OVERDUE" && (
                          <span className="inline-flex items-center gap-1 rounded-full bg-rose-100 px-2 py-0.5 text-xs font-bold text-rose-800 dark:bg-rose-950 dark:text-rose-300">
                            <AlertCircle className="size-3" />
                            Vencida hace {statusInfo.daysOverdue} {statusInfo.daysOverdue === 1 ? "día" : "días"}
                          </span>
                        )}
                        {statusInfo.status === "DUE_TODAY" && (
                          <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-bold text-amber-800 dark:bg-amber-950 dark:text-amber-300">
                            <Calendar className="size-3" />
                            Vence hoy
                          </span>
                        )}
                        {(statusInfo.status === "PENDING" || statusInfo.status === "PARTIALLY_PAID") && (
                          <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-700 dark:bg-slate-800 dark:text-slate-300">
                            <Clock aria-hidden="true" className="size-4" />{statusInfo.status === "PARTIALLY_PAID" ? "Pago parcial" : "Al día"}
                          </span>
                        )}
                        {statusInfo.status === "PAID" && (
                          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-bold text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
                            <CheckCircle2 aria-hidden="true" className="size-4" />Cobrada
                          </span>
                        )}
                      </div>

                      {statusInfo.status === "CANCELLED" && <span className="inline-flex items-center gap-1"><X aria-hidden="true" className="size-4" />Cancelada</span>}
                      <div className="collections-actions">
                        <InstallmentPaymentHistory installment={inst} />
                        <CollectionEmailPreview installment={inst} canWrite={canWrite} />
                        {whatsappUrl && inst.status !== "PAID" && (
                          <a
                            href={whatsappUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center gap-1 rounded-lg bg-blue-600 px-2.5 py-1 text-xs font-bold text-white"
                          >
                            <MessageCircle className="size-3.5" />
                            <span>WhatsApp</span>
                          </a>
                        )}

                        {inst.status !== "PAID" && inst.status !== "CANCELLED" && (
                          <button
                            type="button"
                            disabled={!canWrite || !inst.currency} onClick={() => handleOpenPaymentModal(inst)}
                            className="flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-bold text-slate-700 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300"
                          >
                            <CreditCard className="size-3.5 text-blue-600" />
                            <span>Registrar pago</span>
                          </button>
                        )}
                        <Link href={`/admin/leads/${inst.leadId}`} className="rounded-lg border"><ExternalLink aria-hidden="true" className="size-4" />Ver cliente</Link>
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          </>
        )}
      </div>

      <Dialog open={!!payingInstallment} onOpenChange={open => { if (!open && !saving) setPayingInstallment(null); }}>
        <DialogContent className="collections-dialog" showCloseButton={false}>
          <DialogTitle>{reviewPayment ? "Confirmar pago" : "Registrar pago"}</DialogTitle>
          <DialogDescription>{reviewPayment ? "Revisá todos los datos antes de registrar el cobro." : "Completá los datos del pago. Luego podrás revisarlos."}</DialogDescription>
          {payingInstallment && <>
            <div className="collections-payment-details">
              <strong>{leads.find(l => l.id === payingInstallment.leadId)?.name || "Cliente sin identificar"}</strong>
              <p>{paymentAgreement?.projectName || "Proyecto sin confirmar"} · {paymentAgreement?.propertyTitle || "Unidad sin confirmar"}</p>
              <p>Acuerdo {paymentAgreement?.publicId || payingInstallment.agreementId} · Cuota {payingInstallment.installmentNumber}{paymentAgreement ? ` de ${paymentAgreement.totalInstallments}` : ""}</p>
              <p>Vencimiento: {formatDueDate(payingInstallment.dueDate)}</p>
              <p>Importe: {formatInstallmentAmount(payingInstallment.amountExpected, payingInstallment.currency)}</p>
              <p>Saldo: {formatInstallmentAmount(payingInstallment.amountRemaining ?? Math.max(0, payingInstallment.amountExpected - (payingInstallment.amountPaid ?? 0)), payingInstallment.currency)}</p>
            </div>
            {reviewPayment ? <div className="collections-payment-details">
              <p><strong>Pago: {formatInstallmentAmount(paymentAmount, payingInstallment.currency)}</strong></p>
              <p>Medio: {{ TRANSFER: "Transferencia bancaria", CASH: "Efectivo en caja", DEPOSIT: "Depósito bancario", CHECK: "Cheque" }[paymentMethod]}</p>
              <p>Fecha de pago: {formatDueDate(getTodayDateString())}</p>
              <p>Referencia: {paymentReceipt || "S/N"}</p><p>Notas: {paymentNotes || "Sin notas"}</p>
              <p>Usuario: {session.user?.name || "Usuario actual"}</p>
              {isMockDataMode && <p>Demostración: se guarda solo en este navegador.</p>}
              <div className="collections-actions"><button disabled={saving} onClick={() => setReviewPayment(false)}>Volver a editar</button><button className="collections-cta" disabled={saving || !canWrite} onClick={handleConfirmPayment}>{saving ? "Guardando…" : "Confirmar pago"}</button></div>
            </div> : <form className="collections-payment-form" onSubmit={event => { event.preventDefault(); setReviewPayment(true); }}>
              <label>Monto ({payingInstallment.currency || "Moneda sin confirmar"})<input type="number" min="0.01" step="0.01" required max={payingInstallment.amountRemaining ?? Math.max(0, payingInstallment.amountExpected - (payingInstallment.amountPaid ?? 0))} value={paymentAmount} onChange={event => setPaymentAmount(Number(event.target.value))} /></label>
              <label>Medio de pago<select value={paymentMethod} onChange={event => setPaymentMethod(event.target.value as InstallmentPaymentMethod)}><option value="TRANSFER">Transferencia bancaria</option><option value="CASH">Efectivo en caja</option><option value="DEPOSIT">Depósito bancario</option><option value="CHECK">Cheque</option></select></label>
              <label>Recibo o referencia<input value={paymentReceipt} onChange={event => setPaymentReceipt(event.target.value)} /></label>
              <label>Notas (opcional)<input value={paymentNotes} onChange={event => setPaymentNotes(event.target.value)} /></label>
              <button className="collections-cta" type="submit" disabled={!canWrite || !payingInstallment.currency}>Revisar pago</button>
            </form>}
            <button disabled={saving} onClick={() => setPayingInstallment(null)}>Cancelar</button>
          </>}
        </DialogContent>
      </Dialog>

      {/* Modal: Nuevo Plan de Cobro */}
      <Dialog open={isNewAgreementModalOpen} onOpenChange={open => { if (!saving) setIsNewAgreementModalOpen(open); }}>
          <DialogContent className="collections-dialog collections-plan-dialog" showCloseButton={false}>
            <div className="flex items-center justify-between border-b border-slate-100 pb-3 dark:border-slate-800">
              <div className="flex items-center gap-2">
                <ReceiptText className="size-5 text-blue-600 dark:text-blue-400" />
                <DialogTitle>Nuevo plan de cobro</DialogTitle>
              </div>
              <button
                type="button"
                onClick={() => setIsNewAgreementModalOpen(false)}
                className="rounded-lg p-1 text-slate-400 hover:bg-muted hover:text-slate-600 dark:hover:bg-slate-800 dark:hover:text-slate-200"
              >
                <X className="size-4" /><span>Cerrar</span>
              </button>
            </div>

            <DialogDescription>Completá el plan y revisá sus datos antes de confirmarlo.</DialogDescription>
            <form onSubmit={handleCreateAgreement} className="collections-plan-form mt-4 space-y-4">
              <fieldset hidden={reviewAgreement} disabled={saving || reviewAgreement} className="space-y-4 min-w-0">
              <label className="block text-xs">Interés mensual sobre capital inicial (%)<input className="mt-1 block w-full rounded border p-2" type="number" min="0" max="100" step="0.0001" required value={monthlyRatePct} onChange={e => setMonthlyRatePct(Number(e.target.value))} /></label>
              <p className="text-xs text-slate-500">La primera cuota vence el mes siguiente a la fecha de inicio. Los días 29–31 se ajustan al último día del mes cuando corresponda.</p>
              {/* Lead Selector */}
              <div>
                <label htmlFor="collection-plan-1" className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                  Cliente / Lead Titular *
                </label>
                <select id="collection-plan-1"
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

              <p>Cliente seleccionado: {fullLead?.name || "Sin seleccionar"}</p>
              <p>Proyecto: {finalProjectName || "Sin confirmar"} · Unidad: {finalPropertyTitle || "Sin confirmar"}</p>
              {/* Proyecto y Lote */}
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                    Proyecto / Desarrollo
                  </label>
                  {modalLeadProjects.length > 1 ? (
                    <select
                      value={newAgrProjectName}
                      onChange={(e) => setNewAgrProjectName(e.target.value)}
                      className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-900 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-100"
                    >
                      <option value="" disabled>Seleccioná un proyecto</option>
                      {modalLeadProjects.map(p => <option key={p.id} value={p.title}>{p.title}</option>)}
                    </select>
                  ) : (
                    <input
                      type="text"
                      value={modalLeadProjects.length === 1 ? modalLeadProjects[0].title : ""}
                      disabled
                      placeholder="Sin proyecto asociado aún"
                      className="mt-1 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-medium text-slate-400 cursor-not-allowed dark:border-slate-800 dark:bg-slate-900/50"
                    />
                  )}
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                    Lote / Unidad Descriptiva
                  </label>
                  {modalLeadAssets.length > 1 || modalLeadProjects.length > 1 ? (
                    <select
                      value={newAgrPropertyTitle}
                      onChange={(e) => setNewAgrPropertyTitle(e.target.value)}
                      className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-900 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-100"
                    >
                      <option value="" disabled>Seleccioná un activo</option>
                      {modalLeadAssets
                        .filter(a => modalLeadProjects.length <= 1 || !newAgrProjectName || newAgrProjectName === modalLeadProjects.find(p => p.id === a.projectId)?.title)
                        .map(a => <option key={a.id} value={a.title}>{a.title}</option>)}
                    </select>
                  ) : (
                    <input
                      type="text"
                      value={modalLeadAssets.length === 1 ? modalLeadAssets[0].title : ""}
                      disabled
                      placeholder="Sin activo asociado aún"
                      className="mt-1 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-medium text-slate-400 cursor-not-allowed dark:border-slate-800 dark:bg-slate-900/50"
                    />
                  )}
                </div>
              </div>

              {/* Moneda y Modalidad */}
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label htmlFor="collection-plan-2" className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                    Moneda
                  </label>
                  <select id="collection-plan-2"
                    value={newAgrCurrency}
                    onChange={(e) => setNewAgrCurrency(e.target.value as "ARS" | "USD")}
                    className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-800 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-200"
                  >
                    <option value="ARS">Pesos Argentinos (ARS)</option>
                    <option value="USD">Dólares (USD)</option>
                  </select>
                </div>
                <div>
                  <label htmlFor="collection-plan-3" className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                    Modalidad
                  </label>
                  <select id="collection-plan-3"
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
                  <label htmlFor="collection-plan-4" className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                    Precio Total Pactado
                  </label>
                  <input id="collection-plan-4"
                    type="number"
                    value={newAgrTotalPrice}
                    onChange={(e) => setNewAgrTotalPrice(Number(e.target.value))}
                    className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-900 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-100"
                  />
                </div>
                <div>
                  <label htmlFor="collection-plan-5" className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                    Anticipo / Entrega Inicial
                  </label>
                  <input id="collection-plan-5"
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
                  <label htmlFor="collection-plan-6" className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                    Cantidad de Cuotas
                  </label>
                  <select id="collection-plan-6"
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
                  <label htmlFor="collection-plan-7" className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                    Día de Vencimiento Mensual
                  </label>
                  <select id="collection-plan-7"
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
                  <label htmlFor="collection-plan-8" className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                    Fecha de Inicio
                  </label>
                  <input id="collection-plan-8"
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
                  Se generarán {newAgrTotalInstallments} cuotas. Primera cuota:{" "}
                  <span className="font-extrabold">
                    {formatInstallmentAmount(
                      projectedFirstAmount,
                      newAgrCurrency
                    )}
                  </span>
                  . La cuota 1 vencerá el {formatDueDate(firstDueDateString)}. El servidor confirma el redondeo de las cuotas restantes.
                </p>
              </div>

              </fieldset>
              {reviewAgreement && <section className="collections-payment-details" aria-label="Confirmar plan de cobro">
                <h3>Confirmar plan de cobro</h3>
                <p>Cliente: {fullLead?.name}</p>
                <p>Plan: {finalProjectName} · {finalPropertyTitle || "Unidad sin confirmar"}</p>
                <p>Precio total: {formatInstallmentAmount(newAgrTotalPrice, newAgrCurrency)}</p>
                <p>Anticipo: {formatInstallmentAmount(newAgrDownPayment, newAgrCurrency)}</p>
                <p>Saldo financiado: {formatInstallmentAmount(Math.max(0, newAgrTotalPrice - newAgrDownPayment), newAgrCurrency)}</p>
                <p>Moneda: {newAgrCurrency} · {newAgrTotalInstallments} cuotas · {newAgrModality}</p>
                <p>Interés mensual: {monthlyRatePct}%</p>
                <p>Fecha de inicio: {formatDueDate(newAgrStartDate)}</p>
                <p>Cuota 1 de {newAgrTotalInstallments}: {formatInstallmentAmount(projectedFirstAmount, newAgrCurrency)}</p>
                <p>Primer vencimiento: {formatDueDate(firstDueDateString)}; luego el día {newAgrDueDay} de cada mes.</p>
                <button type="button" disabled={saving} onClick={() => setReviewAgreement(false)}>Volver a editar plan</button>
              </section>}
              <div className="collections-actions mt-6 flex items-center justify-end gap-2 pt-3 border-t border-slate-100 dark:border-slate-800">
                <button
                  type="button"
                  disabled={saving}
                  onClick={() => setIsNewAgreementModalOpen(false)}
                  className="rounded-lg border border-slate-200 px-3.5 py-2 text-xs font-semibold text-slate-600 hover:bg-muted dark:border-slate-800 dark:text-slate-300 dark:hover:bg-slate-800"
                >
                  Cancelar
                </button>
                <button disabled={saving || !canWrite} type="submit"
                  className="flex items-center gap-1.5 rounded-lg bg-blue-600 px-4 py-2 text-xs font-bold text-white shadow-sm hover:bg-blue-700 dark:bg-blue-600 dark:hover:bg-blue-500"
                >
                  <Plus className="size-3.5" />
                  <span>{saving ? "Generando plan…" : (reviewAgreement ? "Confirmar plan de cobro" : "Revisar plan de cobro")}</span>
                </button>
              </div>
            </form>
          </DialogContent>
      </Dialog>
      {/* Missing Interest Modal */}
      {noInterestModalOpen && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/60 backdrop-blur-sm p-4">
          <div className="w-full max-w-sm rounded-2xl border border-slate-200 bg-white p-6 shadow-xl dark:border-slate-800 dark:bg-slate-900 text-center">
            <h3 className="text-lg font-bold text-slate-900 dark:text-slate-100 mb-2">
              El lead no tiene ninguna propiedad
            </h3>
            <p className="text-sm text-slate-500 dark:text-slate-400 mb-6">
              Para generar un plan de cobranza correctamente, el cliente debería tener al menos un proyecto o unidad asignada en su ficha de intereses.
            </p>
            <div className="flex flex-col gap-3">
              <Link
                href={`/admin/leads/${newAgrLeadId}`}
                className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-bold text-white shadow-sm hover:bg-blue-700 w-full"
              >
                Ir a la ficha del lead para asignar
              </Link>
              <button
                type="button"
                onClick={() => setNoInterestModalOpen(false)}
                className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50 dark:border-slate-800 dark:text-slate-300 dark:hover:bg-slate-800 w-full"
              >
                Omitir por ahora
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
