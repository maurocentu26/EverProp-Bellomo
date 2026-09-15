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
