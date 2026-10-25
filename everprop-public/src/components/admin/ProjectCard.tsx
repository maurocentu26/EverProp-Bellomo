import Link from 'next/link';
import type { Project, Property } from '@/data/admin-sample';
import type { PublicMaterialProject } from '@/lib/bellomo-policy';
import { projectLocationLabel, projectStatusLabel, projectTypeLabel, projectUnitCounts, projectCountLabel } from '@/lib/project-labels';

export default function ProjectCard({ project, properties, material }: { project: Project; properties: Property[]; material?: PublicMaterialProject }) {
  const units = properties.filter(property => property.projectId === project.id);
  const cover = material?.assets.find(asset => asset.kind === 'photo') ?? material?.assets.find(asset => asset.kind === 'render');
  const coverUrl = cover?.url ?? project.coverImage ?? project.masterplanImage;
  return <article className="inventory-card project-card">
    {coverUrl && <div role="img" aria-label={project.name} className="project-cover" style={{ backgroundImage: `url(${JSON.stringify(coverUrl)})` }} />}
    <h2>{project.name}</h2>
    <p>{projectLocationLabel(project)}</p>
    <p>{projectTypeLabel(project.type)} · {projectStatusLabel(project.status)}</p>
    <p>{units.length} {units.length === 1 ? 'unidad cargada' : 'unidades cargadas'}</p>
    <ul className="project-counts" aria-label="Estado de las unidades">
      {projectUnitCounts(units).map((count, index) => <li key={index}><strong>{count}</strong> {projectCountLabel(count, index)}</li>)}
    </ul>
    <div className="inventory-actions"><Link className="inventory-cta" href={`/admin/desarrollos/${project.id}`}>Ver proyecto</Link></div>
  </article>;
}

