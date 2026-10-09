"use client";

import { useState } from "react";
import { Mail } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { loadCollectionEmailPreview, type CollectionEmailPreview as Preview } from "@/lib/collections-api";
import type { Installment } from "@/data/admin-sample";

export function CollectionEmailPreview({ installment, canWrite }: { installment: Installment; canWrite: boolean }) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [error, setError] = useState<string | null>(null);
  async function refresh() {
    setLoading(true);
    setPreview(null);
    setError(null);
    try { setPreview(await loadCollectionEmailPreview(installment.id)); }
    catch (err) { setError(err instanceof Error ? err.message : "No se pudo preparar el correo."); }
    finally { setLoading(false); }
  }
  function download() {
    if (!preview?.eligible) return;
    const text = `Para: ${preview.recipient}\nAsunto: ${preview.subject}\n\n${preview.body}`;
    const url = URL.createObjectURL(new Blob([text], { type: "text/plain;charset=utf-8" }));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `borrador-cuota-${installment.installmentNumber}.txt`;
    anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  if (!installment.serverManaged || !canWrite || installment.status === "PAID" || installment.status === "CANCELLED") return null;
  return <>
    <button type="button" title="Preparar recordatorio por correo" className="flex items-center gap-1 rounded border px-2 py-1 text-xs" onClick={() => { setOpen(true); void refresh(); }}>
      <Mail className="size-3.5" /><span>Correo</span>
    </button>
    <Dialog open={open} onOpenChange={value => { setOpen(value); if (!value) { setPreview(null); setError(null); } }}>
      <DialogContent className="max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Recordatorio de cuota {installment.installmentNumber}</DialogTitle>
          <DialogDescription>Vista previa con el saldo actual. Abrir o descargar este borrador no envía un correo.</DialogDescription>
        </DialogHeader>
        {loading && <p role="status">Consultando el saldo…</p>}
        {error && <p role="alert">{error} <button type="button" onClick={() => void refresh()}>Reintentar</button></p>}
        {preview && <div className="space-y-3 text-sm">
          {!preview.eligible ? <p role="alert">{preview.reason}</p> : <>
            <p><strong>Para:</strong> {preview.recipient}</p>
            <p><strong>Remitente configurado:</strong> {preview.sender || "Pendiente de configurar"}</p>
            <p><strong>Asunto:</strong> {preview.subject}</p>
            <p className="whitespace-pre-wrap rounded border bg-muted p-3">{preview.body}</p>
            <p>El envío desde el panel todavía no está habilitado. Podés revisar el borrador con el equipo de cobranzas.</p>
            <button type="button" className="rounded bg-blue-800 px-3 py-2 text-white" onClick={download}>Descargar borrador</button>
          </>}
          <button type="button" className="block underline" onClick={() => void refresh()}>Actualizar saldo</button>
        </div>}
      </DialogContent>
    </Dialog>
  </>;
}
