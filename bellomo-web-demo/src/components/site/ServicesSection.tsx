"use client";
import { useOfficialData, CmsLink } from "../OfficialCms";
import { SiteText } from "../WebsiteProvider";

import { ArrowIcon, Media, PropertyIcon, SectionHeading } from "./shared";

export function ServicesSection() {
  const { constructionHighlights, propertyCategories, rentalPortfolio, whatsappHref } = useOfficialData();

  return (
    <>
      <section className="section commercial-section" id="comercializadora">
        <div className="section-shell">
          <div className="service-heading-grid">
            <SectionHeading eyebrow={<SiteText id="rami-text-64"/>} title={<SiteText id="rami-text-65"/>}>
              <p>
                <SiteText id="rami-text-66"/></p>
            </SectionHeading>
            <p className="service-lead" data-reveal>
              <SiteText id="rami-text-67"/></p>
          </div>
          <div className="category-grid" data-reveal>
            {propertyCategories.map((category) => (
              <CmsLink className="category-card" href={category.id === "loteos" ? "#proyectos" : "#contacto"} id={category.id} key={category.id}>
                <span className="category-icon"><PropertyIcon type={category.icon} /></span>
                <h3>{category.title}</h3>
                <p>{category.description}</p>
                <ArrowIcon />
              </CmsLink>
            ))}
          </div>
          <div className="rental-strip" data-reveal>
            <div>
              <p className="eyebrow"><SiteText id="rami-text-68"/></p>
              <h3><SiteText id="rami-text-69"/></h3>
            </div>
            <ul>
              {rentalPortfolio.map((item) => <li key={item}>{item}</li>)}
            </ul>
          </div>
        </div>
      </section>

      <section className="section construction-section" id="construccion">
        <div className="section-shell">
          <SectionHeading eyebrow={<SiteText id="rami-text-70"/>} title={<SiteText id="rami-text-71"/>} light>
            <p>
              <SiteText id="rami-text-72"/></p>
          </SectionHeading>
          <div className="construction-grid">
            {constructionHighlights.map((service) => (
              <article className="construction-card" data-reveal id={service.id} key={service.id}>
                <Media className="construction-media" media={service.media} sizes="(max-width: 900px) 100vw, 33vw" />
                <div className="construction-card-content">
                  <p className="eyebrow">{service.eyebrow}</p>
                  <h3>{service.title}</h3>
                  <p>{service.description}</p>
                  <ul>{service.focusAreas.map((area) => <li key={area}>{area}</li>)}</ul>
                  <CmsLink href={whatsappHref(`Hola Bellomo, quiero consultar por ${service.title.toLocaleLowerCase("es-AR")}.`)} rel="noopener noreferrer" target="_blank">
                    {service.cta} <ArrowIcon />
                  </CmsLink>
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>
    </>
  );
}
