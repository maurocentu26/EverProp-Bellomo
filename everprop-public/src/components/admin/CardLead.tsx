"use client";

import React, { useState } from "react";
import Link from "next/link";
import { Phone, Mail } from "lucide-react";
import { cn } from "@/lib/utils";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { MOCK_USERS } from "@/data/auth-sample";
import type { LeadFollowUp } from "@/data/admin-sample";
import { LeadFollowUpStatus } from "@/components/admin/LeadFollowUpStatus";

type PropertyLite = {
  title?: string;
  bedrooms?: number;
  price?: number;
  currency?: string;
  operation?: "sale" | "rent" | "temporal";
};

type Props = {
  id: string;
  name: string;
  phone?: string; 
  email?: string;
  origin?: string;
  properties?: PropertyLite[]; // Corregido: Array de propiedades
  agentId?: string;
  followUpUpdatedAt?: string;
  followUps?: LeadFollowUp[];
  companyId?: string;
  draggable?: boolean;
  onDragStart?: (e: React.DragEvent, id: string) => void;
  className?: string;
};

function getInitials(name = "") {
  return name
    .split(" ")
    .map((n) => n[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

function formatPrice(value?: number, currency?: string) {
  if (typeof value !== "number") return "";
  try {
    const locale = currency === "USD" ? "en-US" : "es-AR";
    return new Intl.NumberFormat(locale, { 
        style: "currency", 
        currency: currency || "USD",
        maximumFractionDigits: 0 // Las inmobiliarias no suelen usar centavos
    }).format(value);
  } catch {
    return `${currency} ${value}`;
  }
}

export default function CardLead({ id, name, phone, email, origin, properties = [], agentId, followUpUpdatedAt, followUps = [], companyId, draggable, onDragStart, className }: Props): React.JSX.Element {
  const [showPhone, setShowPhone] = useState(false);
  const [showEmail, setShowEmail] = useState(false);

  // Lógica de múltiples propiedades
  const mainProperty = properties[0];
  const extraCount = properties.length - 1;
  const op = mainProperty?.operation;
  
  const assignedAgent = agentId ? MOCK_USERS.find((user) => user.id === agentId) : undefined;

  return (
    <>
      <Link
        href={`/admin/leads/${id}`}
        draggable={draggable}
        onDragStart={(e) => onDragStart?.(e, id)}
        className={cn(
          "relative block rounded-xl border border-slate-100 bg-white p-5 shadow-sm transition-all hover:shadow-md hover:border-blue-200", 
          className
        )}
      >
        {/* Badge de Operación (de la propiedad principal) */}
        {op && (
          <span className={cn(
            "absolute top-3 right-3 rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider shadow-sm",
            op === "sale" ? "bg-emerald-500 text-white" : "bg-blue-600 text-white"
          )}>
            {op === "sale" ? "Venta" : op === "rent" ? "Alquiler" : "Temp"}
          </span>
        )}

        <div className="flex flex-col gap-3">
          <div className="flex-1 w-full">
            {/* Nombre y Origen */}
            <div className="flex flex-col gap-1 pr-16">
              <div className="font-bold text-slate-900 leading-tight truncate">{name}</div>
              <div className="flex items-center gap-2">
                <span className="text-[10px] text-slate-400 font-medium uppercase tracking-tighter">Vía {origin || 'Web'}</span>
                {assignedAgent && (
                  <div className="flex items-center gap-1.5 bg-slate-50 border border-slate-100 px-1.5 py-0.5 rounded-full" title="Asesor Asignado">
                    <Avatar className="h-4 w-4">
                      <AvatarFallback className="bg-blue-600 text-[8px] font-bold text-white">
                        {assignedAgent.avatar || "?"}
                      </AvatarFallback>
                    </Avatar>
                    <span className="text-[9px] font-bold text-slate-600 pr-1">
                      {assignedAgent.name.split(" ")[0]}
                    </span>
                  </div>
                )}
              </div>
            </div>

            {/* Propiedad(es) de interés */}
            <div className="mt-3 text-xs text-slate-600 font-medium flex items-center gap-1">
              {mainProperty ? (
                <>
                  <span className="truncate max-w-[140px]">{mainProperty.title}</span>
                  <span className="text-slate-300">•</span>
                  <span>{mainProperty.bedrooms} amb.</span>
                  {extraCount > 0 && (
                    <span className="ml-1 inline-flex items-center rounded-md bg-blue-50 px-1.5 py-0.5 text-[10px] font-bold text-blue-700 border border-blue-100">
                      +{extraCount}
                    </span>
                  )}
                </>
              ) : (
                <span className="text-slate-400 italic font-normal">Sin propiedad</span>
              )}
            </div>

            <LeadFollowUpStatus leadId={id} companyId={companyId} followUps={followUps} legacyUpdatedAt={followUpUpdatedAt} compact className="mt-3" />

            {/* Precio y Acciones */}
            <div className="mt-4 flex flex-col gap-3 w-full pt-3 border-t border-slate-50">
              <div className="flex items-center justify-between w-full">
                <span className="text-sm font-black text-slate-900 tracking-tight">
                    {mainProperty ? formatPrice(mainProperty.price, mainProperty.currency) : "-"}
                </span>

              <div className="flex items-center gap-1.5">
                {/* Botón Teléfono */}
                <button
                  type="button"
                  aria-expanded={showPhone}
                  aria-label={`${showPhone ? "Ocultar" : "Mostrar"} teléfono de ${name}`}
                  onClick={(e) => {
                      e.preventDefault(); // Evita navegar al detalle del lead
                      e.stopPropagation();
                      setShowPhone(!showPhone);
                  }}
                  className={cn(
                      "flex items-center gap-2 px-2 py-1.5 rounded-lg text-xs transition-colors",
                      showPhone ? "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-100" : "text-slate-400 hover:bg-slate-100"
                  )}
                >
                  <Phone className="h-3.5 w-3.5" />
                  {showPhone && <span className="font-bold animate-in fade-in slide-in-from-left-1">{phone}</span>}
                </button>

                {/* Botón Email */}
                <button
                  type="button"
                  aria-expanded={showEmail}
                  aria-label={`${showEmail ? "Ocultar" : "Mostrar"} email de ${name}`}
                  onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      setShowEmail(!showEmail);
                  }}
                  className={cn(
                      "flex items-center gap-2 px-2 py-1.5 rounded-lg text-xs transition-colors",
                      showEmail ? "bg-blue-50 text-blue-700 ring-1 ring-blue-100" : "text-slate-400 hover:bg-slate-100"
                  )}
                >
                  <Mail className="h-3.5 w-3.5" />
                  {showEmail && <span className="font-bold animate-in fade-in slide-in-from-left-1">{email}</span>}
                </button>

                <Avatar className="h-7 w-7 ml-1 ring-2 ring-white">
                  <AvatarFallback className="bg-slate-100 text-slate-600 text-[9px] font-black">
                      {getInitials(name)}
                  </AvatarFallback>
                </Avatar>
              </div>
            </div>
          </div>
        </div>
      </div>
      </Link>
    </>
  );
}
