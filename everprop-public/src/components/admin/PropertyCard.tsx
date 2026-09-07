"use client";
import { isLocalDemo } from "@/lib/demo-catalog";
import PropertyPublication from "./PropertyPublication";
import Link from "next/link";
import Badge from "@/components/ui/badge";
import type { Property } from "@/data/admin-sample";
import { Building2, Trees } from "lucide-react";

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
  const isSale = property.operation === "sale";
  const isLot = property.propertyType === "Lote" || !!property.sectorName;

  const identity = (
    <>
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-slate-50 text-slate-500">
        {isLot ? <Trees className="h-5 w-5 text-emerald-600" /> : <Building2 className="h-5 w-5" />}
      </div>

      <div className="min-w-52 max-w-80">
        <h3 className="break-words text-base font-semibold text-slate-900">
          {property.sectorName ? `${property.sectorName} · ${property.unitNumber}` : property.title}
        </h3>
        <p className="mt-1 text-xs text-slate-500">
          {property.sectorName ? `${property.title} · ` : ""}
          {property.neighborhood || property.city || "Jujuy"}
        </p>
      </div>
    </>
  );

  return (
    <tr className="group border-t border-slate-200 text-sm text-slate-700 transition-colors hover:bg-muted/60 focus-within:bg-muted/60">
      <td className="px-4 py-4 align-middle">
        {readOnly ? (
          <div className="flex min-w-0 items-center gap-4">{identity}</div>
        ) : (
          <Link href={`/admin/properties/${property.id}`} className="flex min-w-0 items-center gap-4">{identity}</Link>
        )}
      </td>

      <td className="px-4 py-4 align-middle sm:px-5">
        <Badge variant={isSale ? "positive" : "default"}>{getOperationLabel(property.operation)}</Badge>
      </td>

      <td className="px-4 py-4 align-middle whitespace-nowrap font-semibold text-slate-900 sm:px-5">
        {formatPropertyPrice(property.price, property.currency)}
      </td>

      <td className="px-4 py-4 align-middle text-slate-600 sm:px-5">
        <div className="min-w-32 max-w-48 leading-5">{property.neighborhood && <span className="block">{property.neighborhood}</span>}<span className="block">{property.city}</span></div>
      </td>

      <td className="px-4 py-4 align-middle whitespace-nowrap font-medium text-slate-700 sm:px-5">
        {property.area_m2 ? `${property.area_m2} m²` : (property.bedrooms ? `${property.bedrooms} dorm.` : "-")}
      </td>

      <td className="px-4 py-4 align-middle sm:px-5">
        <span
          className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-bold uppercase tracking-wider ${
            property.status === "available"
              ? "bg-emerald-100 text-emerald-700"
              : property.status === "reserved"
              ? "bg-amber-100 text-amber-700"
              : "bg-slate-100 text-slate-500"
          }`}
        >
          {property.status === "available"
            ? "Disponible"
            : property.status === "reserved"
            ? "Reservado"
            : "Vendido"}
        </span>
      </td>
      {isLocalDemo && <td className="px-4 py-4 align-middle">
        <PropertyPublication key={JSON.stringify(property)} property={property}/>
      </td>}
    </tr>
  );
}
