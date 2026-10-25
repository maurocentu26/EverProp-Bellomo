import Link from "next/link";
import { CircleCheck, CirclePause, CircleHelp, CircleX, ArrowRight, Ruler } from "lucide-react";
import type { Property, Project } from "@/data/admin-sample";
import { inventoryPriceLabel, propertyStatusLabel } from "@/lib/inventory-labels";

type Props = { properties: Property[]; projects?: Project[]; readOnly?: boolean };

export default function PropertyList({ properties, projects = [], readOnly = false }: Props) {
  return <div className="inventory-cards" aria-label="Unidades del inventario">
    {properties.map(property => {
      const StatusIcon = property.status === 'available' ? CircleCheck : property.status === 'reserved' ? CirclePause : property.status === 'sold' || property.status === 'not_sellable' ? CircleX : CircleHelp;
      return <article key={property.id} className="inventory-card">
        <div className="inventory-card-heading">
          <h3>{property.unitNumber ?? property.title}</h3>
          <span className="inventory-status" data-status={property.status}><StatusIcon aria-hidden="true" size={20} />{propertyStatusLabel(property.status)}</span>
        </div>
        <p>{property.projectId ? projects.find(project => project.id === property.projectId)?.name ?? 'Proyecto sin identificar' : 'Activo independiente'}</p>
        <p>{property.propertyType}{property.sectorName ? ` · ${property.sectorName}` : ''}</p>
        <p className="inventory-surface"><Ruler aria-hidden="true" size={20} />{property.area_m2 == null ? 'Superficie sin informar' : `${property.area_m2.toLocaleString('es-AR', { maximumFractionDigits: 2 })} m²`}</p>
        <p className="inventory-price">{inventoryPriceLabel(property)}</p>
        <div className="inventory-actions"><Link href={`/admin/properties/${property.id}`} className="inventory-cta">Ver ficha <ArrowRight aria-hidden="true" size={20} /></Link></div>
        {readOnly && <p>Solo lectura</p>}
      </article>;
    })}
  </div>;
}
