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
import { loadEverpropCatalog, loadEverpropLeads, updateEverpropPropertyStatus } from "@/lib/everprop-api";
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
  const { isEngineer, isAdvisor, canUpdate } = useCurrentSession();
  const canManageProperty = canUpdate && !isAdvisor;
  const [property, setProperty] = useState<Property | null>(null);
  const [allProperties, setAllProperties] = useState<Property[]>([]);
  const [allLeads, setAllLeads] = useState<Lead[]>([]);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isLoaded, setIsLoaded] = useState(false);
  const [loadError, setLoadError] = useState("");

  // Carga inicial de datos
  useEffect(() => {
    let active = true;
    async function loadData() {
      if (!isMockDataMode) {
        try {
          const [catalog, apiLeads] = await Promise.all([
            loadEverpropCatalog(),
            loadEverpropLeads(),
          ]);
          if (!active) return;
          setAllProperties(catalog.properties);
          setAllLeads(apiLeads);

          const found = catalog.properties.find((item) => item.id === propertyId);
          setProperty(found ?? null);
          setLoadError(found ? "" : "La propiedad solicitada no existe o no está disponible para tu sesión.");
          setIsLoaded(true);
          return;
        } catch (e) {
          console.error("Error loading property from catalog:", e);
          if (!active) return;
          setProperty(null);
          setAllProperties([]);
          setAllLeads([]);
          setLoadError(e instanceof Error ? e.message : "No se pudo cargar la propiedad desde la API.");
          setIsLoaded(true);
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
      setIsLoaded(true);
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

  if (!isLoaded) return <div className="p-8 text-center text-slate-500 font-medium">Cargando propiedad…</div>;

  if (!property) return (
    <div className="rounded-2xl border border-rose-200 bg-rose-50 p-8 text-center text-sm font-medium text-rose-900" role="alert">
      {loadError || "Propiedad no encontrada."} No se muestran datos de demostración.
    </div>
  );

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
            {canManageProperty && (
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
                    { label: 'Superficie', val: `${property.area_m2 || "--"} m²`, icon: Ruler },
                    { label: 'Manzana', val: property.sectorName || "-", icon: Trees },
                    { label: 'Parcela', val: property.unitNumber || "-", icon: Building2 },
                    {
                      label: 'Ochava / Obs.',
                      val: property.description?.match(/OCH\.?\s*([0-9.,]+)\s*M2?/i)?.[1]
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
                    disabled={!canManageProperty}
                    onClick={async () => {
                      if (!isMockDataMode) {
                        try {
                          if (!property.version) throw new Error("La API no informó la versión de la propiedad. Recargá la página.");
                          const updated = await updateEverpropPropertyStatus(property.id, st, property.version);
                          setProperty(updated);
                          setAllProperties((current) => current.map((item) => item.id === updated.id ? updated : item));
                          toast.success(`Estado actualizado a ${st === 'available' ? 'Disponible' : st === 'reserved' ? 'Reservado' : 'Vendido'}`);
                        } catch (e: any) {
                          toast.error("Error al actualizar estado en API: " + e.message);
                        }
                      } else {
                        const updated = { ...property, status: st };
                        setProperty(updated);
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

            {canUpdate && !isEngineer && (
              <Button
                disabled={!isMockDataMode}
                onClick={() => document.getElementById("property-visit-manager")?.scrollIntoView({ behavior: "smooth", block: "start" })}
                className="w-full mt-5 bg-blue-600 hover:bg-blue-700 h-10 rounded-lg text-sm font-semibold"
                title={!isMockDataMode ? "Las visitas todavía no tienen persistencia en la API" : undefined}
              >
                  {isMockDataMode ? "Agendar Visita" : "Visitas no disponibles en API"}
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

      {canUpdate && !isEngineer && isMockDataMode && (
        <div id="property-visit-manager" className="scroll-mt-24 rounded-2xl border border-slate-200 bg-white overflow-hidden shadow-sm">
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

      {isEditModalOpen && property && canManageProperty && (
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
