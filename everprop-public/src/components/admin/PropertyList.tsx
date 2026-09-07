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
    <div className="inventory-responsive min-w-0 mt-8 rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-4 py-3 sm:px-6">
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

      <div className="overflow-x-auto rounded-b-2xl">
        <table className="inventory-table w-full table-auto border-separate border-spacing-0 pb-2">


          <thead>
            <tr className="text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
              <th scope="col" className="whitespace-nowrap px-4 py-3">Lote / Propiedad</th>
              <th scope="col" className="px-4 py-3">Operación</th>
              <th scope="col" className="px-4 py-3">Precio</th>
              <th scope="col" className="px-4 py-3">Ubicación</th>
              <th scope="col" className="px-4 py-3">Superficie</th>
              <th scope="col" className="px-4 py-3">Estado</th>
              {isLocalDemo && <th scope="col" className="px-4 py-3">Web pública</th>}
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
