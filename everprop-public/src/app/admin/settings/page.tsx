"use client";
import Link from "next/link";
import { useCurrentSession } from "@/hooks/use-current-session";
import { ThemeToggle } from "@/components/theme/ThemeToggle";
import { PanelTextSizeControl } from "@/components/theme/PanelTextSize";
import { PushPreferences } from "@/components/admin/PushPreferences";
export default function SettingsPage() {
  const { user } = useCurrentSession();
  return <div className="mx-auto w-full max-w-3xl space-y-6 p-4 sm:p-6">
    <header><h1 className="text-2xl font-bold tracking-tight">Configuración</h1><p className="mt-2 text-sm text-muted-foreground">Preferencias para usar tu panel Bellomo.</p></header>
    <section className="rounded-2xl border border-border bg-card p-5">
      <h2 className="font-semibold">Tu cuenta</h2>
      <dl className="mt-4 grid gap-4 text-sm sm:grid-cols-2"><div><dt className="text-muted-foreground">Nombre</dt><dd className="mt-1 break-words font-medium">{user?.name}</dd></div><div><dt className="text-muted-foreground">Correo</dt><dd className="mt-1 break-all">{user?.email}</dd></div></dl>
    </section>
    <section className="rounded-2xl border border-border bg-card p-5">
      <h2 className="font-semibold">Apariencia y lectura</h2>
      <div className="mt-4 flex items-center justify-between gap-4 border-b border-border pb-4"><div><h3 className="text-sm font-medium">Modo claro u oscuro</h3><p className="mt-1 text-sm text-muted-foreground">Elegí el contraste que te resulte más cómodo.</p></div><ThemeToggle /></div>
      <div className="flex items-center justify-between gap-4 pt-4"><div><h3 className="text-sm font-medium">Tamaño del texto</h3><p className="mt-1 text-sm text-muted-foreground">Actual o Grande, un 20 % mayor.</p></div><PanelTextSizeControl /></div>
    </section>
    <PushPreferences />
    <Link href="/admin/notifications" className="inline-flex min-h-11 items-center rounded-xl border border-border px-4 text-sm font-semibold hover:bg-muted">Ver mis notificaciones</Link>
  </div>;
}
