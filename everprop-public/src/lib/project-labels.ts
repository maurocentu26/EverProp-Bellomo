import type { Project, Property } from '@/data/admin-sample';

export function projectLocationLabel(project: Project) {
  return [project.location.address, project.location.city, project.location.province]
    .map(part => part?.trim()).filter(part => part && !/^Sin (ciudad|provincia) informada$/i.test(part)).join(', ') || 'Ubicación sin informar';
}

export function projectStatusLabel(status: Project['status']) {
  return { planning: 'En planificación', pre_sale: 'Preventa', under_construction: 'En construcción', completed: 'Finalizado', available: 'Disponible', unknown: 'Sin estado informado' }[status];
}

export function projectTypeLabel(type: Project['type']) {
  return { land_development: 'Loteo', building: 'Edificio', commercial: 'Comercial' }[type];
}

// Display order of the status bar: what can still be offered comes first.
export const UNIT_STATES = ['sale', 'rent', 'available', 'reserved', 'rented', 'sold', 'not_sellable', 'not_marketed', 'unknown'] as const;
export type UnitState = typeof UNIT_STATES[number];
export const AVAILABLE_UNIT_STATES: readonly UnitState[] = ['sale', 'rent', 'available'];

const UNIT_STATE_LABELS: Record<UnitState, [string, string]> = {
  sale: ['en venta', 'en venta'],
  rent: ['en alquiler', 'en alquiler'],
  available: ['disponible', 'disponibles'],
  reserved: ['reservada', 'reservadas'],
  rented: ['alquilada', 'alquiladas'],
  sold: ['vendida', 'vendidas'],
  not_sellable: ['no vendible', 'no vendibles'],
  not_marketed: ['no comercializada', 'no comercializadas'],
  unknown: ['sin estado informado', 'sin estado informado'],
};

export function unitStateLabel(state: UnitState, count: number) {
  return UNIT_STATE_LABELS[state][count === 1 ? 0 : 1];
}

export function unitState(property: Pick<Property, 'status' | 'operation'>): UnitState {
  if (property.status === 'available') return property.operation === 'sale' ? 'sale' : property.operation === 'rent' ? 'rent' : 'available';
  return property.status && property.status in UNIT_STATE_LABELS ? property.status as UnitState : 'unknown';
}

// The code stays as loaded (12, 12A and 12B are different units). Only a lot's sector reads as a block: floors such as 1P do not.
export function unitDisplay(property: Pick<Property, 'unitNumber' | 'title' | 'propertyType' | 'sectorName' | 'description'>) {
  const sector = property.sectorName?.trim();
  const isLot = property.propertyType === 'Lote';
  const place = sector && isLot && !/^manzana\b|^\d+p$/i.test(sector) ? `Manzana ${sector}` : sector;
  const label = property.propertyType === 'Sin tipo' ? 'Unidad' : property.propertyType;
  return {
    name: property.unitNumber ? `${label} ${property.unitNumber}` : property.title,
    detail: [place, property.description?.trim()].filter(Boolean).join(' · '),
  };
}

const unitSortKey = (property: Pick<Property, 'unitNumber' | 'title' | 'sectorName'>) => `${property.sectorName ?? ''} ${property.unitNumber ?? property.title}`;
export function compareUnits(a: Pick<Property, 'unitNumber' | 'title' | 'sectorName'>, b: Pick<Property, 'unitNumber' | 'title' | 'sectorName'>) {
  return unitSortKey(a).localeCompare(unitSortKey(b), 'es', { numeric: true, sensitivity: 'base' });
}

export type ProjectUnitSummary = { total: number; available: number; counts: Record<UnitState, number> };

// Loaded units win over the API counters; whatever the counters do not explain stays visible as unknown.
export function projectUnitSummary(project: Project, units: Pick<Property, 'status' | 'operation'>[] = []): ProjectUnitSummary {
  const counts = Object.fromEntries(UNIT_STATES.map(state => [state, 0])) as Record<UnitState, number>;
  let total = units.length;
  if (units.length) {
    units.forEach(unit => { counts[unitState(unit)] += 1; });
  } else {
    counts.sale = project.availableSaleUnitsCount ?? 0;
    counts.rent = project.availableRentUnitsCount ?? 0;
    counts.available = Math.max((project.availableUnitsCount ?? 0) - counts.sale - counts.rent, 0);
    counts.reserved = project.reservedUnitsCount ?? 0;
    counts.rented = project.rentedUnitsCount ?? 0;
    counts.sold = project.soldUnitsCount ?? 0;
    counts.not_sellable = project.notSellableUnitsCount ?? 0;
    counts.not_marketed = project.notMarketedUnitsCount ?? 0;
    const known = UNIT_STATES.reduce((sum, state) => sum + counts[state], 0);
    total = Math.max(project.propertiesCount ?? 0, known);
    counts.unknown = total - known;
  }
  return { total, counts, available: counts.sale + counts.rent + counts.available };
}

export function availableUnitsLabel({ available, counts }: ProjectUnitSummary) {
  if (available === 0) return 'sin disponibles';
  if (counts.sale === available) return 'en venta';
  if (counts.rent === available) return 'en alquiler';
  return available === 1 ? 'disponible' : 'disponibles';
}
