"use client";

import { useCurrentSession } from "@/hooks/use-current-session";
import CalendarAgenda from "@/components/admin/CalendarAgenda";
import { AlertTriangle } from "lucide-react";

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

  return (
    <div className="max-w-[1400px] mx-auto pb-12">
      <CalendarAgenda />
    </div>
  );
}
