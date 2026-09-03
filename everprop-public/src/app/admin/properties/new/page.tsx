import { Suspense } from "react";
import NewPropertyForm from "@/components/admin/NewPropertyForm";

export default function NewPropertyPage() {
  return (
    <Suspense fallback={<div className="p-8 text-center text-slate-500">Cargando formulario...</div>}>
      <NewPropertyForm />
    </Suspense>
  );
}
