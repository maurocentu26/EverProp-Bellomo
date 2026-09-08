import { LoaderCircle } from "lucide-react";

export function CollectionsLoading() {
  return (
    <section role="status" aria-live="polite" aria-busy="true" className="flex min-h-48 flex-col items-center justify-center gap-3 rounded-2xl border border-slate-200 bg-white p-6 text-slate-600 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300">
      <LoaderCircle aria-hidden="true" className="size-8 animate-spin text-blue-600 motion-reduce:animate-none" />
      <p className="text-sm font-medium">Cargando cobranzas y planes de pago…</p>
    </section>
  );
}
