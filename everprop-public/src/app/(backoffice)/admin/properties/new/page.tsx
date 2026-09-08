"use client";

import { useEffect, Suspense } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ShieldAlert, ArrowLeft } from "lucide-react";
import { toast } from "sonner";
import NewPropertyForm from "@/components/admin/NewPropertyForm";
import { useCurrentSession } from "@/hooks/use-current-session";
import { Button } from "@/components/ui/button";

export default function NewPropertyPage() {
  const router = useRouter();
  const { isAdvisor, isReady } = useCurrentSession();

  useEffect(() => {
    if (isReady && isAdvisor) {
      toast.error("Acceso no autorizado", {
        description: "Los asesores comerciales no tienen permisos para crear o modificar el catálogo de propiedades.",
        duration: 5000,
      });
      router.replace("/admin/properties");
    }
  }, [isReady, isAdvisor, router]);

  if (!isReady) {
    return (
      <div className="mx-auto w-full max-w-5xl px-4 py-8 sm:px-6">
        <div className="h-96 animate-pulse rounded-3xl bg-slate-100 dark:bg-slate-900" />
      </div>
    );
  }

  if (isAdvisor) {
    return (
      <div className="mx-auto flex min-h-[50vh] w-full max-w-xl flex-col items-center justify-center px-4 py-16 text-center">
        <div className="mb-4 flex size-14 items-center justify-center rounded-2xl bg-rose-50 text-rose-600 dark:bg-rose-950/40 dark:text-rose-400">
          <ShieldAlert className="size-7" />
        </div>
        <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100">
          Acceso Restringido
        </h1>
        <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
          Tu rol de asesor comercial no tiene permisos para dar de alta propiedades o unidades en el inventario. Redirigiendo al Catálogo de Propiedades...
        </p>
        <div className="mt-6">
          <Link href="/admin/properties">
            <Button variant="outline" className="gap-2">
              <ArrowLeft className="size-4" />
              Volver al Catálogo
            </Button>
          </Link>
        </div>
      </div>
    );
  }

  return (
    <Suspense fallback={<div className="p-8 text-center text-slate-500">Cargando formulario...</div>}>
      <NewPropertyForm />
    </Suspense>
  );
}
