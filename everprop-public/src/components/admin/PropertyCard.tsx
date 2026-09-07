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
  const ochavaMatch = property.description?.match(/OCH\.?\s*([0-9.,]+)\s*M2?/i);
  const ochavaText = ochavaMatch ? `Ochava ${ochavaMatch[1]} m²` : null;

  const identity = (
    <>
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600">
        <Trees className="h-5 w-5" />
      </div>

      <div className="min-w-0">
        <h3 className="truncate text-base font-semibold text-slate-900">
          {property.unitNumber || property.title}
        </h3>
        <p className="mt-0.5 truncate text-xs text-slate-500">
          {property.neighborhood || property.city || "Jujuy"}
        </p>
      </div>
    </>
  );

  return (
    <tr className="group border-t border-slate-200 text-sm text-slate-700 hover:bg-slate-50/70">
      <td className="px-4 py-4 align-middle first:rounded-l-2xl last:rounded-r-2xl sm:px-5">
        {readOnly ? (
          <div className="flex min-w-0 items-center gap-4">{identity}</div>
        ) : (
          <Link href={`/admin/properties/${property.id}`} className="flex min-w-0 items-center gap-4">{identity}</Link>
        )}
      </td>

      <td className="px-4 py-4 align-middle sm:px-5 font-medium text-slate-900">
        <span className="inline-flex items-center px-2.5 py-1 rounded-lg text-xs font-semibold bg-slate-100 text-slate-800 border border-slate-200">
          {property.sectorName || "Manzana Única"}
        </span>
      </td>

      <td className="px-4 py-4 align-middle font-medium text-slate-700 sm:px-5">
        <div className="flex flex-col">
          <span className="font-semibold text-slate-900">{property.area_m2 ? `${property.area_m2} m²` : "-"}</span>
          {ochavaText && (
            <span className="text-[11px] text-amber-700 font-medium">{ochavaText}</span>
          )}
        </div>
      </td>

      <td className="px-4 py-4 align-middle font-semibold text-slate-900 sm:px-5">
        {formatPropertyPrice(property.price, property.currency)}
      </td>

      <td className="px-4 py-4 align-middle sm:px-5">
        <span
          className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-bold uppercase tracking-wider ${
            property.status === "available"
              ? "bg-emerald-100 text-emerald-700"
              : property.status === "reserved"
              ? "bg-amber-100 text-amber-800"
              : "bg-slate-100 text-slate-500"
          }`}
        >
          {property.status === "available"
            ? "Disponible"
            : property.status === "reserved"
            ? "No Vendible / Reserva"
            : "Vendido"}
        </span>
      </td>
    </tr>
  );
}
