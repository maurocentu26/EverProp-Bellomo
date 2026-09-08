"use client";
import { toast } from "sonner";

export function ExportLocalCollections() {
  function download() {
    try {
      const agreements = JSON.parse(localStorage.getItem("everprop:agreements:v1") || "[]");
      const installments = JSON.parse(localStorage.getItem("everprop:installments:v1") || "[]");
      if (!agreements.length) { toast.info("Este navegador no tiene acuerdos locales guardados."); return; }
      const blob = new Blob([JSON.stringify({ version: 1, approvedAgreementIds: [], leadMap: {}, propertyMap: {}, agreements, installments }, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a"); link.href = url; link.download = "cobranzas-locales-para-revisar.json"; link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      toast.success("Exportado para revisión. Los datos locales se conservan.");
    } catch { toast.error("No se pudieron exportar los datos locales."); }
  }
  return <button type="button" className="rounded-lg border px-3 py-2 text-xs" onClick={download}>Exportar datos locales</button>;
}
