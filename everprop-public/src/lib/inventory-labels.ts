import type { Property } from '@/data/admin-sample';

export function propertyStatusLabel(status: Property['status']) {
  return {
    available: 'Disponible', reserved: 'Reservado', sold: 'Vendido', rented: 'Alquilado',
    not_sellable: 'No vendible', not_marketed: 'No comercializado', unknown: 'Sin estado informado',
  }[status ?? 'unknown'];
}

export function propertyOperationLabel(operation: Property['operation']) {
  return { sale: 'Venta', rent: 'Alquiler', temporal: 'Temporal', leasing: 'Leasing', unknown: 'Sin operación informada' }[operation];
}

// Preserve Inventory nulls while older consumers still use the legacy numeric fields.
export function inventoryPriceLabel(property: Property) {
  const price = property.inventoryPrice !== undefined ? property.inventoryPrice : property.price;
  const currency = property.inventoryCurrency !== undefined ? property.inventoryCurrency : property.currency;
  if (price == null) return 'Precio a consultar';
  const decimals = Number.isInteger(price) ? 0 : 2;
  const amount = price.toLocaleString('es-AR', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
  return currency == null ? `${amount} · Moneda sin confirmar` : `${currency} ${amount}`;
}
