"use client";

import { useCurrentSession } from "@/hooks/use-current-session";
import CalendarAgenda from "@/components/admin/CalendarAgenda";
import { AlertTriangle } from "lucide-react";
import { isMockDataMode } from "@/lib/data-mode";

export default function AgendaPage() {
  const { isEngineer } = useCurrentSession();

  if (isEngineer) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh]">
        <AlertTriangle className="h-16 w-16 text-red-600 mb-4" />
        <h2 className="text-2xl font-black text-slate-900">Acceso Restringido</h2>
        <p className="text-slate-500 mt-2">Los ingenieros no tienen acceso a la agenda comercial.</p>
      </div>
    );
  }

  if (!isMockDataMode) {
    return (
      <section className="rounded-3xl border border-amber-200 bg-white p-8 shadow-sm" role="status">
        <h1 className="text-2xl font-bold text-slate-900">Agenda temporalmente deshabilitada</h1>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-600">
          Las visitas todavía no tienen endpoints de persistencia en la API. La agenda local se ocultó para evitar citas que aparenten quedar guardadas en el servidor.
        </p>
      </section>
    );
  }

  return (
    <div className="max-w-[1400px] mx-auto pb-12">
      <CalendarAgenda />
    </div>
  );
}
