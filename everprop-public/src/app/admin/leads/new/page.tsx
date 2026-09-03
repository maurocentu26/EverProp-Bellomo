"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { NewLeadDrawer } from "@/components/admin/NewLeadDrawer";

export default function NewLeadPage() {
  const router = useRouter();
  const [open, setOpen] = useState(true);

  return (
    <div className="py-12 flex flex-col items-center justify-center min-h-[60vh] text-center">
      <h2 className="text-xl font-bold text-slate-800">Formulario de Alta de Leads</h2>
      <p className="text-sm text-slate-500 mt-1 mb-4">El asistente lateral se encuentra activo.</p>
      <button 
        onClick={() => setOpen(true)}
        className="px-4 py-2 bg-blue-600 text-white rounded-lg font-semibold text-sm hover:bg-blue-700"
      >
        Abrir asistente de lead
      </button>
      
      <NewLeadDrawer 
        open={open} 
        onOpenChange={(isOpen) => {
          setOpen(isOpen);
          if (!isOpen) router.push("/admin/leads");
        }} 
      />
    </div>
  );
}
