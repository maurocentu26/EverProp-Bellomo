import Link from 'next/link';
import type { Project, Property } from '@/data/admin-sample';
import type { PublicMaterialProject } from '@/lib/bellomo-policy';
import { projectLocationLabel, projectStatusLabel, projectTypeLabel, projectUnitCounts, projectCountLabel } from '@/lib/project-labels';

export default function ProjectCard({ project, properties, material }: { project: Project; properties: Property[]; material?: PublicMaterialProject }) {
  const units = properties.filter(property => property.projectId === project.id);
  const cover = material?.assets.find(asset => asset.kind === 'photo') ?? material?.assets.find(asset => asset.kind === 'render');
  const coverUrl = cover?.url ?? project.coverImage ?? project.masterplanImage;
  const soldCount = units.filter(unit => unit.status === 'sold').length;
  return <article className="inventory-card project-card">
    {coverUrl && <div role="img" aria-label={project.name} className="project-cover" style={{ backgroundImage: `url(${JSON.stringify(coverUrl)})` }} />}
    <h2>{project.name}</h2>
    <p>{projectLocationLabel(project)}</p>
    <p>{projectTypeLabel(project.type)} · {projectStatusLabel(project.status)}</p>
    <p>{units.length} {units.length === 1 ? 'unidad cargada' : 'unidades cargadas'}</p>
    {units.length > 0 && <><p className="project-progress-label">Vendidas: {soldCount} de {units.length} unidades</p><div className="project-availability" role="meter" aria-label="Unidades vendidas del inventario cargado" aria-valuemin={0} aria-valuemax={units.length} aria-valuenow={soldCount}><span style={{ width: `${soldCount / units.length * 100}%` }} /></div></>}
    <ul className="project-counts" aria-label="Estado de las unidades">
      {projectUnitCounts(units).map((count, index) => <li key={index}><strong>{count}</strong> {projectCountLabel(count, index)}</li>)}
    </ul>
    <div className="inventory-actions"><Link className="inventory-secondary" href={`/admin/inventory-matrix?projectId=${encodeURIComponent(project.id)}`}>Ver matriz</Link><Link className="inventory-cta" href={`/admin/desarrollos/${project.id}`}>Ver proyecto</Link></div>
  </article>;
}

