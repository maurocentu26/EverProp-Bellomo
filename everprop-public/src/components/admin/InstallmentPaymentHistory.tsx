"use client";
import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { loadPayments, reversePayment, type CollectionPayment } from "@/lib/collections-api";
import { useCollectionAction } from "@/hooks/use-collection-action";
import { useCurrentSession } from "@/hooks/use-current-session";
import { formatDueDate, formatInstallmentAmount } from "@/lib/installment-notifications";
import type { Installment } from "@/data/admin-sample";

export function InstallmentPaymentHistory({ installment }: { installment: Installment }) {
  const [open, setOpen] = useState(false);
  const [payments, setPayments] = useState<CollectionPayment[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const { saving, run } = useCollectionAction();
  const { user } = useCurrentSession();
  const canReverse = ["TENANT_ADMIN", "SALES_MANAGER"].includes(user?.apiRole || "");
  async function refresh() {
    setLoading(true);
    try { setPayments(await loadPayments(installment.id)); setError(null); }
    catch (err) { setError(err instanceof Error ? err.message : "No se pudo cargar el historial."); }
    finally { setLoading(false); }
  }
  if (!installment.serverManaged) return null;
  return <>
    <button type="button" className="rounded border px-2 py-1 text-xs" onClick={() => { setOpen(true); void refresh(); }}>Historial</button>
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Pagos de la cuota {installment.installmentNumber}</DialogTitle>
          <DialogDescription>Importe: {formatInstallmentAmount(installment.amountExpected, installment.currency)}. Las anulaciones conservan el registro original.</DialogDescription>
        </DialogHeader>
        {loading && <p role="status">Cargando pagos…</p>}
        {error && <p role="alert">{error} <button onClick={() => void refresh()}>Reintentar</button></p>}
        {!loading && !error && payments.length === 0 && <p>No hay pagos registrados.</p>}
        {payments.map(payment => <article key={payment.id} className="space-y-2 rounded border p-3 text-sm">
          <p className="font-semibold">{formatInstallmentAmount(Number(payment.amount), installment.currency)} · {formatDueDate(payment.paidAt)}</p>
          <p>{payment.method} · Comprobante {payment.receiptNumber}</p>
          {payment.notes && <p>{payment.notes}</p>}
          {payment.reversedAt ? <p>Anulado: {payment.reversalReason}</p> : canReverse && <button type="button" onClick={() => { setSelected(payment.id); setReason(""); }}>Anular pago</button>}
          {selected === payment.id && !payment.reversedAt && <form className="space-y-2" onSubmit={event => {
            event.preventDefault();
            void run(async () => { await reversePayment(payment.id, reason); setSelected(null); await refresh(); });
          }}>
            <label className="block">Motivo de anulación<input className="block w-full rounded border p-2" required minLength={3} maxLength={500} value={reason} onChange={event => setReason(event.target.value)} /></label>
            <button disabled={saving} type="submit" className="rounded bg-red-700 px-3 py-2 text-white">{saving ? "Anulando…" : "Confirmar anulación"}</button>
          </form>}
        </article>)}
      </DialogContent>
    </Dialog>
  </>;
}
