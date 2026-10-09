"use client";

import { useEffect, useState } from "react";
import { useCurrentSession } from "@/hooks/use-current-session";
import { apiFetch } from "@/lib/everprop-api";
import { LoaderCircle, UserPlus } from "lucide-react";

type Member = { public_id: string; display_name: string; email: string; phone_e164: string; role_code: string; status: string };
export default function AdvisorsPage() {
  const { user } = useCurrentSession();
  const allowed = user?.apiRole === "TENANT_ADMIN";
  const [members, setMembers] = useState<Member[]>([]);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [roleSaving, setRoleSaving] = useState<string | null>(null);
  const [notice, setNotice] = useState("");
  const [activation, setActivation] = useState("");
  useEffect(() => {
    if (!allowed) return;
    let active = true;
    apiFetch<{data: Member[]}>("/api/v1/admin/users").then(r => { if (active) setMembers(r.data); }).catch(e => { if (active) setError(e.message); });
    return () => { active = false; };
  }, [allowed]);
  if (!allowed) return <p>Esta sección está disponible para el administrador.</p>;
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving) return;
    const form = event.currentTarget;
    const data = Object.fromEntries(new FormData(form));
    setSaving(true); setError(""); setActivation("");
    try {
      const result = await apiFetch<{data: {activationToken: string}}>("/api/v1/admin/users", {method: "POST", body: JSON.stringify(data)});
      setActivation(`${window.location.origin}/activar#${result.data.activationToken}`);
      form.reset();
      try {
        const list = await apiFetch<{data: Member[]}>("/api/v1/admin/users"); setMembers(list.data);
      } catch {
        setError("El usuario fue creado y su enlace está disponible. No se pudo actualizar la lista; recargá para verlo.");
      }
    } catch (e) { setError(e instanceof Error ? e.message : "No se pudo dar de alta al usuario."); }
    finally { setSaving(false); }
  }
  async function changeRole(event: React.FormEvent<HTMLFormElement>, member: Member) {
    event.preventDefault();
    if (roleSaving) return;
    const role = new FormData(event.currentTarget).get("role");
    setRoleSaving(member.public_id); setError(""); setNotice("");
    try {
      const result = await apiFetch<{data: Member}>(`/api/v1/admin/users/${member.public_id}/role`, {method: "PATCH", body: JSON.stringify({role})});
      setMembers(current => current.map(m => m.public_id === member.public_id ? result.data : m));
      setNotice(`Perfil de ${member.display_name} actualizado.`);
    } catch (e) { setError(e instanceof Error ? e.message : "No se pudo cambiar el perfil."); }
    finally { setRoleSaving(null); }
  }
  const inputClass = "mt-1 w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm";
  return <div className="mx-auto max-w-4xl space-y-6">
    <header><h1 className="text-2xl font-bold">Alta de usuarios</h1><p className="mt-2 text-sm text-muted-foreground">Administrá administradores, asesores comerciales y rotadores.</p></header>
    <form onSubmit={submit} className="grid gap-4 rounded-2xl border border-border bg-card p-6 sm:grid-cols-2">
      <label className="text-sm font-medium">Nombre<input name="firstName" required maxLength={79} autoComplete="given-name" className={inputClass}/></label>
      <label className="text-sm font-medium">Apellido<input name="lastName" required maxLength={79} autoComplete="family-name" className={inputClass}/></label>
      <label className="text-sm font-medium">Correo electrónico<input name="email" type="email" required autoComplete="email" className={inputClass}/></label>
      <label className="text-sm font-medium">Teléfono<input name="phone" type="tel" required pattern="\+[1-9][0-9]{7,14}" placeholder="+5493881234567" autoComplete="tel" className={inputClass}/><span className="text-xs text-muted-foreground">Incluí código de país, sin espacios.</span></label>
      <label className="text-sm font-medium">Perfil<select name="role" className={inputClass}><option value="SALES_ADVISOR">Asesor comercial</option><option value="ROTATOR">Rotador</option><option value="TENANT_ADMIN">Administrador</option></select><span className="text-xs text-muted-foreground">El rotador asigna leads a los asesores. El administrador gestiona usuarios y todas las áreas.</span></label>
      <div className="flex items-end"><button disabled={saving} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-blue-600 px-5 text-sm font-semibold text-white disabled:opacity-50">{saving ? <LoaderCircle className="size-4 animate-spin"/> : <UserPlus className="size-4"/>}{saving ? "Dando de alta…" : "Dar de alta"}</button></div>
    </form>
    {error && <p role="alert" className="rounded-xl border border-red-300 p-4 text-red-600">{error}</p>}
    {notice && <p role="status" className="rounded-xl border border-green-300 p-4">{notice}</p>}
    {activation && <section role="status" className="space-y-2 rounded-xl border border-green-300 p-4"><h2 className="font-semibold">Usuario creado</h2><p className="text-sm">Compartí este enlace con su titular para que elija su contraseña. Vence en 24 horas y puede utilizarse una sola vez.</p><input aria-label="Enlace de activación" readOnly value={activation} className={inputClass} onFocus={e => e.target.select()}/></section>}
    <section className="overflow-x-auto rounded-2xl border border-border"><table className="w-full text-left text-sm"><thead className="bg-muted"><tr>{["Nombre", "Contacto", "Perfil", "Estado"].map(h => <th key={h} className="p-4">{h}</th>)}</tr></thead><tbody>{members.map(m => <tr key={m.public_id} className="border-t border-border"><td className="p-4">{m.display_name}</td><td className="p-4">{m.email}<br/>{m.phone_e164}</td><td className="p-4">{m.public_id === user?.id || m.role_code === "SUPER_ADMIN" ? (m.role_code === "ROTATOR" ? "Rotador" : m.role_code === "SALES_ADVISOR" ? "Asesor" : "Administración") : <form onSubmit={e => changeRole(e, m)} className="flex items-center gap-2"><select key={m.role_code} name="role" aria-label={`Perfil de ${m.display_name}`} defaultValue={m.role_code} disabled={roleSaving !== null} className={inputClass}>{!["SALES_ADVISOR", "ROTATOR", "TENANT_ADMIN"].includes(m.role_code) && <option value={m.role_code}>{m.role_code}</option>}<option value="SALES_ADVISOR">Asesor comercial</option><option value="ROTATOR">Rotador</option><option value="TENANT_ADMIN">Administrador</option></select><button disabled={roleSaving !== null} className="rounded-lg bg-blue-600 px-3 py-2 text-white disabled:opacity-50">{roleSaving === m.public_id ? "Guardando…" : "Guardar"}</button></form>}</td><td className="p-4">{m.status === "ACTIVE" ? "Activo" : <button type="button" className="text-blue-600 underline" onClick={async () => { try { const r = await apiFetch<{data: {activationToken: string}}>(`/api/v1/admin/users/${m.public_id}/activation`, {method: "POST"}); setActivation(`${window.location.origin}/activar#${r.data.activationToken}`); } catch (e) { setError(e instanceof Error ? e.message : "No se pudo generar el enlace."); } }}>Obtener enlace de activación</button>}</td></tr>)}</tbody></table></section>
  </div>;
}
