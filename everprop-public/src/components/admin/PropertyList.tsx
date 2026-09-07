import { isLocalDemo } from "@/lib/demo-catalog";
import type { Property } from "@/data/admin-sample";
import PropertyCard from "@/components/admin/PropertyCard";
import { isMockDataMode } from "@/lib/data-mode";

type Props = {
  properties: Property[];
  readOnly?: boolean;
};

export default function PropertyList({ properties, readOnly = false }: Props) {
  const totalProperties = properties.length;

  return (
    <div className="mt-8 rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3 sm:px-6">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">Inventario de Lotes y Propiedades</h2>
          <p className="mt-1 text-sm text-slate-500">
            Mostrando {totalProperties} de {totalProperties} activos en cartera
          </p>
        </div>
        <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">
          {readOnly ? "Sólo lectura" : isMockDataMode ? "Modo Mock" : "Base de Datos · API"}
        </span>
      </div>

      <div className="overflow-x-auto">
        <table className="min-w-full table-fixed border-separate border-spacing-0 px-4 pb-4 pt-2 sm:px-6 sm:pb-6 sm:pt-4">
          <colgroup>
            <col className="w-[38%]" />
            <col className="w-[12%]" />
            <col className="w-[16%]" />
            <col className="w-[16%]" />
            <col className="w-[10%]" />
            <col className="w-[8%]" />
          </colgroup>

          <thead>
            <tr className="text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
              <th className="px-4 py-3">Lote / Propiedad</th>
              <th className="px-4 py-3">Operación</th>
              <th className="px-4 py-3">Precio</th>
              <th className="px-4 py-3">Ubicación</th>
              <th className="px-4 py-3">Superficie</th>
              <th className="px-4 py-3">Estado</th>
              {isLocalDemo && <th className="px-4 py-3">Web pública</th>}
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
