"use client";

import { useEffect, useState, useRef } from "react";
import Link from "next/link";
import { 
    ArrowLeft, Building2, MapPin, Ruler, BedDouble, Bath, Car, 
    ExternalLink, Edit3, Share2, Calendar, CheckCircle2, Trees
} from "lucide-react";
import type { Lead, Property, Visit } from "@/data/admin-sample";
import { leads as sampleLeads, properties as sampleProperties } from "@/data/admin-sample";
import { loadLeadList, loadPropertyList, saveLeadList, savePropertyList } from "@/lib/admin-storage";
import { isMockDataMode } from "@/lib/data-mode";
import { loadEverpropCatalog, loadEverpropLeads, loadEverpropVisits, createEverpropVisit, cancelEverpropVisit, updateEverpropPropertyStatus } from "@/lib/everprop-api";
import {
  createInterestForProperty,
  getInterestAssetIds,
  normalizeLeadInterests,
  syncLeadWithInterests,
} from "@/lib/lead-interests";
import { Button } from "@/components/ui/button";
import Badge from "@/components/ui/badge";
import { useCurrentSession } from "@/hooks/use-current-session";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import VisitManager from "@/components/admin/VisitManager";
import { EditPropertyModal } from "@/components/admin/EditPropertyModal";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { deferEffectUpdate } from "@/lib/deferred-effect";

type Props = {
  propertyId: string;
};

export default function PropertyDetailView({ propertyId }: Props) {
  const { isEngineer, isAdvisor } = useCurrentSession();
  const visitSectionRef = useRef<HTMLDivElement>(null);
  const [loadError, setLoadError] = useState("");
  const [savingStatus, setSavingStatus] = useState(false);
  const [loading, setLoading] = useState(true);
  const [property, setProperty] = useState<Property | null>(null);
  const [allProperties, setAllProperties] = useState<Property[]>([]);
  const [allLeads, setAllLeads] = useState<Lead[]>([]);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);

  // Carga inicial de datos
  useEffect(() => {
    let active = true;
    async function loadData() {
      if (!isMockDataMode) {
        try {
          const [catalog, apiLeads, visits] = await Promise.all([
            loadEverpropCatalog(),
            isEngineer ? Promise.resolve([]) : loadEverpropLeads(),
            isEngineer ? Promise.resolve([]) : loadEverpropVisits(),
          ]);
          if (!active) return;
          setAllProperties(catalog.properties);
          setAllLeads(apiLeads);

          const found = catalog.properties.find((item) => item.id === propertyId);
          setProperty(found ? { ...found, visits: visits.filter((visit) => visit.propertyId === propertyId) } : null);
          setLoading(false);
          return;
        } catch (e) {
          if (active) { setLoadError("No se pudo cargar la propiedad. Reintentá recargando la página."); setLoading(false); }
          return;
        }
      }
      if (!active) return;
      const initialProperties = loadPropertyList(sampleProperties, "c1");
      const initialLeads = loadLeadList(sampleLeads, "c1");

      setAllProperties(initialProperties);
      setAllLeads(initialLeads);

      const foundProperty = initialProperties.find((item) => item.id === propertyId);
      setProperty(foundProperty ?? null);
      setLoading(false);
    }
    void loadData();
    return () => {
      active = false;
    };
  }, [propertyId, isEngineer]);

  // --- Manejo de Visitas ---
  async function handleScheduleVisit(visit: Visit) {
    if (!property) return;
    if (!isMockDataMode) {
      await createEverpropVisit({ lead_id: visit.leadId, property_id: property.id,
        guest_name: visit.leadName, guest_phone: visit.phone, guest_email: visit.email,
        scheduled_at: visit.scheduledAt, notes: visit.notes });
      const visits = await loadEverpropVisits();
      setProperty({ ...property, visits: visits.filter((item) => item.propertyId === property.id) });
      return;
    }

    // 1. Buscamos al Lead para asegurar que tenemos su nombre correcto
    const targetLead = allLeads.find((l) => l.id === visit.leadId);
    const finalLeadName = visit.leadName || targetLead?.name || "Interesado";

    // 2. Preparamos el objeto de la visita con toda la data necesaria
    const nextVisit: Visit = { 
      ...visit, 
      propertyId: property.id, 
      propertyTitle: property.title,
      leadName: finalLeadName, // VITAL para la sidebar
      agentId: visit.agentId ?? targetLead?.agentId,
    };

    // 3. Actualizamos la PROPIEDAD actual y la lista global de propiedades
    const updatedProperty: Property = { 
      ...property, 
      visits: [...(property.visits ?? []), nextVisit] 
    };
    
    const nextProperties = allProperties.map((p) => 
      p.id === property.id ? updatedProperty : p
    );

    // 4. Actualizamos el LEAD (añadir interés y visita)
    let nextLeads = allLeads;
    if (targetLead) {
      const currentInterests = normalizeLeadInterests(targetLead, allProperties);
      const updatedInterests = getInterestAssetIds(currentInterests).includes(property.id)
        ? currentInterests
        : [...currentInterests, createInterestForProperty(targetLead, property)];

      const updatedLead: Lead = {
        ...syncLeadWithInterests(targetLead, updatedInterests, allProperties),
        visits: [...(targetLead.visits ?? []), nextVisit],
        lastActivity: new Date().toISOString()
      };

      nextLeads = allLeads.map((l) => (l.id === targetLead.id ? updatedLead : l));
    }

    // 5. Persistencia en Estados y LocalStorage
    // Primero los estados locales para feedback instantáneo
    setProperty(updatedProperty);
    setAllProperties(nextProperties);
    setAllLeads(nextLeads);

    // Luego el storage
    savePropertyList(nextProperties, property.companyId);
    saveLeadList(nextLeads, property.companyId);

    toast.success("Visita agendada con éxito");
  }

  async function handleDeleteVisit(visitId: string) {
    if (!property) return;
    if (!isMockDataMode) {
      await cancelEverpropVisit(visitId);
      setProperty({ ...property, visits: (property.visits ?? []).map((visit) => visit.id === visitId ? { ...visit, status: "cancelled" as const } : visit) });
      return;
    }

    // Eliminar de propiedades
    const updatedProperty = {
        ...property,
        visits: (property.visits ?? []).filter(v => v.id !== visitId)
    };
    const nextProperties = allProperties.map(p => p.id === property.id ? updatedProperty : p);

    // Eliminar de leads
    const nextLeads = allLeads.map(lead => ({
        ...lead,
        visits: (lead.visits ?? []).filter(v => v.id !== visitId)
    }));

    setProperty(updatedProperty);
    setAllProperties(nextProperties);
    setAllLeads(nextLeads);
    
    savePropertyList(nextProperties, property.companyId);
    saveLeadList(nextLeads, property.companyId);
    
    toast.info("Visita eliminada");
  }

  if (loadError) return <p role="alert" className="rounded-xl border border-amber-500/40 p-4">{loadError}</p>;
  if (loading) return <p role="status">Cargando propiedad…</p>;
  if (!property) return <div className="p-8 text-center text-slate-500 font-medium">Propiedad no encontrada.</div>;

  return (
    <div className="max-w-7xl mx-auto space-y-6 pb-20 animate-in fade-in duration-500">
      {/* Barra Superior */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <Link href="/admin/properties" className="group flex items-center gap-2 text-sm font-medium text-slate-500 hover:text-blue-600 transition-colors">
          <ArrowLeft className="h-4 w-4 group-hover:-translate-x-1 transition-transform" />
          Volver al inventario
        </Link>
        <div className="flex min-w-0 flex-wrap items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              className="gap-2 text-xs font-semibold"
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(window.location.href);
                  toast.success("Enlace interno copiado. Requiere acceso al panel.");
                } catch {
                  toast.error("No se pudo copiar el enlace. Copialo desde la barra del navegador.");
                }
              }}
            >
              <Share2 className="h-3.5 w-3.5" /> Copiar enlace interno
            </Button>
            {!isAdvisor && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setIsEditModalOpen(true)}
                className="gap-2 text-xs font-semibold text-blue-600 hover:text-blue-700 hover:bg-blue-50"
              >
                <Edit3 className="h-3.5 w-3.5" /> Editar
              </Button>
            )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* COLUMNA IZQUIERDA: Galería e Info */}
        <div className="lg:col-span-2 space-y-6">
          <div className="relative aspect-video w-full rounded-2xl overflow-hidden bg-slate-100 border border-slate-200">
             <div className="absolute inset-0 flex items-center justify-center text-slate-300">
                <Trees size={64} strokeWidth={1} className="text-emerald-500/50" />
             </div>
             <div className="absolute top-4 left-4 flex gap-2">
                <Badge className="px-3 py-1 rounded-full border-none shadow-md text-white font-bold text-xs tracking-wider bg-emerald-600">
                    EN VENTA
                </Badge>
                <Badge className="bg-white/90 backdrop-blur text-slate-900 border-none px-3 py-1 rounded-full shadow-md text-xs font-bold">
                    {property.sectorName || property.propertyType}
                </Badge>
             </div>
          </div>

          <div className="space-y-3">
            <h1 className="text-2xl sm:text-3xl font-bold text-slate-900 tracking-tight leading-tight">{property.title}</h1>
            <div className="flex items-center gap-2 text-slate-500 text-sm font-medium">
              <MapPin className="h-4 w-4 text-red-500" /> {property.neighborhood}, {property.city}
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 py-4 border-y border-slate-100">
                {[
                    { label: 'Superficie', val: `${property.area_m2?.toLocaleString("es-AR", { maximumFractionDigits: 2 }) ?? "--"} m²`, icon: Ruler },
                    { label: property.propertyType === 'Lote' ? 'Manzana' : 'Habitaciones', val: property.propertyType === 'Lote' ? property.sectorName || '-' : property.bedrooms || 'Sin informar', icon: Trees },
                    { label: property.propertyType === 'Lote' ? 'Parcela' : 'Baños', val: property.propertyType === 'Lote' ? property.unitNumber || '-' : property.bathrooms || 'Sin informar', icon: Building2 },
                    { 
                      label: property.propertyType === 'Lote' ? 'Ochava / Obs.' : 'Tipo',
                      val: property.propertyType !== 'Lote' ? property.propertyType : property.commercialFeatures?.land?.ochava_m2 != null ? `${property.commercialFeatures.land.ochava_m2.toLocaleString("es-AR")} m²` : property.description?.match(/OCH\.?\s*([0-9.,]+)\s*M2?/i)?.[1]
                        ? `Och. ${property.description?.match(/OCH\.?\s*([0-9.,]+)\s*M2?/i)?.[1]} m²` 
                        : 'Estándar', 
                      icon: MapPin 
                    }
                ].map((item, idx) => (
                    <div key={idx} className="flex items-center gap-3">
                        <div className="h-9 w-9 rounded-lg bg-slate-50 flex items-center justify-center text-slate-600">
                            <item.icon className="h-4 w-4" />
                        </div>
                        <div>
                            <p className="text-[10px] uppercase font-bold text-slate-400">{item.label}</p>
                            <p className="text-sm font-bold text-slate-700">{item.val}</p>
                        </div>
                    </div>
                ))}
            </div>
            {property.commercialFeatures?.land && <dl className="grid grid-cols-1 gap-3 sm:grid-cols-3 text-sm">
              {Object.entries({ Frente: property.commercialFeatures.land.frente_m != null ? `${property.commercialFeatures.land.frente_m.toLocaleString("es-AR")} m` : undefined, Fondo: property.commercialFeatures.land.fondo_m != null ? `${property.commercialFeatures.land.fondo_m.toLocaleString("es-AR")} m` : undefined, Padrón: property.commercialFeatures.land.padron }).filter(([, value]) => value != null).map(([label, value]) => <div key={label}><dt className="text-muted-foreground">{label}</dt><dd className="break-words font-semibold">{value}</dd></div>)}
            </dl>}
          </div>
        </div>

        {/* COLUMNA DERECHA: Precio y Sidebar de Visitas */}
        <div className="space-y-6">
          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm text-center">
            <span className="text-[11px] font-bold text-slate-400 uppercase tracking-widest">
              Precio de {property.operation === 'sale' ? 'Venta' : 'Alquiler'}
            </span>
            <div className="mt-1.5 text-2xl sm:text-3xl font-extrabold text-slate-900">
              {property.currency === 'ARS'
                ? `$ ${property.price.toLocaleString('es-AR')} ARS`
                : `USD ${property.price.toLocaleString('es-AR')}`}
            </div>

            {/* Selector de Estado en Vivo */}
            <div className="mt-4 pt-4 border-t border-slate-100 flex flex-col items-center">
              {property.status === "rented" && <p className="mb-2 text-sm font-semibold">Alquilado</p>}
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">
                Estado del Inmueble
              </span>
              <div className="flex w-full flex-wrap justify-center gap-1 rounded-xl bg-slate-100 p-1">
                {(['available', 'reserved', 'sold'] as const).map((st) => (
                  <button
                    key={st}
                    aria-pressed={property.status === st}
                    disabled={isEngineer || isAdvisor || savingStatus}
                    onClick={async () => {
                      const updated = { ...property, status: st };
                      if (savingStatus || isAdvisor || isEngineer) return;
                      setSavingStatus(true);
                      if (!isMockDataMode) {
                        try {
                          const persisted = await updateEverpropPropertyStatus(property.id, st, property.version);
                          setProperty(persisted);
                          toast.success(`Estado actualizado a ${st === 'available' ? 'Disponible' : st === 'reserved' ? 'Reservado' : 'Vendido'}`);
                        } catch (e: any) {
                          toast.error("No se pudo actualizar el estado: " + e.message);
                        } finally { setSavingStatus(false); }
                      } else {
                        const nextProps = allProperties.map(p => p.id === property.id ? updated : p);
                        setProperty(updated);
                        setAllProperties(nextProps);
                        setSavingStatus(false);
                        savePropertyList(nextProps, property.companyId);
                        toast.success("Estado actualizado");
                      }
                    }}
                    className={cn(
                      "min-h-11 flex-1 px-2 py-2 text-xs font-bold rounded-lg transition-colors capitalize",
                      property.status === st
                        ? st === 'available' ? "bg-emerald-600 text-white shadow-sm"
                        : st === 'reserved' ? "bg-amber-700 text-white shadow-sm"
                        : "bg-slate-700 text-white shadow-sm"
                        : "text-slate-600 hover:text-slate-900"
                    )}
                  >
                    {st === 'available' ? 'Disponible' : st === 'reserved' ? 'Reservado' : 'Vendido'}
                  </button>
                ))}
              </div>
            </div>

            {!isEngineer && (
              <Button onClick={() => { visitSectionRef.current?.scrollIntoView({ block: "start" }); visitSectionRef.current?.querySelector<HTMLInputElement>("input")?.focus({ preventScroll: true }); }} className="w-full mt-5 bg-blue-600 hover:bg-blue-700 text-white h-10 rounded-lg text-sm font-semibold">
                  Agendar Visita
              </Button>
            )}
          </div>

          {/* LISTA DE INTERESADOS (SIDEBAR) */}
          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-5 shadow-inner">
            <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-4 flex items-center gap-2">
              <Calendar className="h-3 w-3" /> Interesados Agendados
            </h3>
            
            <div className="space-y-3">
                {(!property.visits || property.visits.length === 0) ? (
                    <div className="text-center py-6 border-2 border-dashed border-slate-200 rounded-xl">
                        <p className="text-xs text-slate-400 italic">No hay visitas agendadas</p>
                    </div>
                ) : (
                    property.visits.map((visit) => (
                        <div key={visit.id} className="flex items-center gap-3 bg-white p-3 rounded-xl border border-slate-100 shadow-sm animate-in slide-in-from-right-2">
                            <Avatar className="h-8 w-8">
                                <AvatarFallback className="bg-blue-50 text-blue-600 text-[10px] font-black">
                                    {(visit.leadName || "I").substring(0,2).toUpperCase()}
                                </AvatarFallback>
                            </Avatar>
                            <div className="flex-1 min-w-0">
                                <p className="text-xs font-bold text-slate-900 truncate">{visit.leadName}</p>
                                <p className="text-[10px] text-slate-500">
                                    {new Date(visit.scheduledAt).toLocaleDateString('es-AR')} • {new Date(visit.scheduledAt).toLocaleTimeString('es-AR', {hour:'2-digit', minute:'2-digit'})}hs
                                </p>
                            </div>
                            <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0" />
                        </div>
                    ))
                )}
            </div>
          </div>
        </div>
      </div>

      {!isEngineer && (
        <div ref={visitSectionRef} className="scroll-mt-24 rounded-2xl border border-slate-200 bg-white overflow-hidden shadow-sm">
          <div className="p-6">
              <VisitManager
                  title="Calendario de Visitas"
                  subtitle="Gestioná quiénes van a ver esta propiedad."
                  visits={property.visits ?? []}
                  onSchedule={handleScheduleVisit}
                  onDelete={handleDeleteVisit}
                  leadOptions={allLeads}
              />
          </div>
        </div>
      )}

      {isEditModalOpen && property && (
        <EditPropertyModal
          open={isEditModalOpen}
          onOpenChange={setIsEditModalOpen}
          property={property}
          onSuccess={(updated) => {
            setProperty(updated);
            setAllProperties(allProperties.map((p) => (p.id === updated.id ? updated : p)));
          }}
        />
      )}
    </div>
  );
}
