"use client";

import { useEffect, useState } from "react";
import type { Lead } from "@/data/admin-sample";
import { loadEverpropLeads, updateEverpropLead } from "@/lib/everprop-api";
import { LeadAdvisorEditor } from "./LeadAdvisorEditor";

export function RotatorLeadQueue() {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [selected, setSelected] = useState<Lead | null>(null);
  const [search, setSearch] = useState("");
  const [unassigned, setUnassigned] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  async function refresh() {
    try { const data = await loadEverpropLeads(); setLeads(data); setError(""); }
    catch (e) { setError(e instanceof Error ? e.message : "No se pudieron cargar los leads."); }
    finally { setLoading(false); }
  }
  useEffect(() => {
    let active = true;
    void loadEverpropLeads().then(data => { if (active) setLeads(data); })
      .catch(e => { if (active) setError(e instanceof Error ? e.message : "No se pudieron cargar los leads."); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);
  const visible = leads.filter(lead => (!unassigned || !lead.agentId) && `${lead.name} ${lead.email ?? ""} ${lead.phone ?? ""}`.toLowerCase().includes(search.toLowerCase()));
  return <section className="space-y-4">
    <h1 className="text-2xl font-bold">Asignación de leads</h1>
    <p className="text-muted-foreground">Asigná o reasigná cada lead a un asesor comercial activo.</p>
    <div className="flex flex-wrap items-center gap-4">
      <input aria-label="Buscar leads" placeholder="Buscar por nombre, correo o teléfono" value={search} onChange={e => setSearch(e.target.value)} className="rounded-lg border p-2" />
      <label><input type="checkbox" checked={unassigned} onChange={e => setUnassigned(e.target.checked)} /> Sólo sin asignar</label>
      <button type="button" onClick={() => void refresh()} className="underline">Actualizar</button>
    </div>
    {error && <p role="alert" className="text-red-600">{error}</p>}
    {loading ? <p role="status">Cargando leads…</p> : <div className="overflow-x-auto rounded-xl border"><table className="w-full text-left text-sm">
      <thead><tr>{["Lead", "Contacto", "Asesor", "Acción"].map(label => <th key={label} className="p-4">{label}</th>)}</tr></thead>
      <tbody>{visible.map(lead => <tr key={lead.id} className="border-t"><td className="p-4">{lead.name}</td><td className="p-4">{lead.email}<br />{lead.phone}</td><td className="p-4">{lead.agentName || "Sin asignar"}</td><td className="p-4"><button type="button" className="font-semibold text-blue-600 underline" onClick={() => setSelected(lead)}>{lead.agentId ? "Cambiar asesor" : "Asignar asesor"}</button></td></tr>)}</tbody>
    </table>{visible.length === 0 && <p className="p-4">No hay leads para estos filtros.</p>}</div>}
    {selected && <LeadAdvisorEditor key={selected.id} leadName={selected.name} currentAgentId={selected.agentId} onClose={() => setSelected(null)} onSave={async agentId => {
      await updateEverpropLead(selected.id, { agentId: agentId || null });
      setSelected(null);
      await refresh();
    }} />}
  </section>;
}
