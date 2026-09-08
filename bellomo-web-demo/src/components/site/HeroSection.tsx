"use client";
import { useOfficialData, CmsLink } from "../OfficialCms";
import { SiteText } from "../WebsiteProvider";
import { CmsImage as Image } from "../OfficialCms";
import { useEffect, useRef, useState } from "react";

import { ArrowIcon, WhatsAppIcon } from "./shared";

const CYCLE_MS = 7_000;
const MANUAL_PAUSE_MS = 9_000;

export function HeroSection() {
  const { heroSlides, whatsappHref } = useOfficialData();

  const [active, setActive] = useState(0);
  const [focusPaused, setFocusPaused] = useState(false);
  const [hoverPaused, setHoverPaused] = useState(false);
  const [inView, setInView] = useState(true);
  const [manualPaused, setManualPaused] = useState(false);
  const [userPaused, setUserPaused] = useState(false);
  const [pageVisible, setPageVisible] = useState(true);
  const [reducedMotion, setReducedMotion] = useState(false);
  const heroRef = useRef<HTMLElement>(null);
  const manualTimerRef = useRef(0);
  const pointerStartRef = useRef<{ id: number; x: number; y: number } | null>(null);
  const paused = userPaused || focusPaused || hoverPaused || manualPaused || !pageVisible || !inView || reducedMotion;

  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReducedMotion(query.matches);
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);

  useEffect(() => {
    const update = () => setPageVisible(!document.hidden);
    update();
    document.addEventListener("visibilitychange", update);
    return () => document.removeEventListener("visibilitychange", update);
  }, []);

  useEffect(() => {
    const hero = heroRef.current;
    if (!hero || !("IntersectionObserver" in window)) return;
    const observer = new IntersectionObserver(
      ([entry]) => setInView(entry.isIntersecting && entry.intersectionRatio >= 0.24),
      { threshold: [0, 0.24, 0.6] },
    );
    observer.observe(hero);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!heroSlides.length || paused || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const timer = window.setTimeout(
      () => setActive((current) => (current + 1) % heroSlides.length),
      CYCLE_MS,
    );
    return () => window.clearTimeout(timer);
  }, [active, paused, heroSlides.length]);

  useEffect(() => () => window.clearTimeout(manualTimerRef.current), []);

  const selectSlide = (index: number) => {
    window.clearTimeout(manualTimerRef.current);
    setManualPaused(true);
    setActive((index + heroSlides.length) % heroSlides.length);
    manualTimerRef.current = window.setTimeout(() => setManualPaused(false), MANUAL_PAUSE_MS);
  };

  if (!heroSlides.length) return null;
  const slide = heroSlides[active % heroSlides.length];

  return (
    <section
      aria-label="Presentación Bellomo"
      aria-roledescription="carrusel"
      className="hero"
      id="inicio"
      onBlurCapture={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setFocusPaused(false);
      }}
      onFocusCapture={() => setFocusPaused(true)}
      onMouseEnter={() => setHoverPaused(true)}
      onMouseLeave={() => setHoverPaused(false)}
      onPointerCancel={() => { pointerStartRef.current = null; }}
      onPointerDown={(event) => {
        if (event.isPrimary) pointerStartRef.current = { id: event.pointerId, x: event.clientX, y: event.clientY };
      }}
      onPointerUp={(event) => {
        const start = pointerStartRef.current;
        pointerStartRef.current = null;
        if (!start || start.id !== event.pointerId) return;
        const deltaX = event.clientX - start.x;
        const deltaY = event.clientY - start.y;
        if (Math.abs(deltaX) > 48 && Math.abs(deltaX) > Math.abs(deltaY) * 1.2) {
          selectSlide(active + (deltaX < 0 ? 1 : -1));
        }
      }}
      ref={heroRef}
    >
      <div className="hero-media" aria-hidden="true">
        {heroSlides.map((item, index) => (
          <Image
            alt=""
            className={index === active ? "is-active" : ""}
            fill
            key={item.id}
            {...(index === 0 ? { preload: true } : { loading: "lazy" as const })}
            quality={82}
            sizes="100vw"
            src={item.media.src}
            style={{ objectPosition: item.media.position }}
          />
        ))}
      </div>
      <div className="hero-overlay" />
      <div className="hero-grid" />
      <div className="hero-content">
        <p className="hero-eyebrow" key={`${slide.id}-eyebrow`}>{slide.eyebrow}</p>
        <h1 key={`${slide.id}-title`}>
          {slide.title}<br /><em>{slide.emphasis}</em>
        </h1>
        <p className="hero-description" key={`${slide.id}-description`}>{slide.description}</p>
        <div className="hero-actions">
          <CmsLink className="button button-primary" href="#proyectos"><SiteText id="rami-text-47"/><ArrowIcon /></CmsLink>
          <CmsLink className="button button-ghost" href={whatsappHref("Hola Bellomo, quiero asesoramiento sobre sus proyectos.")} rel="noopener noreferrer" target="_blank">
            <WhatsAppIcon /> <SiteText id="rami-text-48"/></CmsLink>
        </div>
      </div>
      <div
        aria-label="Elegir imagen de presentación"
        className="hero-controls"
        onKeyDown={(event) => {
          if (event.key === "ArrowLeft") selectSlide(active - 1);
          if (event.key === "ArrowRight") selectSlide(active + 1);
        }}
      >
        {heroSlides.map((item, index) => (
          <button
            aria-label={`Ver presentación ${index + 1}: ${item.title} ${item.emphasis}`}
            aria-pressed={active === index}
            className={active === index ? "is-active" : ""}
            key={item.id}
            onClick={() => selectSlide(index)}
            type="button"
          ><span>0{index + 1}</span></button>
        ))}
        <button
          aria-label={
            reducedMotion
              ? "Rotación automática desactivada por la preferencia de movimiento reducido"
              : userPaused
                ? "Reanudar rotación automática"
                : "Pausar rotación automática"
          }
          aria-pressed={userPaused || reducedMotion}
          className="hero-autoplay-toggle"
          disabled={reducedMotion}
          onClick={() => setUserPaused((current) => !current)}
          type="button"
        >
          <span>{reducedMotion ? "En pausa" : userPaused ? "Continuar" : "Pausar"}</span>
        </button>
      </div>
      <CmsLink className="hero-scroll" href="#bellomo"><span><SiteText id="rami-text-50"/></span><i /></CmsLink>
    </section>
  );
}
