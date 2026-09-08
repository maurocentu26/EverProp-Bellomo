"use client";
import { useOfficialData } from "../OfficialCms";
import { SiteText } from "../WebsiteProvider";

import { Media, SectionHeading } from "./shared";

export function AboutSection() {
  const { bellomoMedia, bellomoStats, trajectoryMilestones } = useOfficialData();

  return (
    <section className="section about-section" id="bellomo">
      <div className="section-shell">
        <div className="about-intro">
          <SectionHeading eyebrow={<SiteText id="rami-text-1"/>} title={<SiteText id="rami-text-2"/>}>
            <p>
              <SiteText id="rami-text-3"/></p>
          </SectionHeading>
          <div className="about-copy" data-reveal>
            <p>
              <SiteText id="rami-text-4"/></p>
            <p>
              <SiteText id="rami-text-5"/></p>
          </div>
        </div>

        <div className="about-visual" data-reveal>
          <Media media={bellomoMedia.history} sizes="(max-width: 900px) 100vw, 50vw" />
          <div className="about-visual-caption">
            <span><SiteText id="rami-text-6"/></span>
            <strong><SiteText id="rami-text-7"/></strong>
          </div>
        </div>

        <div aria-label="Bellomo en números" className="stats-grid" data-reveal>
          {bellomoStats.map((stat) => (
            <article className="stat" key={stat.label}>
              <strong>{stat.value}</strong>
              <span>{stat.label}</span>
            </article>
          ))}
        </div>

        <div className="timeline" data-reveal>
          <div className="timeline-line" aria-hidden="true" />
          {trajectoryMilestones.map((milestone) => (
            <article className="timeline-item" key={milestone.year}>
              <span>{milestone.year}</span>
              <h3>{milestone.title}</h3>
              <p>{milestone.text}</p>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
