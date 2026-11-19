import Link from 'next/link';
import type { Project, Property } from '@/data/admin-sample';
import type { PublicMaterialProject } from '@/lib/bellomo-policy';
import { availableUnitsLabel, projectStatusLabel, projectTypeLabel, projectUnitSummary, UNIT_STATES, unitStateLabel, type ProjectUnitSummary } from '@/lib/project-labels';

export function ProjectStateBar({ summary }: { summary: ProjectUnitSummary }) {
  const states = UNIT_STATES.filter(state => summary.counts[state] > 0);
  const parts = states.map(state => `${summary.counts[state]} ${unitStateLabel(state, summary.counts[state])}`);
  return <div role="img" aria-label={`${summary.total} ${summary.total === 1 ? 'unidad' : 'unidades'}: ${parts.join(', ')}`} className="project-state-bar">
    {states.map(state => <span key={state} data-state={state} style={{ width: `${summary.counts[state] / summary.total * 100}%` }} />)}
  </div>;
}

export default function ProjectCard({ project, properties = [], material }: { project: Project; properties?: Property[]; material?: PublicMaterialProject }) {
  const summary = projectUnitSummary(project, properties.filter(property => property.projectId === project.id));
  const cover = material?.assets.find(asset => asset.kind === 'photo') ?? material?.assets.find(asset => asset.kind === 'render');
  const coverUrl = cover?.url ?? project.coverImage ?? project.masterplanImage;
  const initials = project.name.split(/\s+/).filter(word => word.length > 2).slice(0, 2).map(word => word[0]).join('') || project.name.slice(0, 2);
  return <article className="project-row">
    <div className="project-row-main">
      {coverUrl
        ? <div role="img" aria-label={`Portada de ${project.name}`} className="project-thumb" style={{ backgroundImage: `url(${JSON.stringify(coverUrl)})` }} />
        : <div aria-hidden="true" className="project-thumb">{initials}</div>}
      <div className="project-row-title">
        <h2>{project.name}</h2>
        <p className="project-meta">{project.location.city}</p>
        <p className="project-tags"><span className="project-detail-status">{projectStatusLabel(project.status)}</span> <span className="project-meta">{projectTypeLabel(project.type)}</span></p>
      </div>
    </div>
    <div className="project-row-states">
      {summary.total > 0 ? <>
        <p className="project-meta">{summary.total.toLocaleString('es-AR')} {summary.total === 1 ? 'unidad' : 'unidades'}</p>
        <ProjectStateBar summary={summary} />
        <ul className="project-legend" aria-label="Estado de las unidades">
          {UNIT_STATES.filter(state => summary.counts[state] > 0).map(state => <li key={state}><span aria-hidden="true" className="project-dot" data-state={state} /><span><strong>{summary.counts[state].toLocaleString('es-AR')}</strong> {unitStateLabel(state, summary.counts[state])}</span></li>)}
        </ul>
      </> : <p className="project-meta">Sin unidades cargadas</p>}
    </div>
    <div className="project-row-side">
      <div className="project-stat" data-empty={summary.available === 0 || undefined}>
        <strong>{summary.available.toLocaleString('es-AR')}</strong>
        <span>{availableUnitsLabel(summary)}</span>
      </div>
      <Link className="inventory-cta" href={`/admin/desarrollos/${project.id}`}>Ver proyecto</Link>
    </div>
  </article>;
}
