"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { sampleInstallments, samplePaymentAgreements, type PaymentAgreement, type Installment } from "@/data/admin-sample";
import { loadInstallmentList, loadPaymentAgreementList } from "@/lib/collections-api";
import { deferEffectUpdate } from "@/lib/deferred-effect";
import { useAuth } from "@/lib/auth-context";
import { isMockDataMode } from "@/lib/data-mode";
import { FINAL_DELIVERY_ENABLED } from "@/lib/release-visibility";

export function useCollections(leadId?: string, companyId = "c1") {
  const { currentUser, isLoaded } = useAuth();
  const userId = currentUser?.id;
  const canWrite = isMockDataMode || ["TENANT_ADMIN", "SALES_MANAGER", "SALES_ADVISOR"].includes(currentUser?.apiRole || "");
  const [agreements, setAgreements] = useState<PaymentAgreement[]>([]);
  const [installments, setInstallments] = useState<Installment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const generation = useRef(0);
  const refresh = useCallback(async () => {
    if (!FINAL_DELIVERY_ENABLED || !isLoaded || !userId) return;
    const version = ++generation.current;
    try {
      const [nextAgreements, nextInstallments] = await Promise.all([
        loadPaymentAgreementList(samplePaymentAgreements, companyId, leadId),
        loadInstallmentList(sampleInstallments, companyId, leadId),
      ]);
      if (version !== generation.current) return;
      setAgreements(nextAgreements);
      setInstallments(nextInstallments);
      setError(null);
    } catch (reason) {
      if (version !== generation.current) return;
      setAgreements([]);
      setInstallments([]);
      setError(reason instanceof Error ? reason.message : "No se pudo cargar Cobranzas.");
    } finally {
      if (version === generation.current) setLoading(false);
    }
  }, [leadId, companyId, isLoaded, userId]);
  useEffect(() => {
    if (!FINAL_DELIVERY_ENABLED) return;
    const cancelInitial = deferEffectUpdate(() => {
      setAgreements([]);
      setInstallments([]);
      setLoading(true);
      void refresh();
    });
    const reload = () => { void refresh(); };
    const poll = window.setInterval(reload, 30_000);
    window.addEventListener("everprop_agreements_updated", reload);
    window.addEventListener("focus", reload);
    let channel: BroadcastChannel | undefined;
    try { channel = new BroadcastChannel("everprop_agreements"); channel.onmessage = reload; } catch { /* Polling remains available. */ }
    return () => {
      cancelInitial();
      // Invalidates requests issued by this effect, including its polling callbacks.
      // eslint-disable-next-line react-hooks/exhaustive-deps
      generation.current++;
      clearInterval(poll);
      window.removeEventListener("everprop_agreements_updated", reload);
      window.removeEventListener("focus", reload);
      channel?.close();
    };
  }, [refresh]);
  return { agreements, installments, setAgreements, setInstallments, loading, error, refresh, canWrite };
}
