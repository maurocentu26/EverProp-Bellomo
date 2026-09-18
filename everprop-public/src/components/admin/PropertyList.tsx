import Link from "next/link";
import type { Property } from "@/data/admin-sample";
import PropertyCard, { formatPropertyPrice } from "@/components/admin/PropertyCard";
import { propertyStatusLabel } from "@/lib/inventory-labels";
import { isMockDataMode } from "@/lib/data-mode";

type Props = {
  properties: Property[];
  readOnly?: boolean;
};

export default function PropertyList({ properties, readOnly = false }: Props) {
  const totalProperties = properties.length;
  const lotsOnly = properties.every(property => property.propertyType.toLowerCase() === "lote");

  return (
    <div className="@container min-w-0 mt-8 rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-card dark:text-card-foreground">
      <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3 sm:px-6 dark:border-slate-800">
        <div>
          <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Inventario de Lotes y Activos</h2>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            Mostrando {totalProperties} de {totalProperties} activos en cartera
          </p>
        </div>
        <span className="text-xs font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500">
          {readOnly ? "Sólo lectura" : ""}
        </span>
      </div>

      <div className="grid gap-3 p-4 @min-[60rem]:hidden">
        {properties.map((property) => <Link key={property.id} href={`/admin/properties/${property.id}`} className="min-w-0 rounded-xl border border-border bg-background p-4 focus-visible:outline-2 focus-visible:outline-blue-500">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <h3 className="min-w-0 font-semibold break-words">{property.title}</h3>
            <span className="text-xs font-semibold">{propertyStatusLabel(property.status)}</span>
          </div>
          <p className="mt-2 text-sm text-muted-foreground">{[property.sectorName && (/^(manzana|mz[. ]?)/i.test(property.sectorName) ? property.sectorName : `Manzana ${property.sectorName}`), property.area_m2 != null && `${property.area_m2.toLocaleString("es-AR", { maximumFractionDigits: 2 })} m²`].filter(Boolean).join(" · ")}</p>
          <p className="mt-2 font-semibold">{property.priceKnown === false ? 'Precio sin moneda confirmada' : formatPropertyPrice(property.price, property.currency)}</p>
          <span className="mt-3 block text-sm text-blue-600 dark:text-blue-300">Ver ficha completa →</span>
        </Link>)}
      </div>
      <div className="hidden overflow-x-auto @min-[60rem]:block">
        <table className="min-w-full table-fixed border-separate border-spacing-0 px-4 pb-4 pt-2 sm:px-6 sm:pb-6 sm:pt-4">
          <colgroup>
            <col className="w-[28%]" />
            <col className="w-[18%]" />
            <col className="w-[20%]" />
            <col className="w-[18%]" />
            <col className="w-[16%]" />
          </colgroup>

          <thead>
            <tr className="text-left text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
              <th className="px-4 py-3">{lotsOnly ? "Lote / Parcela" : "Activo / Unidad"}</th>
              <th className="px-4 py-3">{lotsOnly ? "Manzana" : "Sector"}</th>
              <th className="px-4 py-3">Superficie / Ochava</th>
              <th className="px-4 py-3">Precio</th>
              <th className="px-4 py-3">Estado</th>
            </tr>
          </thead>

          <tbody>
            {properties.map((property) => (
              <PropertyCard key={property.id} property={property} readOnly={readOnly} />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
