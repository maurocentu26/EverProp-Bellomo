import Link from 'next/link';
import type { Project, Property } from '@/data/admin-sample';
import type { PublicMaterialProject } from '@/lib/bellomo-policy';
import { projectLocationLabel, projectStatusLabel, projectTypeLabel, projectUnitCounts, projectCountLabel } from '@/lib/project-labels';

export default function ProjectCard({ project, properties = [], material }: { project: Project; properties?: Property[]; material?: PublicMaterialProject }) {
  const units = properties.filter(property => property.projectId === project.id);
  const hasPrecomputedCounts = units.length === 0 && (project.availableUnitsCount != null || project.reservedUnitsCount != null || project.soldUnitsCount != null);
  const counts = hasPrecomputedCounts
    ? [project.availableUnitsCount ?? 0, project.reservedUnitsCount ?? 0, project.soldUnitsCount ?? 0]
    : projectUnitCounts(units);
  const totalLoaded = hasPrecomputedCounts
    ? (project.propertiesCount ?? counts[0] + counts[1] + counts[2])
    : units.length;
  const cover = material?.assets.find(asset => asset.kind === 'photo') ?? material?.assets.find(asset => asset.kind === 'render');
  const coverUrl = cover?.url ?? project.coverImage ?? project.masterplanImage;
  const soldCount = counts[2];
  return <article className="inventory-card project-card">
    {coverUrl && <div role="img" aria-label={project.name} className="project-cover" style={{ backgroundImage: `url(${JSON.stringify(coverUrl)})` }} />}
    <h2>{project.name}</h2>
    <p>{projectLocationLabel(project)}</p>
    <p>{projectTypeLabel(project.type)} · {projectStatusLabel(project.status)}</p>
    <p>{totalLoaded} {totalLoaded === 1 ? 'unidad cargada' : 'unidades cargadas'}</p>
    {totalLoaded > 0 && <><p className="project-progress-label">Vendidas: {soldCount} de {totalLoaded} unidades</p><div className="project-availability" role="meter" aria-label="Unidades vendidas del inventario cargado" aria-valuemin={0} aria-valuemax={totalLoaded} aria-valuenow={soldCount}><span style={{ width: `${soldCount / totalLoaded * 100}%` }} /></div></>}
    <ul className="project-counts" aria-label="Estado de las unidades">
      {counts.map((count, index) => <li key={index}><strong>{count}</strong> {projectCountLabel(count, index)}</li>)}
    </ul>
    <div className="inventory-actions"><Link className="inventory-secondary" href={`/admin/inventory-matrix?projectId=${encodeURIComponent(project.id)}`}>Ver matriz</Link><Link className="inventory-cta" href={`/admin/desarrollos/${project.id}`}>Ver proyecto</Link></div>
  </article>;
}
