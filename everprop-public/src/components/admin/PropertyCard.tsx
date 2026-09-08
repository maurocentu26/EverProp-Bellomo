"use client";
import type { Property } from "@/data/admin-sample";
import { isLocalDemo } from "@/lib/demo-catalog";
import PropertyPublication from "./PropertyPublication";
import Link from "next/link";
import { useRouter } from "next/navigation";
import Badge from "@/components/ui/badge";

import { Building2, Trees } from "lucide-react";
import { cn } from "@/lib/utils";

export function formatPropertyPrice(value?: number, currency: "USD" | "ARS" = "USD") {
  if (value == null || isNaN(value) || value <= 0) return "-";
  try {
    if (currency === "ARS") {
      return `$ ${new Intl.NumberFormat("es-AR", { maximumFractionDigits: 0 }).format(value)} ARS`;
    }
    return `USD ${new Intl.NumberFormat("es-AR", { maximumFractionDigits: 2 }).format(value)}`;
  } catch {
    return `${value} ${currency}`;
  }
}

function getOperationLabel(operation: Property["operation"]) {
  return operation === "sale" ? "Venta" : operation === "rent" ? "Alquiler" : "Temporal";
}

type Props = {
  property: Property;
  readOnly?: boolean;
};

export default function PropertyCard({ property, readOnly = false }: Props) {
  const router = useRouter();
  const ochavaMatch = property.description?.match(/OCH\.?\s*([0-9.,]+)\s*M2?/i);
  const ochavaText = ochavaMatch ? `Ochava ${ochavaMatch[1]} m²` : null;

  const identity = (
    <>
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600 border border-emerald-100 dark:bg-emerald-950/60 dark:text-emerald-400 dark:border-emerald-900/60">
        <Trees className="h-5 w-5" />
      </div>

      <div className="min-w-0">
        <h3 className="truncate text-base font-semibold text-slate-900 dark:text-slate-100 group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">
          {property.unitNumber || property.title}
        </h3>
        <p className="mt-0.5 truncate text-xs text-slate-500 dark:text-slate-400">
          {property.neighborhood || property.city || "Jujuy"}
        </p>
      </div>
    </>
  );

  const handleRowClick = () => {
    if (!readOnly) {
      router.push(`/admin/properties/${property.id}`);
    }
  };

  return (
    <tr
      onClick={handleRowClick}
      onKeyDown={(e) => {
        if (e.target === e.currentTarget && !readOnly && (e.key === "Enter" || e.key === " ")) {
          e.preventDefault();
          handleRowClick();
        }
      }}
      tabIndex={readOnly ? undefined : 0}
      role={readOnly ? undefined : "button"}
      aria-label={readOnly ? undefined : `Ver detalle de ${property.unitNumber || property.title}`}
      className={cn(
        "group border-t border-slate-200 dark:border-slate-800 text-sm text-slate-700 dark:text-slate-300 transition-colors outline-none",
        !readOnly && "cursor-pointer hover:bg-slate-50/90 dark:hover:bg-slate-800/80 focus-visible:bg-slate-50 dark:focus-visible:bg-slate-800/80"
      )}
    >
      <td className="px-4 py-4 align-middle first:rounded-l-2xl last:rounded-r-2xl sm:px-5">
        <div className="flex min-w-0 items-center gap-4">{identity}</div>
      </td>

      <td className="px-4 py-4 align-middle sm:px-5 font-medium text-slate-900 dark:text-slate-200">
        <span className="inline-flex items-center px-2.5 py-1 rounded-lg text-xs font-semibold bg-slate-100 text-slate-800 border border-slate-200 dark:bg-slate-800 dark:text-slate-200 dark:border-slate-700 group-hover:border-blue-200 dark:group-hover:border-blue-800 transition-colors">
          {property.sectorName || "Manzana Única"}
        </span>
      </td>

      <td className="px-4 py-4 align-middle font-medium text-slate-700 dark:text-slate-300 sm:px-5">
        <div className="flex flex-col">
          <span className="font-semibold text-slate-900 dark:text-slate-100">{property.area_m2 ? `${property.area_m2} m²` : "-"}</span>
          {ochavaText && (
            <span className="text-[11px] text-amber-700 dark:text-amber-400 font-medium">{ochavaText}</span>
          )}
        </div>
      </td>

      <td className="px-4 py-4 align-middle font-semibold text-slate-900 dark:text-slate-100 sm:px-5">
        {formatPropertyPrice(property.price, property.currency)}
      </td>

      <td className="px-4 py-4 align-middle sm:px-5">
        <span
          className={cn(
            "inline-flex items-center px-2.5 py-1 rounded-full text-xs font-bold uppercase tracking-wider border",
            property.status === "available"
              ? "bg-emerald-100 text-emerald-800 border-emerald-200 dark:bg-emerald-950/80 dark:text-emerald-300 dark:border-emerald-800"
              : property.status === "reserved"
              ? "bg-amber-100 text-amber-800 border-amber-200 dark:bg-amber-950/80 dark:text-amber-300 dark:border-amber-800"
              : "bg-slate-100 text-slate-600 border-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:border-slate-700"
          )}
        >
          {property.status === "available"
            ? "Disponible"
            : property.status === "reserved"
            ? "No Vendible / Reserva"
            : "Vendido"}
        </span>
      </td>
      {isLocalDemo && <td onClick={e => e.stopPropagation()} onKeyDown={e => e.stopPropagation()} data-label="Web pública" className="px-4 py-4 align-middle">
        <PropertyPublication key={JSON.stringify(property)} property={property}/>
      </td>}
    </tr>
  );
}
