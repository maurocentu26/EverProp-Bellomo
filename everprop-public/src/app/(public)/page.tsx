"use client";

import { useState } from "react";
import PublicLayout from "@/components/public/PublicLayout";
import {
  Building2,
  ChevronDown,
  Home as HomeIcon,
  MapPin,
  Search,
  Sparkles,
  CalendarDays,
} from "lucide-react";

import { cn } from "@/lib/utils";

const propertyTabs = ["Comprar", "Alquilar", "Temporal"] as const;

const propertyTypes = [
  "Casa",
  "Departamento",
  "PH",
  "Oficina",
  "Terreno",
  "Local comercial",
] as const;

type PropertyTab = (typeof propertyTabs)[number];

export default function Home() {
  const [activeTab, setActiveTab] = useState<PropertyTab>("Comprar");

  return (
    <PublicLayout>
      <main className="min-h-screen bg-slate-950 text-white">
      <section className="relative isolate overflow-hidden">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(59,130,246,0.3),transparent_32%),linear-gradient(180deg,rgba(15,23,42,0.72)_0%,rgba(2,6,23,0.92)_100%)]" />
        <div className="absolute inset-0 opacity-30 bg-[linear-gradient(rgba(255,255,255,0.06)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.06)_1px,transparent_1px)] bg-size-[72px_72px] mask-[linear-gradient(to_bottom,white,transparent_88%)]" />

        <div className="relative mx-auto flex min-h-screen w-full max-w-7xl items-center px-4 py-16 sm:px-6 lg:px-8">
          <div className="grid w-full items-center gap-14 lg:grid-cols-[1.05fr_0.95fr] lg:gap-12">
            <div className="space-y-8">

              <div className="space-y-5">
                <h1 className="max-w-3xl text-4xl font-semibold tracking-tight text-white sm:text-5xl lg:text-7xl">
                  Encontrá tu próximo hogar con la tecnología de EverProp
                </h1>
                <p className="max-w-2xl text-base leading-8 text-slate-300 sm:text-lg">
                  Explorá propiedades con una experiencia rápida, clara y premium.
                  Buscá por modalidad, localidad y tipo de propiedad en un flujo
                  inspirado en los mejores portales del mercado.
                </p>
              </div>

              <div className="grid gap-4 sm:grid-cols-3">
                {[
                  { icon: HomeIcon, label: "Publicación inteligente", value: "+30%" },
                  { icon: Building2, label: "Cobertura multi-tenant", value: "100%" },
                  { icon: CalendarDays, label: "Disponibilidad 24/7", value: "Always on" },
                ].map((item) => (
                  <div
                    key={item.label}
                    className="rounded-3xl border border-white/10 bg-white/5 p-4 backdrop-blur-sm"
                  >
                    <item.icon className="mb-3 h-5 w-5 text-blue-400" />
                    <div className="text-2xl font-semibold text-white">{item.value}</div>
                    <div className="mt-1 text-sm text-slate-300">{item.label}</div>
                  </div>
                ))}
              </div>
            </div>

            <div className="relative">
              <div className="absolute -inset-6 rounded-4xl bg-blue-500/10 blur-3xl" />

              <div className="relative overflow-hidden rounded-4xl border border-white/10 bg-white/95 p-4 text-slate-950 shadow-2xl shadow-slate-950/40 sm:p-5">
                <div className="mb-5 flex items-center justify-between gap-4 rounded-3xl bg-slate-100/90 p-2">
                  {propertyTabs.map((tab) => {
                    const isActive = activeTab === tab;

                    return (
                      <button
                        key={tab}
                        type="button"
                        onClick={() => setActiveTab(tab)}
                        className={cn(
                          "flex-1 rounded-2xl px-4 py-3 text-sm font-semibold transition-all",
                          isActive
                            ? "bg-white text-slate-950 shadow-sm shadow-slate-900/5"
                            : "text-slate-500 hover:text-slate-900",
                        )}
                      >
                        {tab}
                      </button>
                    );
                  })}
                </div>

                <div className="space-y-4">
                  <div className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm shadow-slate-200/60">
                    <div className="grid gap-4 md:grid-cols-[1.2fr_1fr_0.8fr]">
                      <label className="group flex items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4 transition-colors focus-within:border-blue-500 focus-within:bg-white">
                        <MapPin className="h-5 w-5 text-slate-400 group-focus-within:text-blue-600" />
                        <div className="flex-1">
                          <div className="text-xs font-medium uppercase tracking-[0.16em] text-slate-500">
                            Localidad
                          </div>
                          <input
                            type="text"
                            placeholder="Ej: Palermo, CABA"
                            className="mt-1 w-full border-0 bg-transparent p-0 text-sm font-medium text-slate-950 outline-none placeholder:text-slate-400"
                          />
                        </div>
                      </label>

                      <label className="group flex items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4 transition-colors focus-within:border-blue-500 focus-within:bg-white">
                        <Building2 className="h-5 w-5 text-slate-400 group-focus-within:text-blue-600" />
                        <div className="flex-1">
                          <div className="text-xs font-medium uppercase tracking-[0.16em] text-slate-500">
                            Tipo de propiedad
                          </div>
                          <div className="mt-1 flex items-center gap-2">
                            <select className="w-full appearance-none border-0 bg-transparent p-0 text-sm font-medium text-slate-950 outline-none">
                              <option>Elegir tipo</option>
                              {propertyTypes.map((type) => (
                                <option key={type} value={type}>
                                  {type}
                                </option>
                              ))}
                            </select>
                            <ChevronDown className="h-4 w-4 shrink-0 text-slate-400" />
                          </div>
                        </div>
                      </label>

                      <button
                        type="button"
                        className="inline-flex items-center justify-center gap-2 rounded-2xl bg-blue-600 px-6 py-4 text-sm font-semibold text-white transition-all hover:-translate-y-0.5 hover:bg-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 focus:ring-offset-white"
                      >
                        <Search className="h-4 w-4" />
                        Buscar
                      </button>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-3 text-sm text-slate-500">
                    <span className="font-medium text-slate-700">Búsqueda activa:</span>
                    <span className="rounded-full border border-slate-200 bg-white px-3 py-1.5">{activeTab}</span>
                    <span className="rounded-full border border-slate-200 bg-white px-3 py-1.5">Localidad</span>
                    <span className="rounded-full border border-slate-200 bg-white px-3 py-1.5">Tipo de propiedad</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>
      </main>
    </PublicLayout>
  );
}
