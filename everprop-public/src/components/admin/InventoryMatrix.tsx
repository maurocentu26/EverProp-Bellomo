"use client";

import { useId, useState } from "react";
import type { Property } from "@/data/admin-sample";
import { inventoryPriceLabel, propertyStatusLabel } from "@/lib/inventory-labels";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { CircleCheck, CirclePause, CircleX, CircleHelp, ArrowLeft, ArrowRight } from "lucide-react";
import Link from "next/link";

const statusIcon = (status: Property['status']) => status === 'available' ? CircleCheck : status === 'reserved' ? CirclePause : status === 'sold' ? CircleX : CircleHelp;
const sectorLabel = (sector: string) => sector === 'Sin manzana informada' || /^manzana\b/i.test(sector) ? sector : `Manzana ${sector}`;
const countLabel = (count: number, status: Property['status']) => {
  const labels = { available: ['disponible', 'disponibles'], reserved: ['reservada', 'reservadas'], sold: ['vendida', 'vendidas'], rented: ['alquilada', 'alquiladas'], not_sellable: ['no vendible', 'no vendibles'], not_marketed: ['no comercializada', 'no comercializadas'], unknown: ['sin estado informado', 'sin estado informado'] };
  return `${count} ${labels[status ?? 'unknown'][count === 1 ? 0 : 1]}`;
};

export default function InventoryMatrix({ properties, isLoading }: { properties: Property[]; isLoading?: boolean }) {
  const filterId = useId();
  const [selectedUnit, setSelectedUnit] = useState<Property | null>(null);
  const [selectedSector, setSelectedSector] = useState('');
  const [detailsOpen, setDetailsOpen] = useState(false);
  const grouped: Record<string, Property[]> = {};
  for (const unit of properties) (grouped[unit.sectorName || 'Sin manzana informada'] ??= []).push(unit);
  const statuses = Array.from(new Set<Property['status']>(['available', 'reserved', 'sold', ...properties.map(unit => unit.status ?? 'unknown')]));
  const activeSector = selectedSector in grouped ? selectedSector : '';
  const land = selectedUnit?.commercialFeatures?.land;
  const services = selectedUnit?.services;
  const serviceNames = services ? [[services.water, 'Agua potable'], [services.electricity, 'Electricidad'], [services.gas, 'Gas natural'], [services.sewage, 'Cloacas'], [services.internet, 'Internet']].filter(([enabled]) => enabled).map(([, label]) => label).join(' · ') : '';

  return <div className="inventory-view lots-matrix" aria-busy={isLoading}>
    <div className="inventory-filters"><label htmlFor={filterId}>Manzana<select id={filterId} value={activeSector} onChange={event => setSelectedSector(event.target.value)}><option value="">Todas las manzanas</option>{Object.keys(grouped).map(sector => <option key={sector} value={sector}>{sectorLabel(sector)}</option>)}</select></label></div>
    <ul className="lots-legend" aria-label="Estados de los lotes">{statuses.map(status => { const Icon = statusIcon(status); return <li key={status} className="lots-status" data-status={status}><Icon size={20} aria-hidden="true" />{propertyStatusLabel(status)} · {isLoading ? 'Sin datos' : properties.filter(unit => (!activeSector || (unit.sectorName || 'Sin manzana informada') === activeSector) && (unit.status ?? 'unknown') === status).length}</li>; })}</ul>
    <div className="lots-content"><div className="lots-blocks">
    {isLoading ? <p role="status">Cargando lotes…</p> : Object.entries(grouped).filter(([sector]) => !activeSector || sector === activeSector).map(([sector, units]) => <section className="lots-block" key={sector} aria-label={sectorLabel(sector)}>
      <h3>{sectorLabel(sector)}</h3>
      <ul className="lots-counts" aria-label={`Resumen de ${sectorLabel(sector)}`}>{statuses.map(status => <li key={status}>{countLabel(units.filter(unit => (unit.status ?? 'unknown') === status).length, status)}</li>)}</ul>
      <div className="lots-scroll" role="region" aria-label={`Lotes de ${sectorLabel(sector)}`} tabIndex={0}><div className="lots-grid">{[...units].sort((a, b) => (a.unitNumber ?? a.title).localeCompare(b.unitNumber ?? b.title, 'es', { numeric: true })).map(unit => { const Icon = statusIcon(unit.status); return <button type="button" key={unit.id} className="lots-cell" data-status={unit.status ?? 'unknown'} aria-pressed={selectedUnit?.id === unit.id} aria-label={`${unit.unitNumber ?? unit.title} · ${sectorLabel(sector)} · ${propertyStatusLabel(unit.status)} · ${inventoryPriceLabel(unit)}`} onClick={() => setSelectedUnit(unit)}><strong>{unit.unitNumber ?? unit.title}</strong><Icon size={20} aria-hidden="true" /><span>Ver</span></button>; })}</div></div>
    </section>)}
    {!isLoading && !properties.length && <p className="inventory-empty">No hay unidades registradas para este proyecto.</p>}
    </div><aside className="lots-selected" aria-labelledby="lots-selected-title"><h2 id="lots-selected-title">Lote seleccionado</h2>{selectedUnit ? <><h3>{selectedUnit.unitNumber ?? selectedUnit.title} · {sectorLabel(selectedUnit.sectorName || 'Sin manzana informada')}</h3><p>{selectedUnit.area_m2 == null ? 'Superficie: Sin datos' : `${selectedUnit.area_m2.toLocaleString('es-AR')} m²`}</p><p className="inventory-price">{inventoryPriceLabel(selectedUnit)}</p><span className="lots-status" data-status={selectedUnit.status ?? 'unknown'}>{propertyStatusLabel(selectedUnit.status)}</span><Link href={`/admin/properties/${selectedUnit.id}`} className="inventory-cta">Ver ficha<ArrowRight size={20} aria-hidden="true" /></Link><button type="button" onClick={() => setDetailsOpen(true)}>Ver detalles</button></> : <p>Elegí un lote para ver su superficie, precio y disponibilidad.</p>}</aside></div>
    <Sheet open={detailsOpen && !!selectedUnit} onOpenChange={setDetailsOpen}>
      <SheetContent side="right" showCloseButton={false} className="admin-workspace inventory-view lots-sheet">
        {selectedUnit && <>
          <SheetHeader><button type="button" className="lots-back" onClick={() => setDetailsOpen(false)}><ArrowLeft size={20} aria-hidden="true" />Atrás</button><SheetTitle>{selectedUnit.unitNumber ?? selectedUnit.title}</SheetTitle><SheetDescription>{sectorLabel(selectedUnit.sectorName || 'Sin manzana informada')}</SheetDescription><span className="lots-status" data-status={selectedUnit.status ?? 'unknown'}>{(() => { const Icon = statusIcon(selectedUnit.status); return <Icon size={20} aria-hidden="true" />; })()}{propertyStatusLabel(selectedUnit.status)}</span></SheetHeader>
          <div className="lots-sheet-body"><p>Precio</p><p className="inventory-price">{inventoryPriceLabel(selectedUnit)}</p><dl><div><dt>Superficie</dt><dd>{selectedUnit.area_m2 == null ? 'Sin informar' : `${selectedUnit.area_m2.toLocaleString('es-AR')} m²`}</dd></div><div><dt>Medidas</dt><dd>{land?.frente_m == null ? 'Frente sin informar' : `Frente: ${land.frente_m} m`} · {land?.fondo_m == null ? 'Fondo sin informar' : `Fondo: ${land.fondo_m} m`}{land?.ochava_m2 != null && ` · Ochava: ${land.ochava_m2} m²`}</dd></div><div><dt>Servicios</dt><dd>{serviceNames || 'Sin servicios informados'}</dd></div></dl><Link href={`/admin/properties/${selectedUnit.id}`} className="inventory-cta">Ver ficha completa<ArrowRight size={20} aria-hidden="true" /></Link></div>
        </>}
      </SheetContent>
    </Sheet>
  </div>;
}
