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

export function projectUnitCounts(properties: Property[]) {
  return ['available', 'reserved', 'sold'].map(status => properties.filter(property => property.status === status).length);
}

export function projectCountLabel(count: number, index: number) {
  return count === 1 ? ['disponible', 'reservada', 'vendida'][index] : ['disponibles', 'reservadas', 'vendidas'][index];
}
