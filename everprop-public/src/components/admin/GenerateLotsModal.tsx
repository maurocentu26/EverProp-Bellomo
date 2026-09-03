"use client";

import React, { useState, useEffect, useMemo } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import {
  Layers,
  Ruler,
  CheckCircle2,
  Sparkles,
  Zap,
  Droplets,
  Flame,
  Lightbulb,
  Building,
} from "lucide-react";
import {
  loadEverpropCatalog,
  generateLotsBatch,
  type GenerateLotsPayload,
} from "@/lib/everprop-api";
import { isMockDataMode } from "@/lib/data-mode";
import { projects as sampleProjects } from "@/data/admin-sample";
import type { Property, Project } from "@/data/admin-sample";

interface GenerateLotsModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultProjectId?: string;
  onSuccess?: (created: Property[]) => void;
}

const AVAILABLE_SERVICES = [
  { id: "agua", label: "Agua de Red", icon: Droplets },
  { id: "luz", label: "Electricidad", icon: Zap },
  { id: "alumbrado", label: "Alumbrado Público", icon: Lightbulb },
  { id: "cordon", label: "Cordón Cuneta", icon: Building },
  { id: "gas", label: "Gas Natural", icon: Flame },
];

export function GenerateLotsModal({
  open,
  onOpenChange,
  defaultProjectId,
  onSuccess,
}: GenerateLotsModalProps) {
  const [projects, setProjects] = useState<Project[]>([]);
  const [projectId, setProjectId] = useState<string>(defaultProjectId || "");
  const [sectorName, setSectorName] = useState("Manzana ");
  const [lotFrom, setLotFrom] = useState<number>(1);
  const [lotTo, setLotTo] = useState<number>(20);
  const [frente, setFrente] = useState<string>("10");
  const [fondo, setFondo] = useState<string>("25");
  const [areaM2, setAreaM2] = useState<string>("250");
  const [currency, setCurrency] = useState<"USD" | "ARS">("USD");
  const [price, setPrice] = useState<string>("15000");

  // Esquinas
  const [hasCorners, setHasCorners] = useState(true);
  const [cornerLotsStr, setCornerLotsStr] = useState("1, 20");
  const [cornerAreaM2, setCornerAreaM2] = useState<string>("280");
  const [ochavaM2, setOchavaM2] = useState<string>("4.79");
  const [cornerPrice, setCornerPrice] = useState<string>("17000");

  // Servicios
  const [selectedServices, setSelectedServices] = useState<string[]>([
    "agua",
    "luz",
    "alumbrado",
    "cordon",
  ]);

  const [description, setDescription] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    async function loadProjects() {
      if (!isMockDataMode) {
        try {
          const catalog = await loadEverpropCatalog();
          setProjects(catalog.projects);
          if (!projectId && catalog.projects.length > 0) {
            setProjectId(defaultProjectId || catalog.projects[0].id);
          }
        } catch {
          setProjects(sampleProjects);
          if (!projectId && sampleProjects.length > 0) {
            setProjectId(defaultProjectId || sampleProjects[0].id);
          }
        }
      } else {
        setProjects(sampleProjects);
        if (!projectId && sampleProjects.length > 0) {
          setProjectId(defaultProjectId || sampleProjects[0].id);
        }
      }
    }
    if (open) {
      loadProjects();
    }
  }, [open, defaultProjectId, projectId]);

  // Autocalcular superficie estándar si cambian frente y fondo
  const handleFrenteChange = (val: string) => {
    setFrente(val);
    const f = parseFloat(val);
    const fo = parseFloat(fondo);
    if (!isNaN(f) && !isNaN(fo) && f > 0 && fo > 0) {
      setAreaM2((f * fo).toString());
    }
  };

  const handleFondoChange = (val: string) => {
    setFondo(val);
    const f = parseFloat(frente);
    const fo = parseFloat(val);
    if (!isNaN(f) && !isNaN(fo) && f > 0 && fo > 0) {
      setAreaM2((f * fo).toString());
    }
  };

  // Cálculo de lotes a crear
  const totalCount = useMemo(() => {
    if (lotTo >= lotFrom && lotFrom > 0) {
      return lotTo - lotFrom + 1;
    }
    return 0;
  }, [lotFrom, lotTo]);

  const cornerLotsList = useMemo(() => {
    if (!hasCorners || !cornerLotsStr.trim()) return [];
    return cornerLotsStr
      .split(",")
      .map((s) => parseInt(s.trim(), 10))
      .filter((n) => !isNaN(n) && n >= lotFrom && n <= lotTo);
  }, [hasCorners, cornerLotsStr, lotFrom, lotTo]);

  const standardCount = totalCount - cornerLotsList.length;

  const toggleService = (id: string) => {
    setSelectedServices((prev) =>
      prev.includes(id) ? prev.filter((s) => s !== id) : [...prev, id]
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!projectId) {
      toast.error("Por favor seleccioná un desarrollo o loteo.");
      return;
    }

    if (!sectorName.trim()) {
      toast.error("Por favor ingresá el nombre de la manzana.");
      return;
    }

    if (totalCount <= 0 || totalCount > 300) {
      toast.error("El rango de lotes debe ser entre 1 y 300 unidades.");
      return;
    }

    const baseArea = parseFloat(areaM2);
    if (isNaN(baseArea) || baseArea <= 0) {
      toast.error("Ingresá una superficie en m² válida.");
      return;
    }

    const basePrice = price ? parseFloat(price) : undefined;
    const cPrice = cornerPrice ? parseFloat(cornerPrice) : undefined;
    const cArea = cornerAreaM2 ? parseFloat(cornerAreaM2) : undefined;
    const ochava = ochavaM2 ? parseFloat(ochavaM2) : undefined;

    setIsSubmitting(true);

    try {
      if (!isMockDataMode) {
        const selectedProj = projects.find((p) => p.id === projectId);
        const payload: GenerateLotsPayload = {
          projectId: selectedProj?.id || projectId,
          sectorName: sectorName.trim(),
          lotFrom,
          lotTo,
          area_m2: baseArea,
          frente_m: frente ? parseFloat(frente) : undefined,
          fondo_m: fondo ? parseFloat(fondo) : undefined,
          ochava_m2: hasCorners ? ochava : undefined,
          price: basePrice,
          currency,
          cornerLots: cornerLotsList,
          cornerPrice: hasCorners ? cPrice : undefined,
          cornerArea_m2: hasCorners ? cArea : undefined,
          services: selectedServices,
          description: description.trim() || undefined,
        };

        const result = await generateLotsBatch(payload);
        toast.success(`¡Éxito! ${result.properties.length} lotes creados en la base de datos.`);
        onSuccess?.(result.properties);
      } else {
        const mockCreated: Property[] = [];
        for (let i = lotFrom; i <= lotTo; i++) {
          const isCorner = cornerLotsList.includes(i);
          mockCreated.push({
            id: `mock-lote-${sectorName}-${i}`,
            companyId: "c1",
            title: `Lote ${i} - ${sectorName}`,
            price: isCorner && cPrice ? cPrice : (basePrice || 0),
            currency,
            operation: "sale",
            propertyType: "Lote",
            status: "available",
            sectorName: sectorName.trim(),
            unitNumber: i.toString(),
            area_m2: isCorner && cArea ? cArea : baseArea,
            city: "San Salvador de Jujuy",
            neighborhood: sectorName,
            description: `Lote ${i} en ${sectorName}`,
            bedrooms: 0,
            bathrooms: 0,
          });
        }
        toast.success(`¡Modo Mock! ${mockCreated.length} lotes generados localmente.`);
        onSuccess?.(mockCreated);
      }

      onOpenChange(false);
    } catch (err: any) {
      toast.error("Error al generar lotes: " + (err.message || "Error desconocido"));
    } finally {
      setIsSubmitting(false);
    }
  };

  const selectedProj = projects.find((p) => p.id === projectId);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[92vh] overflow-y-auto p-6 bg-white rounded-2xl shadow-2xl">
        <DialogHeader className="pb-3 border-b border-slate-100">
          <div className="flex items-center gap-3">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-600">
              <Layers className="size-5" />
            </span>
            <div>
              <DialogTitle className="text-xl font-bold text-slate-900 flex items-center gap-2">
                Generador de Lotes por Manzana
                <span className="text-[11px] font-semibold bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full">
                  Carga Masiva
                </span>
              </DialogTitle>
              <DialogDescription className="text-xs text-slate-500 mt-0.5">
                Creá de forma instantánea todos los lotes de una manzana con su numeración correlativa y medidas.
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-5 pt-2">
          {/* SECCIÓN 1: PROYECTO Y MANZANA */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 p-4 rounded-xl border border-slate-200 bg-slate-50/70">
            <div className="sm:col-span-2">
              <label className="block text-xs font-semibold text-slate-700">
                Desarrollo / Loteo <span className="text-rose-500">*</span>
              </label>
              <select
                value={projectId}
                onChange={(e) => setProjectId(e.target.value)}
                required
                className="mt-1 h-9 w-full rounded-lg border border-slate-200 bg-white px-3 text-xs text-slate-900 outline-none focus:border-blue-500"
              >
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} {p.location?.city ? `(${p.location.city})` : ""}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700">
                Identificador de Manzana <span className="text-rose-500">*</span>
              </label>
              <Input
                value={sectorName}
                onChange={(e) => setSectorName(e.target.value)}
                placeholder="ej: Manzana AP7 o B"
                required
                className="mt-1 h-9 border-slate-200 text-xs bg-white"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700">
                Desde Lote N° <span className="text-rose-500">*</span>
              </label>
              <Input
                type="number"
                min={1}
                value={lotFrom}
                onChange={(e) => setLotFrom(parseInt(e.target.value, 10) || 1)}
                required
                className="mt-1 h-9 border-slate-200 text-xs bg-white"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700">
                Hasta Lote N° <span className="text-rose-500">*</span>
              </label>
              <Input
                type="number"
                min={lotFrom}
                value={lotTo}
                onChange={(e) => setLotTo(parseInt(e.target.value, 10) || 1)}
                required
                className="mt-1 h-9 border-slate-200 text-xs bg-white"
              />
            </div>

            <div className="flex items-center justify-center pt-5 text-xs font-bold text-blue-700">
              Total: {totalCount} Lotes a crear
            </div>
          </div>

          {/* SECCIÓN 2: MEDIDAS Y PRECIO ESTÁNDAR */}
          <div className="space-y-3">
            <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
              <Ruler className="size-3.5 text-blue-600" /> Dimensiones y Precio Base (Lotes Estándar)
            </h4>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div>
                <label className="block text-[11px] font-semibold text-slate-600">Frente (metros)</label>
                <Input
                  type="number"
                  step="0.1"
                  value={frente}
                  onChange={(e) => handleFrenteChange(e.target.value)}
                  className="mt-1 h-9 border-slate-200 text-xs"
                />
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-600">Fondo (metros)</label>
                <Input
                  type="number"
                  step="0.1"
                  value={fondo}
                  onChange={(e) => handleFondoChange(e.target.value)}
                  className="mt-1 h-9 border-slate-200 text-xs"
                />
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-600">
                  Superficie (m²) <span className="text-rose-500">*</span>
                </label>
                <Input
                  type="number"
                  step="0.01"
                  value={areaM2}
                  onChange={(e) => setAreaM2(e.target.value)}
                  required
                  className="mt-1 h-9 border-slate-200 text-xs font-bold text-slate-800"
                />
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-600">Moneda y Precio</label>
                <div className="mt-1 flex gap-1">
                  <select
                    value={currency}
                    onChange={(e) => setCurrency(e.target.value as "USD" | "ARS")}
                    className="h-9 rounded-lg border border-slate-200 bg-white px-2 text-xs font-bold text-slate-800 outline-none"
                  >
                    <option value="USD">USD</option>
                    <option value="ARS">ARS</option>
                  </select>
                  <Input
                    type="number"
                    step="1"
                    placeholder="15000"
                    value={price}
                    onChange={(e) => setPrice(e.target.value)}
                    className="h-9 border-slate-200 text-xs font-bold"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* SECCIÓN 3: ESQUINAS Y OCHAVAS */}
          <div className="p-3.5 rounded-xl border border-slate-200 bg-amber-50/40 space-y-3">
            <div className="flex items-center justify-between">
              <label className="flex items-center gap-2 cursor-pointer text-xs font-bold text-slate-800">
                <input
                  type="checkbox"
                  checked={hasCorners}
                  onChange={(e) => setHasCorners(e.target.checked)}
                  className="rounded text-amber-600 focus:ring-amber-500 size-4"
                />
                Diferenciar Lotes de Esquina con Ochava
              </label>
              {hasCorners && (
                <span className="text-[11px] text-amber-700 font-semibold">
                  {cornerLotsList.length} esquinas configuradas
                </span>
              )}
            </div>

            {hasCorners && (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-1">
                <div>
                  <label className="block text-[11px] font-semibold text-slate-600">N° de Lotes Esquina</label>
                  <Input
                    value={cornerLotsStr}
                    onChange={(e) => setCornerLotsStr(e.target.value)}
                    placeholder="ej: 1, 20"
                    className="mt-1 h-9 border-slate-200 text-xs bg-white"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-slate-600">Ochava (m²)</label>
                  <Input
                    type="number"
                    step="0.01"
                    value={ochavaM2}
                    onChange={(e) => setOchavaM2(e.target.value)}
                    placeholder="4.79"
                    className="mt-1 h-9 border-slate-200 text-xs bg-white"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-slate-600">Superficie Total (m²)</label>
                  <Input
                    type="number"
                    step="0.01"
                    value={cornerAreaM2}
                    onChange={(e) => setCornerAreaM2(e.target.value)}
                    placeholder="280"
                    className="mt-1 h-9 border-slate-200 text-xs bg-white font-semibold"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-slate-600">Precio Esquina ({currency})</label>
                  <Input
                    type="number"
                    step="1"
                    value={cornerPrice}
                    onChange={(e) => setCornerPrice(e.target.value)}
                    placeholder="17000"
                    className="mt-1 h-9 border-slate-200 text-xs bg-white font-bold"
                  />
                </div>
              </div>
            )}
          </div>

          {/* SECCIÓN 4: SERVICIOS */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-2">Servicios incluidos en la Manzana</label>
            <div className="flex flex-wrap gap-2">
              {AVAILABLE_SERVICES.map((s) => {
                const Icon = s.icon;
                const active = selectedServices.includes(s.id);
                return (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => toggleService(s.id)}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-semibold transition-all ${
                      active
                        ? "border-blue-600 bg-blue-50 text-blue-700 shadow-sm"
                        : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
                    }`}
                  >
                    <Icon className="size-3.5" />
                    {s.label}
                    {active && <CheckCircle2 className="size-3 ml-1 text-blue-600" />}
                  </button>
                );
              })}
            </div>
          </div>

          {/* PREVISUALIZACIÓN */}
          <div className="p-3 rounded-xl border border-blue-200 bg-blue-50/60 text-xs space-y-1">
            <p className="font-bold text-blue-900 flex items-center gap-1.5">
              <Sparkles className="size-3.5 text-blue-600" /> Resumen de Generación
            </p>
            <p className="text-blue-800">
              Se crearán <strong>{totalCount} lotes</strong> correlativos en{" "}
              <strong>{sectorName}</strong> de <strong>{selectedProj?.name || "Desarrollo seleccionado"}</strong>:
            </p>
            <ul className="list-disc list-inside text-slate-700 pl-1 space-y-0.5">
              <li>
                {standardCount} lotes estándar de <strong>{areaM2} m²</strong> a{" "}
                <strong>{currency} {parseFloat(price || "0").toLocaleString("es-AR")}</strong>.
              </li>
              {hasCorners && cornerLotsList.length > 0 && (
                <li>
                  {cornerLotsList.length} esquinas (Lotes {cornerLotsList.join(", ")}) de{" "}
                  <strong>{cornerAreaM2} m²</strong> (c/ ochava de {ochavaM2} m²) a{" "}
                  <strong>{currency} {parseFloat(cornerPrice || "0").toLocaleString("es-AR")}</strong>.
                </li>
              )}
            </ul>
          </div>

          <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => onOpenChange(false)}
              className="h-9 px-4 text-xs font-semibold"
            >
              Cancelar
            </Button>
            <Button
              type="submit"
              size="sm"
              disabled={isSubmitting || totalCount <= 0}
              className="h-9 px-5 text-xs font-semibold bg-blue-600 hover:bg-blue-700 text-white gap-1.5 shadow-sm"
            >
              {isSubmitting ? (
                "Generando lotes en base de datos..."
              ) : (
                <>
                  <Layers className="size-3.5" /> Generar {totalCount} Lotes
                </>
              )}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
