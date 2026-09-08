"use client";


import {useWebsite} from "../WebsiteProvider";
import { useEffect, useState } from "react";

export function MotionEnhancements() {
 const {content} = useWebsite();
  const [showTop, setShowTop] = useState(false);

  useEffect(() => {
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const elements = Array.from(document.querySelectorAll<HTMLElement>("[data-reveal]"));

    if (reduced || !("IntersectionObserver" in window)) {
      elements.forEach((element) => element.dataset.visible = "true");
      return;
    }

    document.documentElement.classList.add("motion-ready");
    const observer = new IntersectionObserver(
      (entries) => entries.forEach((entry) => {
        if (entry.isIntersecting) {
          (entry.target as HTMLElement).dataset.visible = "true";
          observer.unobserve(entry.target);
        }
      }),
      { rootMargin: "0px 0px -10%", threshold: 0.12 },
    );
    elements.forEach((element) => observer.observe(element));
    return () => {
      observer.disconnect();
      document.documentElement.classList.remove("motion-ready");
    };
  }, [content]);

  useEffect(() => {
    const update = () => setShowTop(window.scrollY > window.innerHeight * 0.9);
    update();
    window.addEventListener("scroll", update, { passive: true });
    return () => window.removeEventListener("scroll", update);
  }, []);

  return (
    <button
      aria-label="Volver al inicio"
      aria-hidden={!showTop}
      className={`back-to-top ${showTop ? "is-visible" : ""}`}
      onClick={() => window.scrollTo({
        behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth",
        top: 0,
      })}
      tabIndex={showTop ? 0 : -1}
      type="button"
    >
      <svg aria-hidden="true" fill="none" viewBox="0 0 24 24"><path d="m6 14 6-6 6 6" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" /></svg>
    </button>
  );
}
