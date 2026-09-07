"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { 
    ArrowLeft, Building2, MapPin, Ruler, BedDouble, Bath, Car, 
    ExternalLink, Edit3, Share2, Calendar, CheckCircle2, Trees
} from "lucide-react";
import type { Lead, Property, Visit } from "@/data/admin-sample";
import { leads as sampleLeads, properties as sampleProperties } from "@/data/admin-sample";
import { loadLeadList, loadPropertyList, saveLeadList, savePropertyList } from "@/lib/admin-storage";
import { isMockDataMode } from "@/lib/data-mode";
import { isLocalDemo, demoCatalog } from "@/lib/demo-catalog";
import { loadEverpropCatalog, updateEverpropPropertyStatus } from "@/lib/everprop-api";
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
  const { isEngineer } = useCurrentSession();
  const [property, setProperty] = useState<Property | null>(null);
  const [allProperties, setAllProperties] = useState<Property[]>([]);
  const [allLeads, setAllLeads] = useState<Lead[]>([]);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);

  // Carga inicial de datos
  useEffect(() => {
    let active = true;
    async function loadData() {
      if (isLocalDemo) {
        try {
          const catalog = await demoCatalog() as Property[];
          if (active) { setAllProperties(catalog); setProperty(catalog.find(item => item.id === propertyId) ?? null); }
        } catch { toast.error("No se pudo cargar la propiedad demo."); }
        return;
      }
      if (!isMockDataMode) {
        try {
          const catalog = await loadEverpropCatalog();
          if (!active) return;
          setAllProperties(catalog.properties);
          const found = catalog.properties.find((item) => item.id === propertyId);
          setProperty(found ?? null);
          return;
        } catch (e) {
          console.error("Error loading property from catalog:", e);
        }
      }
      if (!active) return;
      const initialProperties = loadPropertyList(sampleProperties, "c1");
      const initialLeads = loadLeadList(sampleLeads, "c1");

      setAllProperties(initialProperties);
      setAllLeads(initialLeads);

      const foundProperty = initialProperties.find((item) => item.id === propertyId);
      setProperty(foundProperty ?? null);
    }
    void loadData();
    return () => {
      active = false;
    };
  }, [propertyId]);

  // --- Manejo de Visitas ---
  function handleScheduleVisit(visit: Visit) {
    if (!property) return;

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

  function handleDeleteVisit(visitId: string) {
    if (!property) return;

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

  if (!property) return <div className="p-8 text-center text-slate-500 font-medium">Propiedad no encontrada.</div>;

  if (isLocalDemo) return <section className="mx-auto max-w-3xl space-y-5 rounded-2xl border border-slate-200 bg-white p-6">
    <Link href="/admin/properties" className="text-blue-700 underline">Volver a Propiedades</Link>
    <p className="text-sm text-slate-500">Ficha demo · {property.published ? "Publicada en la web" : "Oculta en la web"}</p>
    <h1 className="text-3xl font-semibold text-slate-900">{property.title}</h1>
    <p>{property.neighborhood}, {property.city}</p>
    <p className="text-2xl">{property.currency} {property.price.toLocaleString("es-AR")}</p>
    <p>{property.propertyType} · {property.area_m2 || "—"} m² · {property.bedrooms} dormitorios</p>
    <p>{property.description}</p>
    <p className="text-sm text-slate-500">Podés publicar u ocultar esta propiedad desde la lista de Propiedades.</p>
  </section>;

  return (
    <div className="max-w-7xl mx-auto space-y-6 pb-20 animate-in fade-in duration-500">
      {/* Barra Superior */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <Link href="/admin#properties" className="group flex items-center gap-2 text-sm font-medium text-slate-500 hover:text-blue-600 transition-colors">
          <ArrowLeft className="h-4 w-4 group-hover:-translate-x-1 transition-transform" />
          Volver al inventario
        </Link>
        <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              className="gap-2 text-xs font-semibold"
              onClick={() => {
                if (typeof navigator !== "undefined" && navigator.clipboard) {
                  navigator.clipboard.writeText(window.location.href);
                  toast.success("Enlace copiado al portapapeles");
                }
              }}
            >
              <Share2 className="h-3.5 w-3.5" /> Compartir
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setIsEditModalOpen(true)}
              className="gap-2 text-xs font-semibold text-blue-600 hover:text-blue-700 hover:bg-blue-50"
            >
              <Edit3 className="h-3.5 w-3.5" /> Editar
            </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* COLUMNA IZQUIERDA: Galería e Info */}
        <div className="lg:col-span-2 space-y-6">
          <div className="relative aspect-video w-full rounded-2xl overflow-hidden bg-slate-100 border border-slate-200">
             <div className="absolute inset-0 flex items-center justify-center text-slate-300">
                <Building2 size={64} strokeWidth={1} />
             </div>
             <div className="absolute top-4 left-4 flex gap-2">
                <Badge className={cn(
                    "px-3 py-1 rounded-full border-none shadow-md text-white font-bold text-xs tracking-wider",
                    property.operation === 'sale' ? "bg-emerald-500" : "bg-blue-600"
                )}>
                    {property.operation === 'sale' ? 'EN VENTA' : 'ALQUILER'}
                </Badge>
                <Badge className="bg-white/90 backdrop-blur text-slate-900 border-none px-3 py-1 rounded-full shadow-md text-xs font-bold">
                    {property.propertyType}
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
                    { label: 'Superficie', val: `${property.area_m2 || "--"} m²`, icon: Ruler },
                    { label: 'Ambientes', val: property.bedrooms || "0", icon: BedDouble },
                    { label: 'Baños', val: property.bathrooms || "0", icon: Bath },
                    { label: 'Cochera', val: '1', icon: Car }
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
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">
                Estado del Inmueble
              </span>
              <div className="inline-flex rounded-xl bg-slate-100 p-1">
                {(['available', 'reserved', 'sold'] as const).map((st) => (
                  <button
                    key={st}
                    disabled={isEngineer}
                    onClick={async () => {
                      const updated = { ...property, status: st };
                      setProperty(updated);
                      if (!isMockDataMode) {
                        try {
                          await updateEverpropPropertyStatus(property.id, st);
                          toast.success(`Estado actualizado a ${st === 'available' ? 'Disponible' : st === 'reserved' ? 'Reservado' : 'Vendido'}`);
                        } catch (e: any) {
                          toast.error("Error al actualizar estado en API: " + e.message);
                        }
                      } else {
                        const nextProps = allProperties.map(p => p.id === property.id ? updated : p);
                        setAllProperties(nextProps);
                        savePropertyList(nextProps, property.companyId);
                        toast.success("Estado actualizado");
                      }
                    }}
                    className={cn(
                      "px-3 py-1.5 text-xs font-bold rounded-lg transition-all capitalize",
                      property.status === st
                        ? st === 'available' ? "bg-emerald-600 text-white shadow-sm"
                        : st === 'reserved' ? "bg-amber-500 text-white shadow-sm"
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
              <Button className="w-full mt-5 bg-blue-600 hover:bg-blue-700 h-10 rounded-lg text-sm font-semibold">
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
        <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden shadow-sm">
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
