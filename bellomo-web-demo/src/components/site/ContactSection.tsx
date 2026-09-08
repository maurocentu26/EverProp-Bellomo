"use client";
import { useOfficialData, CmsLink } from "../OfficialCms";
import { SiteText } from "../WebsiteProvider";
import { CmsImage as Image } from "../OfficialCms";

import { Brand, PinIcon, SectionHeading, WhatsAppIcon } from "./shared";

export function ContactSection() {
  const { bellomoContact, whatsappHref } = useOfficialData();

  return (
    <section className="section contact-section" id="contacto">
      <div className="contact-background" aria-hidden="true">
        <Image alt="" fill sizes="100vw" src="/images/official/oficina/belgrano-1383.webp" />
      </div>
      <div className="section-shell contact-shell">
        <SectionHeading eyebrow={<SiteText id="rami-text-9"/>} title={<SiteText id="rami-text-10"/>} light>
          <p>
            <SiteText id="rami-text-11"/></p>
        </SectionHeading>
        <div className="contact-actions" data-reveal>
          <CmsLink className="button button-light" href={whatsappHref("Hola Bellomo, quiero recibir asesoramiento sobre un proyecto.")} rel="noopener noreferrer" target="_blank">
            <WhatsAppIcon /> <SiteText id="rami-text-12"/></CmsLink>
          <CmsLink className="button button-outline-light" href={bellomoContact.mapsUrl} rel="noopener noreferrer" target="_blank">
            <PinIcon /> <SiteText id="rami-text-13"/></CmsLink>
        </div>
        <dl className="contact-details" data-reveal>
          <div><dt><SiteText id="rami-text-14"/></dt><dd>{bellomoContact.address}<br />{bellomoContact.city}</dd></div>
          <div><dt><SiteText id="rami-text-15"/></dt><dd><CmsLink href="tel:+543884228755"><SiteText id="rami-text-17"/></CmsLink><br /><CmsLink href="tel:+543884331981"><SiteText id="rami-text-19"/></CmsLink></dd></div>
          <div><dt><SiteText id="rami-text-20"/></dt><dd><CmsLink href="tel:+543884234010"><SiteText id="rami-text-22"/></CmsLink></dd></div>
          <div><dt><SiteText id="rami-text-23"/></dt><dd>{bellomoContact.weekdayHours}<br />{bellomoContact.saturdayHours}</dd></div>
        </dl>
      </div>
    </section>
  );
}

export function SiteFooter() {
  const { bellomoContact } = useOfficialData();

  return (
    <footer className="site-footer">
      <div className="section-shell footer-grid">
        <div className="footer-brand"><Brand /><p><SiteText id="rami-text-24"/></p></div>
        <nav aria-label="Navegación del pie">
          <h2><SiteText id="rami-text-25"/></h2>
          <CmsLink href="#bellomo"><SiteText id="rami-text-27"/></CmsLink><CmsLink href="#proyectos"><SiteText id="rami-text-29"/></CmsLink><CmsLink href="#archivo"><SiteText id="rami-text-31"/></CmsLink><CmsLink href="#construccion"><SiteText id="rami-text-33"/></CmsLink>
        </nav>
        <div><h2><SiteText id="rami-text-34"/></h2><CmsLink href={`tel:+${bellomoContact.whatsappPhone}`}>{bellomoContact.whatsappDisplay}</CmsLink><CmsLink href={bellomoContact.mapsUrl} rel="noopener noreferrer" target="_blank">{bellomoContact.address}</CmsLink></div>
        <div><h2><SiteText id="rami-text-35"/></h2><CmsLink href="https://instagram.com/bellomojujuy" rel="noopener noreferrer" target="_blank"><SiteText id="rami-text-37"/></CmsLink><CmsLink href="https://facebook.com/bellomojujuy" rel="noopener noreferrer" target="_blank"><SiteText id="rami-text-39"/></CmsLink></div>
      </div>
      <div className="section-shell footer-bottom">
        <p><SiteText id="rami-text-40"/>{new Date().getFullYear()} <SiteText id="rami-text-41"/></p>
        <CmsLink className="eversys-credit" href="https://www.instagram.com/eversys.solutions/" rel="noopener noreferrer" target="_blank">
          <span><SiteText id="rami-text-43"/></span><Image alt="" aria-hidden="true" height={20} src="/brand/eversys-isotipo-oficial-blanco.png" width={38} /><strong><SiteText id="rami-text-45"/></strong>
        </CmsLink>
      </div>
    </footer>
  );
}
