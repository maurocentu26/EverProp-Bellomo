"use client";

import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { useCurrentSession } from "@/hooks/use-current-session";
import { loadBillingExport, billingExportCsv } from "@/lib/collections-api";
import { getTodayDateString } from "@/lib/installment-notifications";
import { isMockDataMode } from "@/lib/data-mode";

export function ExportBillingPayments() {
  const { user } = useCurrentSession();
  const [open, setOpen] = useState(false);
  const [from, setFrom] = useState(() => getTodayDateString().slice(0, 7) + "-01");
  const [to, setTo] = useState(getTodayDateString);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  if (isMockDataMode || !["TENANT_ADMIN", "SALES_MANAGER"].includes(user?.apiRole || "")) return null;
  return <>
    <button type="button" className="rounded-lg border px-3 py-2 text-xs" onClick={() => { setOpen(true); setMessage(null); setError(null); }}>Exportar pagos</button>
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Pagos para conciliación y facturación</DialogTitle>
          <DialogDescription>Descarga registros de pagos y sus anulaciones. Este archivo no emite facturas ni indica que un pago haya sido facturado.</DialogDescription>
        </DialogHeader>
        <form className="space-y-3" onSubmit={event => {
          event.preventDefault();
          if (busy) return;
          setBusy(true); setMessage(null); setError(null);
          void loadBillingExport(from, to).then(result => {
            if (!result.data.length) { setMessage("No hay pagos registrados en ese intervalo."); return; }
            const url = URL.createObjectURL(new Blob([billingExportCsv(result.data)], { type: "text/csv;charset=utf-8" }));
            const link = document.createElement("a"); link.href = url; link.download = `pagos-${from}-${to}.csv`; link.click();
            setTimeout(() => URL.revokeObjectURL(url), 1000);
            setMessage(`${result.meta.count} registros exportados. Las filas REVERSED corresponden a pagos anulados.`);
          }).catch(reason => setError(reason instanceof Error ? reason.message : "No se pudieron exportar los pagos.")).finally(() => setBusy(false));
        }}>
          <label className="block text-sm">Fecha de pago desde<input type="date" className="block w-full rounded border p-2" required value={from} max={to} onChange={event => setFrom(event.target.value)} /></label>
          <label className="block text-sm">Fecha de pago hasta<input type="date" className="block w-full rounded border p-2" required value={to} min={from} onChange={event => setTo(event.target.value)} /></label>
          {message && <p role="status" className="text-sm">{message}</p>}
          {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
          <button type="submit" disabled={busy} className="rounded bg-blue-800 px-3 py-2 text-white">{busy ? "Preparando…" : "Descargar CSV"}</button>
        </form>
      </DialogContent>
    </Dialog>
  </>;
}
