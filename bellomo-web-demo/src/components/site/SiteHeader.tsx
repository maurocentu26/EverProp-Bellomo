"use client";
import { useOfficialData, CmsLink } from "../OfficialCms";
import { SiteText } from "../WebsiteProvider";
import { useEffect, useRef, useState } from "react";

import { Brand, WhatsAppIcon } from "./shared";

const focusableSelector =
  'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function SiteHeader() {
  const { navigation, whatsappHref } = useOfficialData();

  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const headerRef = useRef<HTMLElement>(null);
  const menuButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const update = () => setScrolled(window.scrollY > 24);
    update();
    window.addEventListener("scroll", update, { passive: true });
    return () => window.removeEventListener("scroll", update);
  }, []);

  useEffect(() => {
    const mobileQuery = window.matchMedia("(max-width: 820px)");
    const closeAfterDesktopResize = () => {
      if (!mobileQuery.matches) setOpen(false);
    };

    closeAfterDesktopResize();
    mobileQuery.addEventListener("change", closeAfterDesktopResize);
    return () => mobileQuery.removeEventListener("change", closeAfterDesktopResize);
  }, []);

  useEffect(() => {
    if (!open) return;

    const header = headerRef.current;
    const menuButton = menuButtonRef.current;
    const previousFocus = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : menuButton;
    const frame = window.requestAnimationFrame(() => {
      header?.querySelector<HTMLElement>(".mobile-menu a")?.focus();
    });

    const closeOutside = (event: PointerEvent) => {
      if (header && !header.contains(event.target as Node)) setOpen(false);
    };
    const handleKeyboard = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        setOpen(false);
        return;
      }
      if (event.key !== "Tab" || !header) return;

      const focusable = Array.from(header.querySelectorAll<HTMLElement>(focusableSelector))
        .filter((element) => element.getClientRects().length > 0);
      const first = focusable[0];
      const last = focusable.at(-1);

      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last?.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first?.focus();
      }
    };

    document.addEventListener("pointerdown", closeOutside);
    document.addEventListener("keydown", handleKeyboard);
    return () => {
      window.cancelAnimationFrame(frame);
      document.removeEventListener("pointerdown", closeOutside);
      document.removeEventListener("keydown", handleKeyboard);
      if (previousFocus?.getClientRects().length) previousFocus.focus();
      else menuButton?.focus();
    };
  }, [open]);

  const closeMenu = () => setOpen(false);

  return (
    <header className={`site-header ${scrolled ? "is-scrolled" : ""} ${open ? "is-open" : ""}`} ref={headerRef}>
      <div className="site-header-inner">
        <CmsLink aria-label="Bellomo, volver al inicio" className="site-logo" href="#inicio" onClick={closeMenu}>
          <Brand compact />
        </CmsLink>
        <nav aria-label="Navegación principal" className="desktop-nav">
          {navigation.map((item) => <CmsLink href={item.href} key={item.href}>{item.label}</CmsLink>)}
        </nav>
        <CmsLink
          className="header-contact"
          href={whatsappHref("Hola Bellomo, quiero recibir asesoramiento.")}
          onClick={closeMenu}
          rel="noopener noreferrer"
          target="_blank"
        >
          <WhatsAppIcon />
          <span><SiteText id="rami-text-76"/></span>
        </CmsLink>
        <button
          aria-controls="mobile-menu"
          aria-expanded={open}
          aria-label={open ? "Cerrar menú" : "Abrir menú"}
          className="menu-button"
          onClick={() => setOpen((current) => !current)}
          ref={menuButtonRef}
          type="button"
        >
          <span /><span /><span />
        </button>
      </div>
      <div className="mobile-menu" hidden={!open} id="mobile-menu">
        <nav aria-label="Navegación móvil">
          {navigation.map((item) => (
            <CmsLink href={item.href} key={item.href} onClick={closeMenu}>
              {item.label}
            </CmsLink>
          ))}
        </nav>
        <CmsLink className="mobile-menu-contact" href={whatsappHref("Hola Bellomo, quiero recibir asesoramiento.")} onClick={closeMenu} rel="noopener noreferrer" target="_blank">
          <SiteText id="rami-text-77"/><WhatsAppIcon />
        </CmsLink>
      </div>
    </header>
  );
}
