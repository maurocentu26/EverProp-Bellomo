"use client";
import { usePublicInventory } from "../use-public-inventory";
import { useState } from "react";
import { useOfficialData, CmsLink } from "../OfficialCms";
import { SiteText } from "../WebsiteProvider";
import { CmsImage as Image } from "../OfficialCms";
import type { Project } from "@/data/bellomo";
import { ArrowIcon, Media, PinIcon, SectionHeading, WhatsAppIcon } from "./shared";

function ProjectCard({ project }: { project: Project }) {
  const { whatsappHref } = useOfficialData();

  return (
    <article className="project-card" data-glow data-reveal id={project.id} data-visible="true">
      <Media className="project-card-media" media={project.media} sizes="(max-width: 760px) 100vw, (max-width: 1200px) 50vw, 33vw" />
      <div className="project-card-overlay" />
      <div className="project-card-topline">
        <span>{project.stageLabel}</span>
        {project.mapUrl && (
          <CmsLink aria-label={`Ver ${project.name} en el mapa`} href={project.mapUrl} rel="noopener noreferrer" target="_blank">
            <PinIcon />
          </CmsLink>
        )}
      </div>
      <div className="project-card-content">
        {project.media.kind !== "Identidad visual" && (
          project.logo ? (
            <span className="project-logo">
              <Image alt={`Logo ${project.name}`} height={100} sizes="180px" src={project.logo} width={260} />
            </span>
          ) : <p className="project-wordmark">{project.name}</p>
        )}
        {project.slogan && <p className="project-slogan">{project.slogan}</p>}
        <h3>{project.name}</h3>
        <p className="project-location"><PinIcon /> {project.location}</p>
        <p className="project-description">{project.description}</p>
        <ul className="project-facts">
          {project.facts.map((fact) => <li key={fact}>{fact}</li>)}
        </ul>
        {project.services && (
          <details className="project-services">
            <summary><SiteText id="rami-text-58"/></summary>
            <p>{project.services.join(" · ")}</p>
          </details>
        )}
        <CmsLink
          className="project-cta"
          href={whatsappHref(`Hola Bellomo, quiero consultar disponibilidad e información de ${project.name}.`)}
          rel="noopener noreferrer"
          target="_blank"
        >
          <SiteText id="rami-text-59"/><WhatsAppIcon />
        </CmsLink>
      </div>
    </article>
  );
}

export function ProjectsSection() {
 const {cards: inventory, error} = usePublicInventory([]);
 const [view,setView] = useState("default");
  const { bellomoProjects, projectStages } = useOfficialData();

  return (
    <section className="section projects-section" id="proyectos">
      <div className="section-shell">
        <SectionHeading eyebrow={<SiteText id="rami-text-60"/>} title={<SiteText id="rami-text-61"/>}>
          <p>
            <SiteText id="rami-text-62"/></p>
        </SectionHeading>

        <div className="demo-view-controls" role="group" aria-label="Vista de propiedades">{[["default","Vista original"],["two","2 por fila"],["four","4 por fila"]].map(([value,label])=><button type="button" key={value} aria-pressed={view===value} onClick={()=>setView(value)}>{label}</button>)}</div>
        {error && <p role="alert">{error}</p>}
        <div className={`project-groups demo-view-${view}`}>
          {inventory.length>0 && <details className="project-group"><summary><span>Propiedades</span><span className="project-count">{inventory.length} propiedades</span><ArrowIcon/></summary><div className="project-grid">{inventory.map(project=><ProjectCard key={project.id} project={project}/>)}</div></details>}
          {projectStages.map((stage, index) => {
            const projects = bellomoProjects.filter((project) => project.stage === stage.id);
            return (
              <details className="project-group" key={stage.id} open={index === 0}>
                <summary>
                  <span><small>0{index + 1}</small>{stage.label}</span>
                  <span className="project-count">{projects.length} <SiteText id="rami-text-63"/></span>
                  <ArrowIcon />
                </summary>
                <div className="project-group-intro"><p>{stage.description}</p></div>
                <div className="project-grid">
                  {projects.map((project) => <ProjectCard key={project.id} project={project} />)}
                </div>
              </details>
            );
          })}
        </div>
      </div>
    </section>
  );
}
