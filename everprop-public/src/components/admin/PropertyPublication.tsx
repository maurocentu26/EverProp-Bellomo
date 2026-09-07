"use client";
import { useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { canManageInventory } from "@/lib/demo-permissions";
import { demoCatalog, type DemoProperty } from "@/lib/demo-catalog";
import { EditPropertyModal } from "./EditPropertyModal";

export default function PropertyPublication({ property, onChange }: { property: DemoProperty; onChange?: (value: DemoProperty) => void }) {
  const { currentUser } = useAuth();
  const [current, setCurrent] = useState(property);
  const [busy, setBusy] = useState(false), [error, setError] = useState(""), [editing, setEditing] = useState(false);
  const permitted = canManageInventory(currentUser);
  const changed = (next: DemoProperty) => { setCurrent(next); onChange?.(next); window.dispatchEvent(new Event("demo-inventory-updated")); };
  async function toggle() {
    setBusy(true); setError("");
    try { changed(await demoCatalog("PATCH", { id: current.id, published: !current.published }) as DemoProperty); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "No se pudo guardar."); }
    finally { setBusy(false); }
  }
  return <div className="w-52 space-y-2">
    <p role="status" className={`inline-flex rounded-full px-2 py-1 text-xs font-semibold ${current.published ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-600"}`}>{current.published ? "Publicada" : "Oculta"}</p>
    <div className="grid grid-cols-[auto_1fr] items-center gap-x-3 gap-y-2">
      {permitted && <><button disabled={busy} onClick={() => void toggle()} className="col-span-2 min-h-11 rounded-lg border border-border bg-background px-3 font-semibold text-foreground transition-colors hover:bg-muted focus-visible:outline-2 focus-visible:outline-ring disabled:opacity-50">{busy ? "Guardando…" : current.published ? "Ocultar de la web" : "Publicar en la web"}</button><button onClick={() => setEditing(true)} className="min-h-11 rounded-lg border border-border bg-background px-3 text-foreground transition-colors hover:bg-muted focus-visible:outline-2 focus-visible:outline-ring">Editar</button></>}
      {current.published && <a className="inline-flex min-h-11 items-center whitespace-nowrap text-sm font-semibold text-blue-700 underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-ring" href={`http://127.0.0.1:3002/?propiedad=${encodeURIComponent(current.id)}#inmueble-${encodeURIComponent(current.id)}`} target="_blank" rel="noreferrer">Ver en la web</a>}
    </div>
    {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
    {editing && permitted && <EditPropertyModal open property={current} onOpenChange={setEditing} onSuccess={changed}/>}
  </div>;
}
