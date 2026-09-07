"use client";

import Link from "next/link";
import { Globe, Building2, ShieldCheck } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { MOCK_USERS } from "@/data/auth-sample";
import { canManageInventory, canManageWebsite } from "@/lib/demo-permissions";

const linkClass = "inline-flex min-h-11 items-center justify-center rounded-lg border border-border px-4 py-2 font-semibold hover:bg-muted focus-visible:outline-2 focus-visible:outline-ring";

export default function DemoSettings() {
  const { currentUser, isLoaded } = useAuth();
  if (!isLoaded) return <p role="status">Cargando configuración…</p>;
  const admin = canManageWebsite(currentUser);
  const inventory = canManageInventory(currentUser);
  return <div className="mx-auto max-w-5xl space-y-6 pb-10 text-foreground">
    <header><h1 className="text-2xl font-bold sm:text-3xl">Configuración</h1><p className="mt-2 text-muted-foreground">Bellomo · Demo local</p></header>
    <section className="rounded-xl border border-border bg-card p-5 sm:p-6">
      <h2 className="flex items-center gap-2 text-xl font-semibold"><ShieldCheck className="size-5"/>Tu acceso</h2>
      <p className="mt-3 font-semibold">{currentUser?.name}</p><p className="text-muted-foreground">{currentUser?.title}</p>
      <p className="mt-3">{admin ? "Podés administrar propiedades y publicar cambios del contenido, las imágenes, el contacto y Bellomito." : inventory ? "Podés agregar, editar, publicar y ocultar propiedades. Administración modifica el contenido de la web." : "Podés consultar propiedades y su disponibilidad. Las modificaciones corresponden a Administración o Ingeniería."}</p>
    </section>
    <div className="grid gap-4 sm:grid-cols-2">
      <section className="space-y-4 rounded-xl border border-border bg-card p-5">
        <h2 className="flex items-center gap-2 text-lg font-semibold"><Building2 className="size-5"/>Propiedades</h2>
        <p>Consultá el inventario y verificá qué propiedades están publicadas.</p>
        <Link className={linkClass} href="/admin/properties">Abrir propiedades</Link>
      </section>
      <section className="space-y-4 rounded-xl border border-border bg-card p-5">
        <h2 className="flex items-center gap-2 text-lg font-semibold"><Globe className="size-5"/>Web de Bellomo</h2>
        <p>{admin ? "Los datos de contacto, las imágenes y los textos se editan juntos en Web pública." : "Revisá la web que ven los clientes."}</p>
        <div className="flex flex-wrap gap-2">{admin && <Link className={linkClass} href="/admin/web-publica">Administrar web pública</Link>}
        <a className={linkClass} href="http://127.0.0.1:3002/" target="_blank" rel="noreferrer">Ver web pública</a></div>
      </section>
    </div>
    {admin && <section className="space-y-4 rounded-xl border border-border bg-card p-5 sm:p-6">
      <h2 className="text-xl font-semibold">Usuarios y permisos de la demo</h2>
      <p className="text-muted-foreground">Estos perfiles están predefinidos. Para probar otro, cerrá sesión y elegilo en el ingreso de la demo. Los permisos no se editan desde esta pantalla.</p>
      <ul className="grid gap-3 sm:grid-cols-2">{MOCK_USERS.map(user=><li key={user.id} className="min-w-0 rounded-lg border border-border p-4">
        <h3 className="font-semibold">{user.name}</h3><p className="text-sm text-muted-foreground">{user.title}</p>
        <dl className="mt-3 space-y-2 text-sm"><div><dt className="font-semibold">Propiedades</dt><dd>{canManageInventory(user)?"Consultar, agregar, editar, publicar y ocultar":"Solo consultar"}</dd></div><div><dt className="font-semibold">Contenido de la web y Bellomito</dt><dd>{canManageWebsite(user)?"Editar y publicar":"Sin permiso de edición"}</dd></div></dl>
      </li>)}</ul>
    </section>}
  </div>;
}
