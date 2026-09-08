import { PublicSection } from "@/components/OfficialCms";
import Promotions from "@/components/Promotions";
import { ExtraSections } from "@/components/ExtraSections";
import { AboutSection } from "@/components/site/AboutSection";
import { ContactSection, SiteFooter } from "@/components/site/ContactSection";
import { HeroSection } from "@/components/site/HeroSection";
import { MotionEnhancements } from "@/components/site/MotionEnhancements";
import { OfficialGallerySection } from "@/components/site/OfficialGallerySection";
import { ProjectsSection } from "@/components/site/ProjectsSection";
import { ServicesSection } from "@/components/site/ServicesSection";
import { SiteHeader } from "@/components/site/SiteHeader";

export default function Home() {
  return (
    <>
      <a className="skip-link" href="#contenido">Saltar al contenido</a>
      <PublicSection id="menu"><SiteHeader /></PublicSection>
      <main id="contenido">
        <PublicSection id="inicio"><HeroSection /></PublicSection><Promotions/>
        <PublicSection id="bellomo"><AboutSection /></PublicSection>
        <PublicSection id="desarrollos-seleccionados"><ProjectsSection /></PublicSection>
        <PublicSection id="archivo"><OfficialGallerySection /></PublicSection>
        <PublicSection id="servicios"><ServicesSection /></PublicSection>
        <PublicSection id="contacto"><ContactSection /></PublicSection>
      <ExtraSections/></main>
      <PublicSection id="pie"><SiteFooter /></PublicSection>
      <MotionEnhancements />
    </>
  );
}
