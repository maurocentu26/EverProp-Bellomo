"use client";

import DemoCatalog from "@/components/DemoCatalog";
import { SiteText, ManagedPage, useWebsite, useSiteData } from "@/components/WebsiteProvider";
import Image from "next/image";
import {
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import {
  type BellomoImage,
  type HeroSlide,
  type Project,
  type PropertyCategory,
} from "@/data/bellomo";

const BELLOMO_SCROLL_EVENT = "bellomo:scroll";

type ScrollDirection = "down" | "up";

type MotionState = "active" | "after" | "before" | "entering" | "leaving";

type HeaderState = "scrolled-down" | "scrolled-up" | "top";

type CounterState = "armed" | "complete" | "running";

type Metric = {
  decimals?: number;
  label: string;
  prefix?: string;
  suffix?: string;
  value: number;
};

type BellomoScrollDetail = {
  direction: ScrollDirection;
  footerVisible: boolean;
  progress: number;
  scrollY: number;
};

function useWhatsAppHref() {
const { bellomoContact } = useSiteData();
return (message: string) => `https://wa.me/${bellomoContact.whatsappPhone}?text=${encodeURIComponent(message)}`;
}

function ArrowIcon({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg
      aria-hidden="true"
      className={className}
      fill="none"
      viewBox="0 0 24 24"
    >
      <path
        d="M5 12h14m-5-5 5 5-5 5"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.8"
      />
    </svg>
  );
}

function ChevronIcon({
  className = "h-4 w-4",
  direction = "right",
}: {
  className?: string;
  direction?: "left" | "right";
}) {
  return (
    <svg
      aria-hidden="true"
      className={`${className} ${direction === "left" ? "rotate-180" : ""}`}
      fill="none"
      viewBox="0 0 24 24"
    >
      <path
        d="m9 5 7 7-7 7"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.6"
      />
    </svg>
  );
}

function WhatsAppIcon({ className = "h-5 w-5" }: { className?: string }) {
  return (
    <svg
      aria-hidden="true"
      className={className}
      fill="none"
      viewBox="0 0 24 24"
    >
      <path
        d="M20.2 11.8a8.2 8.2 0 0 1-12.1 7.3L4 20l.9-4a8.2 8.2 0 1 1 15.3-4.2Z"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.7"
      />
      <path
        d="M8.4 7.9c.2-.4.4-.4.7-.4h.4c.2 0 .4.1.5.4l.7 1.7c.1.3.1.5-.1.7l-.6.7c-.2.2-.1.4 0 .6.5.9 1.3 1.7 2.2 2.2.2.1.4.2.6 0l.8-1c.2-.2.4-.3.7-.2l1.8.8c.3.1.5.3.5.5 0 .3-.1 1.3-.7 1.8-.5.5-1.3.8-2.1.7-1.1-.1-2.5-.6-4.2-2.1-2.1-1.8-3.3-4.1-3.4-5.1 0-.6.1-1 .2-1.3Z"
        fill="currentColor"
      />
    </svg>
  );
}

function MenuIcon({ open = false }: { open?: boolean }) {
  return (
    <span
      aria-hidden="true"
      className={`mobile-menu-icon ${open ? "is-open" : ""}`}
    >
      <span />
      <span />
      <span />
    </span>
  );
}

function UpIcon() {
  return (
    <svg aria-hidden="true" className="h-4 w-4" fill="none" viewBox="0 0 24 24">
      <path
        d="m6 14 6-6 6 6"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.7"
      />
    </svg>
  );
}

function PropertyIcon({
  className = "h-6 w-6",
  type,
}: {
  className?: string;
  type: PropertyCategory["icon"];
}) {
  const paths: Record<PropertyCategory["icon"], ReactNode> = {
    land: (
      <>
        <path d="M3 18.5 8 16l5 2.5 8-4" />
        <path d="M5 16V7m0 0 5 2-5 2V7Z" />
        <path d="M3 21h18" />
      </>
    ),
    home: (
      <>
        <path d="m3 11 9-7 9 7" />
        <path d="M5.5 9.5V21h13V9.5" />
        <path d="M9.5 21v-6h5v6" />
      </>
    ),
    store: (
      <>
        <path d="M4 10v11h16V10" />
        <path d="M3 10h18l-2-6H5l-2 6Z" />
        <path d="M8 10v1.5a2 2 0 0 0 4 0V10m0 0v1.5a2 2 0 0 0 4 0V10" />
        <path d="M8 21v-6h8v6" />
      </>
    ),
    garage: (
      <>
        <path d="M3 11 12 4l9 7v10H3V11Z" />
        <path d="M6.5 21v-7h11v7" />
        <path d="M8.5 17h7" />
      </>
    ),
    building: (
      <>
        <path d="M5 21V4h10v17M15 9h4v12" />
        <path d="M8 8h4M8 12h4M8 16h4M17 13h2M17 17h2" />
        <path d="M3 21h18" />
      </>
    ),
  };

  return (
    <svg
      aria-hidden="true"
      className={className}
      fill="none"
      viewBox="0 0 24 24"
    >
      <g
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.35"
      >
        {paths[type]}
      </g>
    </svg>
  );
}

type NavIconType =
  | "home"
  | "people"
  | "key"
  | "structure"
  | "message";

const navIconByHref: Record<string, NavIconType> = {
  "#comercializadora": "key",
  "#contacto": "message",
  "#constructora": "structure",
  "#inicio": "home",
  "#bellomo": "people",
};

function useSiteNavigation() {
const { content: website } = useWebsite();

const { navigation, propertyCategories, constructionHighlights } = useSiteData();
const desktopNavigationHrefs = navigation
  .filter((item) => item.href !== "#contacto")
  .map((item) => item.href);

const navigationSectionHrefs = navigation.map((item) => item.href);

const navDropdownByHref = {
  "#comercializadora": {
    eyebrow: website.texts["texto-100"].value,
    items: [
      {
        children: propertyCategories.slice(0, 4).map((category) => ({
          href: `#${category.id}`,
          icon: category.icon,
          label: category.title,
        })),
        href: "#desarrollos-seleccionados",
        icon: "land" as const,
        id: "desarrollos-actuales",
        label: website.texts["texto-101"].value,
      },
      {
        children: propertyCategories.slice(4).map((category) => ({
          href: `#${category.id}`,
          icon: category.icon,
          label: category.title,
        })),
        href: "#proyectos-futuros",
        icon: "building" as const,
        id: "nuevos-proyectos",
        label: website.texts["texto-102"].value,
      },
    ],
  },
  "#constructora": {
    eyebrow: website.texts["texto-103"].value,
    items: [
      {
        children: constructionHighlights
          .filter((item) => item.id === "edificios-huasi")
          .map((item) => ({
            href: `#${item.id}`,
            icon: item.icon,
            label: item.title,
          })),
        href: "#edificios-huasi",
        icon: "building" as const,
        id: "proyectos-entregados",
        label: website.texts["texto-104"].value,
      },
      {
        children: constructionHighlights
          .filter((item) => item.id !== "edificios-huasi")
          .map((item) => ({
            href: `#${item.id}`,
            icon: item.icon,
            label: item.title,
          })),
        href: "#constructora",
        icon: "building" as const,
        id: "areas-de-obra",
        label: website.texts["texto-105"].value,
      },
    ],
  },
} satisfies Record<
  string,
  {
    eyebrow: string;
    items: {
      children: {
        href: string;
        icon: PropertyCategory["icon"];
        label: string;
      }[];
      href: string;
      icon: PropertyCategory["icon"];
      id: string;
      label: string;
    }[];
  }
>;

return { desktopNavigationHrefs, navigationSectionHrefs, navDropdownByHref };
}

function NavMicroIcon({ href }: { href: string }) {
  const paths: Record<NavIconType, ReactNode> = {
    home: (
      <>
        <path d="m3.5 10.5 8.5-7 8.5 7" />
        <path d="M5.5 9v11h13V9M9.5 20v-6h5v6" />
      </>
    ),
    people: (
      <>
        <circle cx="9" cy="8" r="3" />
        <path d="M3.5 20c.4-4 2.2-6 5.5-6s5.1 2 5.5 6" />
        <path d="M15 6.5a2.7 2.7 0 0 1 0 5.2M16.5 14.2c2.4.5 3.7 2.4 4 5.8" />
      </>
    ),
    key: (
      <>
        <circle cx="8.5" cy="9" r="4.5" />
        <path d="m12 12.5 8 8M16 16.5l2-2M18 18.5l2-2" />
      </>
    ),
    structure: (
      <>
        <path d="M4 21V8l8-4 8 4v13M3 21h18" />
        <path d="M8 21v-5h8v5M8 10h2M14 10h2" />
      </>
    ),
    message: (
      <>
        <path d="M4 5h16v11H9l-5 4V5Z" />
        <path d="M8 9h8M8 12h5" />
      </>
    ),
  };
  const type = navIconByHref[href] ?? "home";

  return (
    <svg
      aria-hidden="true"
      className="nav-micro-icon"
      fill="none"
      viewBox="0 0 24 24"
    >
      <g
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.35"
      >
        {paths[type]}
      </g>
    </svg>
  );
}

function DownIcon() {
  return (
    <svg aria-hidden="true" className="h-4 w-4" fill="none" viewBox="0 0 24 24">
      <path
        d="m6 10 6 6 6-6"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.7"
      />
    </svg>
  );
}

function InstagramIcon({ className = "h-5 w-5" }: { className?: string }) {
  return (
    <svg aria-hidden="true" className={className} fill="none" viewBox="0 0 24 24">
      <rect height="16" rx="4.5" stroke="currentColor" strokeWidth="1.7" width="16" x="4" y="4" />
      <circle cx="12" cy="12" r="3.6" stroke="currentColor" strokeWidth="1.7" />
      <circle cx="17.4" cy="6.8" fill="currentColor" r="1" />
    </svg>
  );
}

function FacebookIcon({ className = "h-5 w-5" }: { className?: string }) {
  return (
    <svg aria-hidden="true" className={className} fill="currentColor" viewBox="0 0 24 24">
      <path d="M13.7 21v-8h2.7l.4-3.1h-3.1V8c0-.9.3-1.5 1.6-1.5H17V3.7c-.7-.1-1.4-.2-2.1-.2-2.1 0-3.6 1.3-3.6 3.8v2.6H9V13h2.3v8h2.4Z" />
    </svg>
  );
}

function PhoneIcon({ className = "h-5 w-5" }: { className?: string }) {
  return (
    <svg aria-hidden="true" className={className} fill="none" viewBox="0 0 24 24">
      <path d="M7 4.5 9.4 8 7.8 9.8a14 14 0 0 0 6.4 6.4l1.8-1.6 3.5 2.4c.3.2.5.6.4 1-.4 1.8-1.8 3-3.7 3C9 21 3 15 3 7.8 3 5.9 4.2 4.5 6 4.1c.4-.1.8.1 1 .4Z" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.6" />
    </svg>
  );
}

function LocationIcon({ className = "h-5 w-5" }: { className?: string }) {
  return (
    <svg aria-hidden="true" className={className} fill="none" viewBox="0 0 24 24">
      <path d="M19 10c0 5-7 11-7 11S5 15 5 10a7 7 0 1 1 14 0Z" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.6" />
      <circle cx="12" cy="10" r="2.3" stroke="currentColor" strokeWidth="1.6" />
    </svg>
  );
}

function Brand({
  className = "",
  eager = false,
}: {
  className?: string;
  eager?: boolean;
}) {
const { content: website } = useWebsite();

  return (
    <Image unoptimized
      alt="Bellomo Desarrollos Inmobiliarios"
      className={className}
      height={50}
      loading={eager ? "eager" : "lazy"}
      src={website.assets["imagen-1"].value}
      width={190}
    />
  );
}

function ResilientMedia({
  className = "",
  decorative = false,
  eager = false,
  media,
}: {
  className?: string;
  decorative?: boolean;
  eager?: boolean;
  media: BellomoImage;
}) {
  const { alt, position = "center", src } = media;
  const containerRef = useRef<HTMLDivElement>(null);
  const [shouldLoad, setShouldLoad] = useState(eager);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (eager || shouldLoad) return;

    const container = containerRef.current;
    if (!container) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setShouldLoad(true);
          observer.disconnect();
        }
      },
      { rootMargin: "320px 0px", threshold: 0.01 }
    );

    observer.observe(container);
    return () => observer.disconnect();
  }, [eager, shouldLoad]);

  useEffect(() => {
    if (!shouldLoad) return;

    let active = true;
    const image = new window.Image();
    image.decoding = "async";
    image.onload = () => {
      if (active) setLoaded(true);
    };
    image.onerror = () => {
      if (active) setLoaded(false);
    };
    image.src = src;

    return () => {
      active = false;
      image.onload = null;
      image.onerror = null;
    };
  }, [shouldLoad, src]);

  return (
    <div
      aria-hidden={decorative ? true : undefined}
      aria-label={decorative ? undefined : alt}
      className={`resilient-media ${loaded ? "is-loaded" : ""} ${className}`}
      ref={containerRef}
      role={decorative ? undefined : "img"}
    >
      <div aria-hidden="true" className="media-fallback">
        <PropertyIcon className="h-10 w-10" type="building" />
        <span><SiteText id="texto-2" /></span>
      </div>
      <div
        aria-hidden="true"
        className="media-photo"
        style={
          shouldLoad
            ? {
                backgroundImage: `url(${src})`,
                backgroundPosition: position,
              }
            : undefined
        }
      />
    </div>
  );
}

function Header() {
const { navigation } = useSiteData();

const { desktopNavigationHrefs, navigationSectionHrefs, navDropdownByHref } = useSiteNavigation();

  const [activeSection, setActiveSection] = useState("inicio");
  const [headerHasFocus, setHeaderHasFocus] = useState(false);
  const [headerState, setHeaderState] = useState<HeaderState>("top");
  const [mobileOpen, setMobileOpen] = useState(false);
  const [activeDesktopMenu, setActiveDesktopMenu] = useState<string | null>(
    null
  );
  const [activeSubmenu, setActiveSubmenu] = useState<string | null>(null);
  const [menuInteractionMode, setMenuInteractionMode] = useState<
    "keyboard" | "pinned" | "pointer"
  >("pointer");
  const activeDesktopMenuRef = useRef<string | null>(null);
  const clickedDesktopDropdownRef = useRef<string | null>(null);
  const desktopMenuCloseTimerRef = useRef<number | null>(null);
  const desktopMenuOpenTimerRef = useRef<number | null>(null);
  const desktopTriggerRefs = useRef<
    Record<string, HTMLButtonElement | null>
  >({});
  const dismissedDesktopDropdownRef = useRef<string | null>(null);
  const headerPinnedRef = useRef(false);
  const headerRef = useRef<HTMLElement>(null);
  const mobileCloseButtonRef = useRef<HTMLButtonElement>(null);
  const mobilePanelRef = useRef<HTMLDivElement>(null);
  const mobileTriggerRef = useRef<HTMLButtonElement>(null);
  const headerPinned =
    mobileOpen || activeDesktopMenu !== null || headerHasFocus;

  useEffect(() => {
    const sections = navigationSectionHrefs
      .map((href) => document.getElementById(href.slice(1)))
      .filter((section): section is HTMLElement => section !== null);
    const updateHeader = (
      scrollY: number,
      scrollDirection: ScrollDirection
    ) => {
      const marker = scrollY + Math.min(window.innerHeight * 0.42, 360);
      const orderedSections = sections
        .map((section) => ({
          id: section.id,
          top: section.getBoundingClientRect().top + scrollY,
        }))
        .sort((left, right) => left.top - right.top);
      let nextActive = orderedSections[0]?.id ?? "inicio";

      orderedSections.forEach((section) => {
        if (section.top <= marker) {
          nextActive = section.id;
        }
      });

      if (
        orderedSections.length > 0 &&
        scrollY + window.innerHeight >=
          document.documentElement.scrollHeight - 2
      ) {
        nextActive = orderedSections[orderedSections.length - 1].id;
      }

      setHeaderState(() => {
        if (scrollY <= 40) return "top";
        if (headerPinnedRef.current) return "scrolled-up";
        return scrollDirection === "up" ? "scrolled-up" : "scrolled-down";
      });
      setActiveSection((current) =>
        current === nextActive ? current : nextActive
      );
    };

    const handleCoordinatedScroll = (event: Event) => {
      const detail = (event as CustomEvent<BellomoScrollDetail>).detail;
      updateHeader(Math.max(detail.scrollY, 0), detail.direction);
    };

    updateHeader(
      Math.max(window.scrollY, 0),
      document.documentElement.dataset.scrollDirection === "up" ? "up" : "down"
    );
    window.addEventListener(BELLOMO_SCROLL_EVENT, handleCoordinatedScroll);

    return () => {
      window.removeEventListener(BELLOMO_SCROLL_EVENT, handleCoordinatedScroll);
    };
  }, []);

  useEffect(() => {
    headerPinnedRef.current = headerPinned;

    if (headerPinned) {
      const frame = window.requestAnimationFrame(() => {
        setHeaderState(window.scrollY <= 40 ? "top" : "scrolled-up");
      });

      return () => window.cancelAnimationFrame(frame);
    }
  }, [headerPinned]);

  useEffect(
    () => () => {
      if (desktopMenuOpenTimerRef.current !== null) {
        window.clearTimeout(desktopMenuOpenTimerRef.current);
      }
      if (desktopMenuCloseTimerRef.current !== null) {
        window.clearTimeout(desktopMenuCloseTimerRef.current);
      }
    },
    []
  );

  useEffect(() => {
    if (!activeDesktopMenu) return;

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target;
      const dropdownGroup = headerRef.current?.querySelector<HTMLElement>(
        `[data-nav-dropdown="${activeDesktopMenu.slice(1)}"]`
      );

      if (target instanceof Node && !dropdownGroup?.contains(target)) {
        if (desktopMenuOpenTimerRef.current !== null) {
          window.clearTimeout(desktopMenuOpenTimerRef.current);
          desktopMenuOpenTimerRef.current = null;
        }
        if (desktopMenuCloseTimerRef.current !== null) {
          window.clearTimeout(desktopMenuCloseTimerRef.current);
          desktopMenuCloseTimerRef.current = null;
        }
        activeDesktopMenuRef.current = null;
        clickedDesktopDropdownRef.current = null;
        dismissedDesktopDropdownRef.current = null;
        setActiveSubmenu(null);
        setActiveDesktopMenu(null);
      }
    };

    document.addEventListener("pointerdown", handlePointerDown);
    return () => document.removeEventListener("pointerdown", handlePointerDown);
  }, [activeDesktopMenu]);

  useEffect(() => {
    if (!mobileOpen) return;

    const body = document.body;
    const root = document.documentElement;
    const previousBodyOverflow = body.style.overflow;
    const previousBodyOverscroll = body.style.overscrollBehavior;
    const previousBodyPaddingRight = body.style.paddingRight;
    const previousRootOverflow = root.style.overflow;
    const scrollbarWidth = window.innerWidth - root.clientWidth;

    root.style.overflow = "hidden";
    body.style.overflow = "hidden";
    body.style.overscrollBehavior = "none";
    if (scrollbarWidth > 0) {
      body.style.paddingRight = `${scrollbarWidth}px`;
    }

    return () => {
      root.style.overflow = previousRootOverflow;
      body.style.overflow = previousBodyOverflow;
      body.style.overscrollBehavior = previousBodyOverscroll;
      body.style.paddingRight = previousBodyPaddingRight;
    };
  }, [mobileOpen]);

  useEffect(() => {
    if (!mobileOpen) return;

    const frame = window.requestAnimationFrame(() => {
      mobileCloseButtonRef.current?.focus();
    });

    return () => window.cancelAnimationFrame(frame);
  }, [mobileOpen]);

  useEffect(() => {
    const desktopMedia = window.matchMedia("(min-width: 1200px)");
    const handleDesktopChange = (event: MediaQueryListEvent) => {
      if (event.matches) {
        setMobileOpen(false);
      }
    };

    desktopMedia.addEventListener("change", handleDesktopChange);
    return () =>
      desktopMedia.removeEventListener("change", handleDesktopChange);
  }, []);

  const cancelDesktopMenuOpen = () => {
    if (desktopMenuOpenTimerRef.current !== null) {
      window.clearTimeout(desktopMenuOpenTimerRef.current);
      desktopMenuOpenTimerRef.current = null;
    }
  };

  const cancelDesktopMenuClose = () => {
    if (desktopMenuCloseTimerRef.current !== null) {
      window.clearTimeout(desktopMenuCloseTimerRef.current);
      desktopMenuCloseTimerRef.current = null;
    }
  };

  const activateDesktopMenu = (href: string) => {
    if (activeDesktopMenuRef.current !== href) setActiveSubmenu(null);
    activeDesktopMenuRef.current = href;
    setActiveDesktopMenu(href);
  };

  const scheduleDesktopMenuOpen = (href: string) => {
    cancelDesktopMenuClose();
    cancelDesktopMenuOpen();
    dismissedDesktopDropdownRef.current = null;

    if (clickedDesktopDropdownRef.current !== href) {
      clickedDesktopDropdownRef.current = null;
    }

    if (activeDesktopMenuRef.current === href) return;

    if (activeDesktopMenuRef.current !== null) {
      activateDesktopMenu(href);
      return;
    }

    desktopMenuOpenTimerRef.current = window.setTimeout(() => {
      desktopMenuOpenTimerRef.current = null;
      activateDesktopMenu(href);
    }, 65);
  };

  const scheduleDesktopMenuClose = (href: string) => {
    cancelDesktopMenuOpen();
    cancelDesktopMenuClose();

    desktopMenuCloseTimerRef.current = window.setTimeout(() => {
      desktopMenuCloseTimerRef.current = null;
      const dropdownGroup = headerRef.current?.querySelector<HTMLElement>(
        `[data-nav-dropdown="${href.slice(1)}"]`
      );

      if (
        clickedDesktopDropdownRef.current === href ||
        dropdownGroup?.contains(document.activeElement)
      ) {
        return;
      }

      if (activeDesktopMenuRef.current === href) {
        activeDesktopMenuRef.current = null;
        setActiveSubmenu(null);
        setActiveDesktopMenu((current) =>
          current === href ? null : current
        );
      }
    }, 190);
  };

  const closeDesktopDropdown = (
    href: string,
    returnFocus = false
  ) => {
    cancelDesktopMenuOpen();
    cancelDesktopMenuClose();
    clickedDesktopDropdownRef.current = null;
    dismissedDesktopDropdownRef.current = returnFocus ? href : null;
    setActiveSubmenu(null);

    if (activeDesktopMenuRef.current === href) {
      activeDesktopMenuRef.current = null;
      setActiveDesktopMenu((current) =>
        current === href ? null : current
      );
    }

    if (returnFocus) {
      window.requestAnimationFrame(() => {
        desktopTriggerRefs.current[href]?.focus();
      });
    }
  };

  const closeMobileMenu = (returnFocus = true) => {
    setMobileOpen(false);
    if (returnFocus) {
      window.requestAnimationFrame(() => {
        mobileTriggerRef.current?.focus();
      });
    }
  };

  const handleMobileMenuKeyDown = (
    event: ReactKeyboardEvent<HTMLDivElement>
  ) => {
    if (event.key === "Escape") {
      event.preventDefault();
      closeMobileMenu();
      return;
    }

    if (event.key !== "Tab") return;

    const focusableElements = Array.from(
      mobilePanelRef.current?.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])'
      ) ?? []
    );
    const firstElement = focusableElements[0];
    const lastElement = focusableElements[focusableElements.length - 1];

    if (!firstElement || !lastElement) return;

    if (event.shiftKey && document.activeElement === firstElement) {
      event.preventDefault();
      lastElement.focus();
    } else if (!event.shiftKey && document.activeElement === lastElement) {
      event.preventDefault();
      firstElement.focus();
    }
  };

  return (
    <header
      className={`site-header is-${headerState} ${
        headerState === "top" ? "" : "is-scrolled"
      } ${headerPinned ? "is-pinned" : ""} ${
        mobileOpen ? "is-mobile-menu-open" : ""
      }`}
      data-header-state={headerPinned ? "pinned" : headerState}
      data-menu-interaction={menuInteractionMode}
      onBlurCapture={(event) => {
        if (
          !event.currentTarget.contains(event.relatedTarget as Node | null)
        ) {
          setHeaderHasFocus(false);
        }
      }}
      onFocusCapture={() => setHeaderHasFocus(true)}
      ref={headerRef}
    >
      <div className="site-header-inner mx-auto flex max-w-[90rem] items-center justify-between px-5 py-5 sm:px-8 lg:px-12 lg:py-6">
        <a
          aria-label="Bellomo, ir al inicio"
          className="site-brand shrink-0"
          href="#inicio"
          onClick={() => {
            closeDesktopDropdown(activeDesktopMenu ?? "#inicio");
          }}
        >
          <Brand className="bellomo-header-logo h-auto" eager />
        </a>

        <nav
          aria-label="Navegación principal"
          className="desktop-navigation"
        >
          <div className="desktop-navigation-list">
            {navigation
              .filter((item) => desktopNavigationHrefs.includes(item.href))
              .map((item) => {
                const dropdown =
                  navDropdownByHref[
                    item.href as keyof typeof navDropdownByHref
                  ];
                const active = activeSection === item.href.slice(1);
                const dropdownOpen = activeDesktopMenu === item.href;

                if (!dropdown) {
                  return (
                    <a
                      aria-current={active ? "location" : undefined}
                      className={`nav-link ${active ? "is-active" : ""}`}
                      href={item.href}
                      key={item.href}
                      onClick={() => {
                        closeDesktopDropdown(activeDesktopMenu ?? item.href);
                      }}
                    >
                      <span>{item.label}</span>
                      <NavMicroIcon href={item.href} />
                    </a>
                  );
                }

                const dropdownKey = item.href.slice(1);
                const dropdownId = `desktop-menu-${dropdownKey}`;
                const triggerId = `desktop-menu-trigger-${dropdownKey}`;
                const submenuPrefix = `${item.href}:`;
                const activeDropdownGroupId = activeSubmenu?.startsWith(
                  submenuPrefix
                )
                  ? activeSubmenu.slice(submenuPrefix.length)
                  : dropdown.items[0]?.id;
                const activeDropdownGroup = dropdown.items.find(
                  (group) => group.id === activeDropdownGroupId
                );

                return (
                  <div
                    className={`nav-explore ${
                      dropdownOpen ? "is-open" : ""
                    }`}
                    data-nav-dropdown={dropdownKey}
                    key={item.href}
                    onBlurCapture={(event) => {
                      if (
                        !event.currentTarget.contains(
                          event.relatedTarget as Node | null
                        )
                      ) {
                        closeDesktopDropdown(item.href);
                      }
                    }}
                    onFocusCapture={() => {
                      setMenuInteractionMode("keyboard");
                      if (
                        dismissedDesktopDropdownRef.current !== item.href
                      ) {
                        cancelDesktopMenuOpen();
                        cancelDesktopMenuClose();
                        activateDesktopMenu(item.href);
                      }
                    }}
                    onKeyDown={(event) => {
                      if (event.key === "Escape") {
                        event.preventDefault();
                        event.stopPropagation();
                        closeDesktopDropdown(item.href, true);
                      }
                    }}
                    onPointerEnter={(event) => {
                      if (event.pointerType !== "touch") {
                        setMenuInteractionMode("pointer");
                        scheduleDesktopMenuOpen(item.href);
                      }
                    }}
                    onPointerLeave={(event) => {
                      const nextTarget = event.relatedTarget;

                      if (
                        nextTarget instanceof Node &&
                        event.currentTarget.contains(nextTarget)
                      ) {
                        cancelDesktopMenuClose();
                        return;
                      }

                      if (event.pointerType !== "touch") {
                        clickedDesktopDropdownRef.current = null;
                        scheduleDesktopMenuClose(item.href);
                      }
                    }}
                  >
                    <a
                      aria-current={active ? "location" : undefined}
                      className={`nav-link ${active ? "is-active" : ""}`}
                      href={item.href}
                      onClick={() => closeDesktopDropdown(item.href)}
                    >
                      <span>{item.label}</span>
                      <NavMicroIcon href={item.href} />
                    </a>
                    <button
                      aria-controls={dropdownId}
                      aria-expanded={dropdownOpen}
                      aria-haspopup="true"
                      aria-label={`${
                        dropdownOpen ? "Cerrar" : "Abrir"
                      } opciones de ${item.label}`}
                      className="nav-dropdown-trigger"
                      id={triggerId}
                      onClick={() => {
                        setMenuInteractionMode("pinned");
                        cancelDesktopMenuOpen();
                        cancelDesktopMenuClose();
                        const pinned =
                          clickedDesktopDropdownRef.current === item.href;
                        clickedDesktopDropdownRef.current = pinned
                          ? null
                          : item.href;
                        dismissedDesktopDropdownRef.current = null;
                        activeDesktopMenuRef.current = pinned ? null : item.href;
                        setActiveDesktopMenu(pinned ? null : item.href);
                      }}
                      ref={(element) => {
                        desktopTriggerRefs.current[item.href] = element;
                      }}
                      type="button"
                    >
                      <ChevronIcon className="nav-dropdown-chevron h-3 w-3 rotate-90" />
                    </button>
                    <div
                      aria-labelledby={triggerId}
                      className="nav-dropdown"
                      hidden={!dropdownOpen}
                      id={dropdownId}
                      onPointerEnter={(event) => {
                        if (event.pointerType !== "touch") {
                          cancelDesktopMenuClose();
                        }
                      }}
                    >
                      <div className="nav-dropdown-heading">
                        <p>{dropdown.eyebrow}</p>
                      </div>
                      <div className="nav-dropdown-grid">
                        <div className="nav-dropdown-branches">
                          {dropdown.items.map((dropdownItem) => {
                            const submenuId = `${dropdownId}-${dropdownItem.id}`;
                            const submenuOpen =
                              dropdownItem.id === activeDropdownGroup?.id;
                            return (
                              <button
                                aria-controls={submenuId}
                                aria-expanded={submenuOpen}
                                aria-haspopup="menu"
                                className={`nav-category-link ${
                                  submenuOpen ? "is-active" : ""
                                }`}
                                key={dropdownItem.id}
                                onClick={() => {
                                  setMenuInteractionMode("pinned");
                                  setActiveSubmenu(
                                    `${item.href}:${dropdownItem.id}`
                                  );
                                }}
                                onFocus={() => {
                                  setMenuInteractionMode("keyboard");
                                  setActiveSubmenu(
                                    `${item.href}:${dropdownItem.id}`
                                  );
                                }}
                                onPointerEnter={(event) => {
                                  if (event.pointerType !== "touch") {
                                    setMenuInteractionMode("pointer");
                                    setActiveSubmenu(
                                      `${item.href}:${dropdownItem.id}`
                                    );
                                  }
                                }}
                                type="button"
                              >
                                <PropertyIcon
                                  className="nav-property-icon h-6 w-6"
                                  type={dropdownItem.icon}
                                />
                                <span>{dropdownItem.label}</span>
                                <ChevronIcon className="ml-auto h-4 w-4 opacity-55" />
                              </button>
                            );
                          })}
                        </div>
                        {activeDropdownGroup ? (
                          <div
                            aria-label={activeDropdownGroup.label}
                            className="nav-submenu"
                            id={`${dropdownId}-${activeDropdownGroup.id}`}
                            role="menu"
                          >
                            <p>{activeDropdownGroup.label}</p>
                            {activeDropdownGroup.children.map((child) => (
                              <a
                                href={child.href}
                                key={child.href}
                                onClick={() =>
                                  closeDesktopDropdown(item.href, true)
                                }
                                role="menuitem"
                              >
                                <PropertyIcon className="h-5 w-5" type={child.icon} />
                                <span>{child.label}</span>
                                <ArrowIcon className="ml-auto h-4 w-4 opacity-45" />
                              </a>
                            ))}
                          </div>
                        ) : null}
                      </div>
                    </div>
                  </div>
                );
              })}
          </div>

          <a
            aria-current={
              activeSection === "contacto" ? "location" : undefined
            }
            className={`nav-contact-cta ${
              activeSection === "contacto" ? "is-active" : ""
            }`}
            href="#contacto"
            onClick={() => {
              closeDesktopDropdown(activeDesktopMenu ?? "#contacto");
            }}
          >
            <SiteText id="texto-3" /><ArrowIcon />
          </a>
        </nav>

        <div className="mobile-navigation-control">
          <button
            aria-controls="mobile-navigation-panel"
            aria-expanded={mobileOpen}
            aria-label={mobileOpen ? "Cerrar menú" : "Abrir menú"}
            className="mobile-menu-trigger"
            onClick={() => setMobileOpen((current) => !current)}
            ref={mobileTriggerRef}
            type="button"
          >
            <span className="sr-only">
              {mobileOpen ? "Cerrar menú" : "Abrir menú"}
            </span>
            <MenuIcon open={mobileOpen} />
          </button>
        </div>
      </div>

      {mobileOpen ? (
        <div className="mobile-menu-layer" onKeyDown={handleMobileMenuKeyDown}>
          <button
            aria-label="Cerrar menú"
            className="mobile-menu-backdrop"
            onClick={() => closeMobileMenu()}
            tabIndex={-1}
            type="button"
          />
          <div
            aria-labelledby="mobile-menu-title"
            aria-modal="true"
            className="mobile-menu-panel"
            id="mobile-navigation-panel"
            ref={mobilePanelRef}
            role="dialog"
          >
            <div className="mobile-menu-header">
              <p id="mobile-menu-title"><SiteText id="texto-4" /></p>
              <button
                aria-label="Cerrar menú"
                className="mobile-menu-close"
                onClick={() => closeMobileMenu()}
                ref={mobileCloseButtonRef}
                type="button"
              >
                <MenuIcon open />
              </button>
            </div>
            <nav
              aria-label="Navegación principal"
              className="mobile-menu-navigation"
            >
              {navigation
                .filter((item) => item.href !== "#contacto")
                .map((item) => {
                  const dropdown =
                    navDropdownByHref[
                      item.href as keyof typeof navDropdownByHref
                    ];
                  const active = activeSection === item.href.slice(1);

                  return (
                    <div className="mobile-menu-group" key={item.href}>
                      <a
                        aria-current={active ? "location" : undefined}
                        className={`mobile-menu-main-link ${
                          active ? "is-active" : ""
                        }`}
                        href={item.href}
                        onClick={() => closeMobileMenu()}
                      >
                        <span>{item.label}</span>
                        <NavMicroIcon href={item.href} />
                      </a>
                      {dropdown ? (
                        <div
                          aria-label={`Opciones de ${item.label}`}
                          className="mobile-menu-sublinks"
                          role="group"
                        >
                          {dropdown.items.map((dropdownItem) => (
                            <div
                              className="mobile-menu-subgroup"
                              key={dropdownItem.id}
                            >
                              <p>{dropdownItem.label}</p>
                              {dropdownItem.children.map((child) => (
                                <a
                                  href={child.href}
                                  key={child.href}
                                  onClick={() => closeMobileMenu()}
                                >
                                  <PropertyIcon
                                    className="h-4 w-4"
                                    type={child.icon}
                                  />
                                  {child.label}
                                </a>
                              ))}
                            </div>
                          ))}
                        </div>
                      ) : null}
                    </div>
                  );
                })}
              <a
                aria-current={
                  activeSection === "contacto" ? "location" : undefined
                }
                className="mobile-menu-contact"
                href="#contacto"
                onClick={() => closeMobileMenu()}
              >
                <SiteText id="texto-5" /><ArrowIcon />
              </a>
            </nav>
            <p className="mobile-menu-footnote">
              <SiteText id="texto-6" /></p>
          </div>
        </div>
      ) : null}
    </header>
  );
}

function BellomoIntro({ onComplete }: { onComplete: () => void }) {
  const completedRef = useRef(false);
  const fallbackRef = useRef<number | null>(null);
  const startedAtRef = useRef(0);
  const [visible, setVisible] = useState(true);

  const finishIntro = useCallback(() => {
    if (completedRef.current) return;
    completedRef.current = true;
    if (fallbackRef.current !== null) {
      window.clearTimeout(fallbackRef.current);
      fallbackRef.current = null;
    }
    const duration = Math.round(performance.now() - startedAtRef.current);
    document.documentElement.dataset.introDurationMs = String(duration);
    setVisible(false);
    onComplete();
  }, [onComplete]);

  useEffect(() => {
    startedAtRef.current = performance.now();
    const reducedMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)"
    ).matches;
    fallbackRef.current = window.setTimeout(
      finishIntro,
      reducedMotion ? 320 : 1100
    );

    return () => {
      if (fallbackRef.current !== null) {
        window.clearTimeout(fallbackRef.current);
        fallbackRef.current = null;
      }
    };
  }, [finishIntro]);

  if (!visible) return null;

  return (
    <div
      aria-label="Bellomo"
      className="bellomo-intro"
      onAnimationEnd={(event) => {
        if (
          event.currentTarget === event.target &&
          (event.animationName === "bellomo-intro-shell" ||
            event.animationName === "bellomo-intro-reduced")
        ) {
          finishIntro();
        }
      }}
      role="status"
    >
      <div aria-hidden="true" className="bellomo-intro-scene">
        <div className="bellomo-intro-logo">
          <div className="bellomo-intro-face is-front">
            <Brand className="h-auto w-[190px]" eager />
          </div>
          <div className="bellomo-intro-face is-back">
            <Brand className="h-auto w-[190px]" eager />
          </div>
        </div>
      </div>
      <span className="sr-only"><SiteText id="texto-7" /></span>
    </div>
  );
}

function HeroSlider({
  introReady,
  slides,
}: {
  introReady: boolean;
  slides: HeroSlide[];
}) {
const whatsappHref = useWhatsAppHref();

  const [activeSlide, setActiveSlide] = useState(0);
  const [focusPaused, setFocusPaused] = useState(false);
  const [hoverPaused, setHoverPaused] = useState(false);
  const [manualPaused, setManualPaused] = useState(false);
  const [pageVisible, setPageVisible] = useState(true);
  const manualPauseTimerRef = useRef<number | null>(null);
  const slide = slides[activeSlide % slides.length];

  useEffect(() => {
    const updatePageVisibility = () => setPageVisible(!document.hidden);

    updatePageVisibility();
    document.addEventListener("visibilitychange", updatePageVisibility);
    return () =>
      document.removeEventListener("visibilitychange", updatePageVisibility);
  }, []);

  useEffect(() => {
    const reducedMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)"
    ).matches;

    if (
      focusPaused ||
      hoverPaused ||
      !introReady ||
      manualPaused ||
      !pageVisible ||
      reducedMotion ||
      slides.length < 2
    )
      return;

    const interval = window.setInterval(() => {
      const hero = document.getElementById("inicio");
      const rect = hero?.getBoundingClientRect();
      if (!rect || rect.bottom <= 0 || rect.top >= window.innerHeight) return;
      setActiveSlide((current) => (current + 1) % slides.length);
    }, 4400);

    return () => window.clearInterval(interval);
  }, [focusPaused, hoverPaused, introReady, manualPaused, pageVisible, slides.length]);

  useEffect(
    () => () => {
      if (manualPauseTimerRef.current !== null) {
        window.clearTimeout(manualPauseTimerRef.current);
      }
    },
    []
  );

  const showSlide = (index: number) => {
    setActiveSlide((index + slides.length) % slides.length);
    setManualPaused(true);
    if (manualPauseTimerRef.current !== null) {
      window.clearTimeout(manualPauseTimerRef.current);
    }
    manualPauseTimerRef.current = window.setTimeout(() => {
      manualPauseTimerRef.current = null;
      setManualPaused(false);
    }, 9000);
  };

  return (
    <section
      aria-label="Presentación principal de Bellomo"
      className={`hero-slider ${
        introReady ? "is-intro-ready" : "is-intro-waiting"
      } relative flex min-h-[640px] flex-col overflow-hidden bg-[#06324d] text-white sm:min-h-[700px] lg:min-h-[100svh]`}
      id="inicio"
      onBlurCapture={(event) => {
        if (
          !event.currentTarget.contains(event.relatedTarget as Node | null)
        ) {
          setFocusPaused(false);
        }
      }}
      onFocusCapture={() => setFocusPaused(true)}
      onMouseEnter={() => setHoverPaused(true)}
      onMouseLeave={() => setHoverPaused(false)}
    >
      {slides.map((item, index) => (
        <ResilientMedia
          className={`hero-slide-media ${
            index === activeSlide ? "is-active" : ""
          }`}
          decorative
          eager={index === 0}
          key={item.id}
          media={item.media}
        />
      ))}

      <div
        aria-hidden="true"
        className="absolute inset-0 bg-[linear-gradient(90deg,rgba(3,30,47,0.84)_0%,rgba(3,35,54,0.60)_43%,rgba(3,35,54,0.08)_78%,rgba(3,35,54,0.18)_100%)] max-lg:bg-[linear-gradient(180deg,rgba(3,30,47,0.74)_0%,rgba(3,35,54,0.44)_43%,rgba(3,30,47,0.86)_100%)]"
      />
      <div aria-hidden="true" className="hero-vignette absolute inset-0" />
      <div
        className="relative z-10 mx-auto flex w-full max-w-[90rem] flex-1 items-center px-5 pb-28 pt-32 sm:px-8 sm:pb-32 sm:pt-36 lg:px-12 lg:pb-28 lg:pt-36"
        id="contenido"
      >
        <div className="hero-slide-copy max-w-4xl" key={slide.id}>
          <p className="eyebrow text-[11px] font-bold uppercase tracking-[0.25em] text-white/78 sm:text-xs">
            {slide.eyebrow}</p>
          <h1 className="hero-title font-display mt-6 max-w-5xl text-[clamp(3.25rem,14vw,4.25rem)] leading-[0.88] tracking-[-0.055em] text-white sm:text-[5.9rem] lg:text-[7.35rem] xl:text-[8.15rem]">
            {slide.title}<span className="block text-[#e7d5af]">{slide.emphasis}</span>
          </h1>
          <p className="hero-description mt-7 max-w-xl text-base leading-7 text-white/82 sm:mt-8 sm:text-lg sm:leading-8">
            {slide.description}</p>
          <div className="mt-9 flex flex-col gap-3 sm:flex-row">
            <a
              className="primary-cta group inline-flex items-center justify-between gap-8 bg-white px-6 py-4 text-[12px] font-bold uppercase tracking-[0.13em] text-[#07334d] sm:justify-start sm:px-7"
              href="#desarrollos-seleccionados"
            >
              <SiteText id="texto-12" /><ArrowIcon className="h-5 w-5 transition-transform group-hover:translate-x-1" />
            </a>
            <a
              className="secondary-cta inline-flex items-center justify-center gap-3 border-0 px-0 py-3 text-[12px] font-bold uppercase tracking-[0.13em] text-white sm:border sm:border-white/45 sm:px-6 sm:py-4"
              href={whatsappHref(
                "Hola Bellomo, quiero conocer los proyectos disponibles."
              )}
              rel="noreferrer"
              target="_blank"
            >
              <WhatsAppIcon />
              <SiteText id="texto-13" /></a>
          </div>
        </div>
      </div>

      <div
        aria-label={`Slide ${activeSlide + 1} de ${slides.length}`}
        className="hero-slider-controls"
      >
        <div className="flex items-center gap-2">
          {slides.map((item, index) => (
            <button
              aria-label={`Mostrar slide ${index + 1}: ${item.title} ${item.emphasis}`}
              aria-pressed={index === activeSlide}
              className={`hero-slide-dot ${
                index === activeSlide ? "is-active" : ""
              }`}
              key={item.id}
              onClick={() => showSlide(index)}
              type="button"
            >
              <span>{String(index + 1).padStart(2, "0")}</span>
            </button>
          ))}
        </div>
      </div>

      <a
        aria-label="Continuar hacia Bellomo en síntesis"
        className="hero-scroll-cue"
        href="#bellomo"
      >
        <span><SiteText id="texto-14" /></span>
        <span aria-hidden="true" className="hero-scroll-line" />
      </a>
    </section>
  );
}

function formatMetric(metric: Metric, value = metric.value) {
  const decimals = metric.decimals ?? 0;
  return `${metric.prefix ?? ""}${value.toFixed(decimals)}${metric.suffix ?? ""}`;
}

function MetricCounter({ metric }: { metric: Metric }) {
  const accessibleValue = formatMetric(metric);

  return (
    <div
      aria-label={`${accessibleValue} ${metric.label}`}
      className="counter-cell"
      data-counter="true"
      data-counter-decimals={metric.decimals ?? 0}
      data-counter-prefix={metric.prefix ?? ""}
      data-counter-state="armed"
      data-counter-suffix={metric.suffix ?? ""}
      data-counter-value={metric.value}
    >
      <dd aria-hidden="true" data-counter-output>
        {accessibleValue}
      </dd>
      <dt>{metric.label}</dt>
    </div>
  );
}

function SectionReveal({
  children,
  className = "",
  delay = 0,
  replay = false,
  variant = "up",
}: {
  children: ReactNode;
  className?: string;
  delay?: number;
  replay?: boolean;
  variant?: "blueprint" | "fade" | "image" | "panel" | "stagger" | "up";
}) {
  return (
    <div
      className={`section-reveal ${className}`}
      data-motion-state="before"
      data-motion-variant={variant}
      data-replay={replay ? "true" : "false"}
      data-reveal={variant}
      style={{ "--reveal-delay": `${delay}ms` } as CSSProperties}
    >
      {children}
    </div>
  );
}

function ProjectCard({ project }: { project: Project }) {
const whatsappHref = useWhatsAppHref();

  return (
    <article
      className="project-card rail-card group relative min-h-[390px] shrink-0 snap-start overflow-hidden sm:min-h-[460px]"
      id={project.id}
    >
      <ResilientMedia
        className="project-image absolute inset-0"
        decorative
        media={project.media}
      />
      <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(2,24,36,0.08)_5%,rgba(2,27,42,0.93)_100%)]" />
      <div className="relative flex min-h-[390px] flex-col justify-between p-6 sm:min-h-[460px] sm:p-9">
        <p className="self-end border-b border-white/40 pb-2 text-[10px] font-bold uppercase tracking-[0.14em] text-white/85">
          {project.status}
        </p>
        <div>
          <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-[#e7d5af]">
            {project.type} · {project.location}
          </p>
          <h3 className="font-display mt-3 text-4xl leading-[0.94] tracking-[-0.035em] text-white sm:text-5xl">
            {project.name}
          </h3>
          <p className="mt-3 text-sm leading-6 text-white/80">{project.description}</p>
          <a
            aria-label={`Consultar por ${project.name}`}
            className="project-card-cta mt-7 inline-flex items-center gap-4 border-b border-white/45 pb-2 text-[11px] font-bold uppercase tracking-[0.13em] text-white"
            href={whatsappHref(
              `Hola Bellomo, quiero información sobre ${project.name}.`
            )}
            rel="noreferrer"
            target="_blank"
          >
            <SiteText id="texto-15" /><ArrowIcon className="h-5 w-5" />
          </a>
        </div>
      </div>
    </article>
  );
}

function DevelopmentRail({ projects }: { projects: Project[] }) {
  const railRef = useRef<HTMLDivElement>(null);

  const moveRail = (direction: -1 | 1) => {
    const rail = railRef.current;
    if (!rail) return;

    const reducedMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)"
    ).matches;

    rail.scrollBy({
      behavior: reducedMotion ? "auto" : "smooth",
      left: rail.clientWidth * 0.82 * direction,
    });
  };

  return (
    <>
      <div className="mb-6 flex items-center justify-between gap-6">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.19em] text-[#e7d5af]">
            <SiteText id="texto-16" /></p>
          <p className="mt-2 text-sm text-white/55">
            {projects.length} <SiteText id="texto-17" /></p>
        </div>
        <div className="hidden gap-2 sm:flex">
          <button
            aria-label="Ver desarrollos anteriores"
            className="rail-button"
            onClick={() => moveRail(-1)}
            type="button"
          >
            <ChevronIcon direction="left" />
          </button>
          <button
            aria-label="Ver desarrollos siguientes"
            className="rail-button"
            onClick={() => moveRail(1)}
            type="button"
          >
            <ChevronIcon />
          </button>
        </div>
      </div>
      <div
        aria-label="Otros desarrollos Bellomo"
        className="development-rail"
        onKeyDown={(event) => {
          if (event.key === "ArrowLeft") {
            event.preventDefault();
            moveRail(-1);
          } else if (event.key === "ArrowRight") {
            event.preventDefault();
            moveRail(1);
          }
        }}
        ref={railRef}
        role="region"
        tabIndex={0}
      >
        {projects.map((project) => (
          <ProjectCard key={project.id} project={project} />
        ))}
      </div>
    </>
  );
}

function ScrollBatteryButton() {
  const buttonRef = useRef<HTMLButtonElement>(null);
  const completionPulsedRef = useRef(false);
  const [completionPulse, setCompletionPulse] = useState(false);
  const [direction, setDirection] = useState<ScrollDirection>("down");
  const [mode, setMode] = useState<"complete" | "reading" | "top">("top");

  useEffect(() => {
    const handleCoordinatedScroll = (event: Event) => {
      const detail = (event as CustomEvent<BellomoScrollDetail>).detail;
      buttonRef.current?.style.setProperty(
        "--scroll-progress",
        detail.progress.toFixed(4)
      );
      const nextMode =
        detail.footerVisible || detail.progress >= 0.995
          ? "complete"
          : detail.progress >= 0.08
            ? "reading"
            : "top";

      setMode((current) => (current === nextMode ? current : nextMode));
      setDirection((current) =>
        current === detail.direction ? current : detail.direction
      );

      if (nextMode === "complete" && !completionPulsedRef.current) {
        completionPulsedRef.current = true;
        setCompletionPulse(true);
      }
    };

    window.addEventListener(BELLOMO_SCROLL_EVENT, handleCoordinatedScroll);
    return () => {
      window.removeEventListener(BELLOMO_SCROLL_EVENT, handleCoordinatedScroll);
    };
  }, []);

  const handleScrollAction = () => {
    const reducedMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)"
    ).matches;

    if (mode === "top") {
      document.getElementById("bellomo")?.scrollIntoView({
        behavior: reducedMotion ? "auto" : "smooth",
        block: "start",
      });
      return;
    }

    window.scrollTo({ behavior: reducedMotion ? "auto" : "smooth", top: 0 });
  };

  return (
    <button
      aria-label={
        mode === "top" ? "Ir a la siguiente sección" : "Volver al inicio"
      }
      className={`scroll-battery-button is-${mode} ${
        completionPulse ? "has-completion-pulse" : ""
      }`}
      data-scroll-direction={direction}
      onClick={handleScrollAction}
      ref={buttonRef}
      style={{ "--scroll-progress": 0 } as CSSProperties}
      type="button"
    >
      <span aria-hidden="true" className="scroll-battery-cells">
        {Array.from({ length: 8 }, (_, index) => (
          <span
            className="scroll-battery-cell"
            key={index}
            style={{ "--battery-cell": index } as CSSProperties}
          />
        ))}
      </span>
      <span className="scroll-battery-inner">
        {mode === "top" ? <DownIcon /> : <UpIcon />}
      </span>
    </button>
  );
}

type BusinessAreaId = "commercial" | "construction";

function BusinessFocus() {
const { content: website } = useWebsite();

const { bellomoEditorialImages, constructionHighlights } = useSiteData();

const whatsappHref = useWhatsAppHref();

  const priorityUntilRef = useRef(0);
  const interactionPausedRef = useRef(false);
  const [activeArea, setActiveArea] = useState<BusinessAreaId>("commercial");
  const areas: {
    action: string;
    description: string;
    href: string;
    icon: PropertyCategory["icon"];
    id: BusinessAreaId;
    media: BellomoImage;
    title: string;
  }[] = [
    {
      action: website.texts["texto-106"].value,
      description: website.texts["texto-107"].value,
      href: "#desarrollos-seleccionados",
      icon: "land",
      id: "commercial",
      media: bellomoEditorialImages.commercial,
      title: website.texts["texto-108"].value,
    },
    {
      action: website.texts["texto-109"].value,
      description: website.texts["texto-110"].value,
      href: whatsappHref("Hola Bellomo, quiero consultar por una obra."),
      icon: "building",
      id: "construction",
      media: constructionHighlights[1]?.media ?? bellomoEditorialImages.about,
      title: website.texts["texto-111"].value,
    },
  ];
  const currentArea =
    areas.find((area) => area.id === activeArea) ?? areas[0];

  const activateArea = (id: BusinessAreaId, userInitiated = true) => {
    setActiveArea(id);
    if (userInitiated) priorityUntilRef.current = Date.now() + 10000;
  };

  useEffect(() => {
    const syncAreaWithHash = () => {
      if (window.location.hash === "#constructora") {
        activateArea("construction", false);
      } else if (window.location.hash === "#comercializadora") {
        activateArea("commercial", false);
      }
    };

    syncAreaWithHash();
    window.addEventListener("hashchange", syncAreaWithHash);
    return () => window.removeEventListener("hashchange", syncAreaWithHash);
  }, []);

  useEffect(() => {
    const reducedMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)"
    ).matches;
    if (reducedMotion) return;

    const interval = window.setInterval(() => {
      const section = document.getElementById("comercializadora");
      const rect = section?.getBoundingClientRect();
      const visible =
        rect && rect.bottom > window.innerHeight * 0.2 && rect.top < window.innerHeight * 0.8;

      if (
        !visible ||
        interactionPausedRef.current ||
        document.hidden ||
        Date.now() < priorityUntilRef.current
      ) {
        return;
      }

      setActiveArea((current) =>
        current === "commercial" ? "construction" : "commercial"
      );
    }, 7000);

    return () => window.clearInterval(interval);
  }, []);

  if (!currentArea) return null;

  return (
    <section
      className="business-focus-section relative px-5 py-20 sm:px-8 sm:py-24 lg:px-12 lg:py-28"
      id="comercializadora"
    >
      <span aria-hidden="true" className="business-anchor-constructora" id="constructora" />
      <span aria-hidden="true" className="anchor-alias" id="obras-publicas" />
      <span aria-hidden="true" className="anchor-alias" id="obras-privadas" />
      <SectionReveal
        className="business-focus-shell mx-auto grid max-w-[86rem] overflow-hidden lg:grid-cols-[0.88fr_1.12fr]"
        replay
        variant="stagger"
      >
        <div
          className="business-focus-copy motion-copy"
          onBlurCapture={(event) => {
            if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
              interactionPausedRef.current = false;
            }
          }}
          onFocusCapture={() => {
            interactionPausedRef.current = true;
            priorityUntilRef.current = Date.now() + 10000;
          }}
          onPointerLeave={() => {
            interactionPausedRef.current = false;
          }}
        >
          <p
            className="section-label section-label-light"
            data-motion-item="eyebrow"
          >
            <SiteText id="texto-18" /></p>
          <h2
            className="font-display mt-5 max-w-xl text-4xl leading-[0.98] tracking-[-0.04em] text-white sm:text-5xl"
            data-motion-item="heading"
          >
            <SiteText id="texto-19" /></h2>
          <div
            aria-label="Áreas Bellomo"
            className="business-tabs"
            data-motion-item="body"
            role="tablist"
          >
            {areas.map((area) => {
              const active = area.id === activeArea;
              return (
                <button
                  aria-controls="business-focus-panel"
                  aria-selected={active}
                  className={`business-tab ${active ? "is-active" : ""}`}
                  key={area.id}
                  onClick={() => activateArea(area.id)}
                  onPointerEnter={(event) => {
                    if (event.pointerType !== "touch") {
                      interactionPausedRef.current = true;
                      activateArea(area.id);
                    }
                  }}
                  role="tab"
                  type="button"
                >
                  <PropertyIcon className="h-6 w-6" type={area.icon} />
                  <span>{area.id === "commercial" ? "Comercializadora" : "Constructora"}</span>
                </button>
              );
            })}
          </div>
          <div
            aria-live="polite"
            className="business-focus-panel"
            data-motion-item="action"
            id="business-focus-panel"
            role="tabpanel"
          >
            <p className="font-display text-3xl leading-tight text-white sm:text-4xl">
              {currentArea.title}
            </p>
            <p className="mt-3 text-sm leading-6 text-white/66 sm:text-base">
              {currentArea.description}
            </p>
            <a
              className="business-focus-action group mt-7 inline-flex items-center gap-4"
              href={currentArea.href}
              rel={currentArea.id === "construction" ? "noreferrer" : undefined}
              target={currentArea.id === "construction" ? "_blank" : undefined}
            >
              {currentArea.action}
              <ArrowIcon className="h-5 w-5" />
            </a>
          </div>
        </div>

        <div
          aria-live="off"
          className="business-focus-visual"
          data-motion-item="image"
        >
          {areas.map((area) => (
            <ResilientMedia
              className={`business-focus-media ${area.id === activeArea ? "is-active" : ""}`}
              decorative
              key={area.id}
              media={area.media}
            />
          ))}
          <div className="business-focus-image-overlay" />
          <span className="business-focus-index">
            {activeArea === "commercial" ? "01" : "02"} / 02
          </span>
        </div>
      </SectionReveal>
    </section>
  );
}

function SocialRail({ footerVisible }: { footerVisible: boolean }) {
const { content: website } = useWebsite();

  const links = [
    {
      href: website.links["enlace-46"].value,
      icon: <InstagramIcon />,
      label: website.texts["texto-112"].value,
    },
    {
      href: website.links["enlace-47"].value,
      icon: <FacebookIcon />,
      label: website.texts["texto-113"].value,
    },
  ];

  return (
    <aside
      aria-label="Redes sociales de Bellomo"
      className={`social-rail ${footerVisible ? "is-footer-visible" : ""}`}
    >
      {links.map((link, index) => (
        <a
          aria-label={`Bellomo en ${link.label}`}
          href={link.href}
          key={link.label}
          rel="noopener noreferrer"
          style={{ "--social-delay": `${280 + index * 90}ms` } as CSSProperties}
          target="_blank"
        >
          {link.icon}
          <span>{link.label}</span>
        </a>
      ))}
    </aside>
  );
}

function HomeContent() {
const { bellomoContact, bellomoEditorialImages, bellomoProjects, bellomoStats, heroSlides, propertyCategories } = useSiteData();

const whatsappHref = useWhatsAppHref();

const { content: website } = useWebsite();

  const selectedProjects = bellomoProjects;
const phones = bellomoContact.commercialPhones.split("·").map(phone => phone.trim()).filter(Boolean);
const phoneHref = (phone: string) => "tel:" + phone.replace(/[^+0-9]/g, "");
  const footerRef = useRef<HTMLElement>(null);
  const footerVisibleRef = useRef(false);
  const [footerVisible, setFooterVisible] = useState(false);
  const [introComplete, setIntroComplete] = useState(false);
  const handleIntroComplete = useCallback(() => setIntroComplete(true), []);
  const currentYear = new Date().getFullYear();

  useEffect(() => {
    const root = document.documentElement;
    const revealElements = Array.from(
      document.querySelectorAll<HTMLElement>(".section-reveal")
    );
    const counterElements = Array.from(
      document.querySelectorAll<HTMLElement>("[data-counter='true']")
    );
    const reducedMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)"
    ).matches;
    const runningCounters = new Map<HTMLElement, number>();
    let frame: number | null = null;
    let lastScrollY = window.scrollY;
    let scrollDirection: ScrollDirection = "down";
    let candidateDirection: ScrollDirection = scrollDirection;
    let directionTravel = 0;

    const renderCounter = (element: HTMLElement, value: number) => {
      const output = element.querySelector<HTMLElement>("[data-counter-output]");
      if (!output) return;
      const decimals = Number(element.dataset.counterDecimals ?? 0);
      const prefix = element.dataset.counterPrefix ?? "";
      const suffix = element.dataset.counterSuffix ?? "";
      output.textContent = `${prefix}${value.toFixed(decimals)}${suffix}`;
    };

    const armCounter = (element: HTMLElement) => {
      runningCounters.delete(element);
      element.dataset.counterState = "armed" satisfies CounterState;
      renderCounter(element, 0);
    };

    const completeCounter = (element: HTMLElement) => {
      runningCounters.delete(element);
      element.dataset.counterState = "complete" satisfies CounterState;
      renderCounter(element, Number(element.dataset.counterValue ?? 0));
    };

    const updateCounterAnimations = (now: number) => {
      runningCounters.forEach((startedAt, element) => {
        const elapsed = Math.min((now - startedAt) / 1200, 1);
        const eased = 1 - Math.pow(1 - elapsed, 3);
        const target = Number(element.dataset.counterValue ?? 0);
        const decimals = Number(element.dataset.counterDecimals ?? 0);
        const multiplier = 10 ** decimals;
        const nextValue = Math.round(target * eased * multiplier) / multiplier;
        renderCounter(element, nextValue);

        if (elapsed >= 1) completeCounter(element);
      });
    };

    const updateMotionStates = () => {
      const viewportHeight = Math.max(window.innerHeight, 1);

      revealElements.forEach((element) => {
        const rect = element.getBoundingClientRect();
        const visiblePixels = Math.max(
          Math.min(rect.bottom, viewportHeight) - Math.max(rect.top, 0),
          0
        );
        const presence = Math.min(
          visiblePixels / Math.max(Math.min(rect.height, viewportHeight), 1),
          1
        );
        let motionState: MotionState;

        if (rect.bottom <= 0) {
          motionState = "after";
        } else if (rect.top >= viewportHeight) {
          motionState = "before";
        } else if (
          presence >= 0.58 ||
          (rect.top <= viewportHeight * 0.28 &&
            rect.bottom >= viewportHeight * 0.72)
        ) {
          motionState = "active";
        } else if (scrollDirection === "down") {
          motionState =
            rect.top >= viewportHeight * 0.36 ? "entering" : "leaving";
        } else {
          motionState =
            rect.bottom <= viewportHeight * 0.64 ? "entering" : "leaving";
        }

        element.dataset.inView = presence >= 0.12 ? "true" : "false";
        element.dataset.motionState = motionState;
        element.style.setProperty("--motion-presence", presence.toFixed(3));
      });
    };

    const scheduleMotionUpdate = () => {
      if (frame === null) {
        frame = requestAnimationFrame(updateMotion);
      }
    };

    const revealObserver =
      reducedMotion || !("IntersectionObserver" in window)
        ? null
        : new IntersectionObserver(
            (entries) => {
              entries.forEach((entry) => {
                const element = entry.target as HTMLElement;

                if (element.dataset.counter === "true") {
                  const counterState =
                    (element.dataset.counterState as CounterState | undefined) ??
                    "armed";

                  if (reducedMotion) {
                    completeCounter(element);
                  } else if (
                    entry.intersectionRatio >= 0.45 &&
                    counterState === "armed"
                  ) {
                    renderCounter(element, 0);
                    element.dataset.counterState = "running" satisfies CounterState;
                    runningCounters.set(element, performance.now());
                  } else if (
                    entry.intersectionRatio <= 0.1 &&
                    counterState !== "armed"
                  ) {
                    armCounter(element);
                  }

                  return;
                }

                element.dataset.motionObserved = entry.isIntersecting
                  ? "true"
                  : "false";
              });
              scheduleMotionUpdate();
            },
            {
              rootMargin: "-4% 0px -8% 0px",
              threshold: [0, 0.1, 0.12, 0.4, 0.45],
            }
          );

    revealElements.forEach((element) => revealObserver?.observe(element));
    counterElements.forEach((element) => {
      if (reducedMotion || !revealObserver) completeCounter(element);
      else armCounter(element);
      revealObserver?.observe(element);
    });

    function updateMotion(now = performance.now()) {
      frame = null;
      const nextScrollY = Math.max(window.scrollY, 0);
      const delta = nextScrollY - lastScrollY;

      root.style.setProperty(
        "--hero-scroll-offset",
        Math.min(nextScrollY * 0.055, 48) + "px"
      );
      root.style.setProperty(
        "--hero-proof-offset",
        Math.max(nextScrollY * -0.018, -18) + "px"
      );

      if (Math.abs(delta) >= 1) {
        const nextDirection: ScrollDirection = delta > 0 ? "down" : "up";

        if (nextDirection === scrollDirection) {
          candidateDirection = scrollDirection;
          directionTravel = 0;
        } else if (nextDirection === candidateDirection) {
          directionTravel += Math.abs(delta);
        } else {
          candidateDirection = nextDirection;
          directionTravel = Math.abs(delta);
        }

        if (directionTravel >= 8) {
          scrollDirection = candidateDirection;
          directionTravel = 0;
        }

        lastScrollY = nextScrollY;
        root.dataset.scrollDirection = scrollDirection;
      }

      updateMotionStates();
      updateCounterAnimations(now);

      const footer = footerRef.current;
      const footerRect = footer?.getBoundingClientRect();
      const nextFooterVisible = Boolean(
        footerRect &&
          footerRect.top < window.innerHeight &&
          footerRect.bottom > 0
      );
      if (footerVisibleRef.current !== nextFooterVisible) {
        footerVisibleRef.current = nextFooterVisible;
        setFooterVisible(nextFooterVisible);
      }

      const footerTop =
        footer?.offsetTop ?? document.documentElement.scrollHeight;
      const completionPoint = Math.max(footerTop - window.innerHeight, 1);
      const progress = nextFooterVisible
        ? 1
        : Math.min(Math.max(nextScrollY / completionPoint, 0), 1);
      root.style.setProperty("--page-scroll-progress", progress.toFixed(4));
      root.style.setProperty(
        "--scroll-direction-factor",
        scrollDirection === "down" ? "1" : "-1"
      );

      window.dispatchEvent(
        new CustomEvent<BellomoScrollDetail>(BELLOMO_SCROLL_EVENT, {
          detail: {
            direction: scrollDirection,
            footerVisible: nextFooterVisible,
            progress,
            scrollY: nextScrollY,
          },
        })
      );

      if (runningCounters.size > 0) scheduleMotionUpdate();
    }

    const handleVisibilityChange = () => {
      if (document.hidden) {
        Array.from(runningCounters.keys()).forEach(completeCounter);
      } else {
        scheduleMotionUpdate();
      }
    };

    root.dataset.scrollDirection = "down";
    updateMotion();
    root.classList.add("motion-ready");
    window.addEventListener("scroll", scheduleMotionUpdate, { passive: true });
    window.addEventListener("resize", scheduleMotionUpdate);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      revealObserver?.disconnect();
      root.classList.remove("motion-ready");
      delete root.dataset.scrollDirection;
      root.style.removeProperty("--hero-scroll-offset");
      root.style.removeProperty("--hero-proof-offset");
      root.style.removeProperty("--page-scroll-progress");
      root.style.removeProperty("--scroll-direction-factor");
      revealElements.forEach((element) => {
        delete element.dataset.inView;
        delete element.dataset.motionObserved;
        delete element.dataset.motionState;
        element.style.removeProperty("--motion-presence");
      });
      window.removeEventListener("scroll", scheduleMotionUpdate);
      window.removeEventListener("resize", scheduleMotionUpdate);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      runningCounters.clear();
      if (frame !== null) cancelAnimationFrame(frame);
    };
  }, [website]);

  return (
    <ManagedPage className="overflow-x-clip bg-[#f4f1ea] text-[#102a3a]">
      <a
        className="sr-only z-[100] bg-white p-3 text-[#07334d] focus:not-sr-only focus:fixed focus:left-4 focus:top-4"
        href="#contenido"
      >
        <SiteText id="texto-20" /></a>

      <BellomoIntro onComplete={handleIntroComplete} />
      <Header />
      {heroSlides.length > 0 && <HeroSlider key={heroSlides.map(s => s.id).join(",")} introReady={introComplete || website.sections.find(s => s.id === "presentacion")?.enabled === false} slides={heroSlides} />}

      <section
        className="synthesis-section bg-white px-5 py-20 sm:px-8 sm:py-24 lg:px-12 lg:py-28"
        id="bellomo"
      >
        <SectionReveal
          className="synthesis-layout mx-auto grid max-w-[86rem] gap-12 lg:grid-cols-[0.92fr_1.08fr] lg:items-center lg:gap-20"
          replay
          variant="stagger"
        >
          <div
            className="synthesis-visual relative overflow-hidden"
            data-motion-item="image"
          >
            <ResilientMedia
              className="absolute inset-0"
              media={bellomoEditorialImages.about}
            />
            <div className="absolute inset-0 bg-[linear-gradient(180deg,transparent_45%,rgba(3,38,58,0.72))]" />
            <p className="synthesis-image-note"><SiteText id="texto-21" /></p>
          </div>
          <div className="motion-copy">
            <p className="section-label" data-motion-item="eyebrow">
              <SiteText id="texto-22" /></p>
            <h2
              className="font-display mt-5 max-w-2xl text-5xl leading-[0.96] tracking-[-0.04em] text-[#12394f] sm:text-6xl"
              data-motion-item="heading"
            >
              <SiteText id="texto-23" /></h2>
            <p
              className="font-display mt-6 max-w-xl text-2xl leading-snug text-[#9a7542] sm:text-3xl"
              data-motion-item="body"
            >
              <SiteText id="texto-24" /></p>
            <p
              className="mt-6 max-w-xl text-sm leading-7 text-[#536875] sm:text-base"
              data-motion-item="body"
            >
              <SiteText id="texto-25" /></p>
            <dl
              aria-label="Trayectoria Bellomo"
              className="synthesis-metrics mt-9"
              data-motion-item="action"
            >
              {bellomoStats.map((stat) => (
                <MetricCounter key={stat.label} metric={stat} />
              ))}
            </dl>
          </div>
        </SectionReveal>
      </section>

      {process.env.NEXT_PUBLIC_LOCAL_DEMO === "1" && <DemoCatalog />}
      <BusinessFocus />

      <section
        className="selected-developments developments-section relative px-5 py-20 text-white sm:px-8 sm:py-24 lg:px-12 lg:py-28"
        id="desarrollos-seleccionados"
      >
        {propertyCategories.map((category) => (
          <span
            aria-hidden="true"
            className="anchor-alias"
            id={category.id}
            key={category.id}
          />
        ))}
        <div className="mx-auto max-w-[86rem]">
          <SectionReveal
            className="flex flex-col justify-between gap-7 lg:flex-row lg:items-end"
            replay
            variant="panel"
          >
            <div className="motion-copy">
              <p
                className="section-label section-label-light"
                data-motion-item="eyebrow"
              >
                <SiteText id="texto-26" /></p>
              <h2
                className="font-display mt-5 max-w-3xl text-5xl leading-[0.96] tracking-[-0.04em] sm:text-6xl"
                data-motion-item="heading"
              >
                <SiteText id="texto-27" /></h2>
            </div>
            <p
              className="max-w-md text-sm leading-7 text-white/62"
              data-motion-item="body"
            >
              <SiteText id="texto-28" /></p>
          </SectionReveal>
          <SectionReveal className="mt-12 sm:mt-14" delay={80} replay variant="stagger">
            <DevelopmentRail projects={selectedProjects} />
          </SectionReveal>
        </div>
      </section>

      <section
        className="compact-contact relative overflow-hidden px-5 py-20 text-white sm:px-8 sm:py-24 lg:px-12"
        id="contacto"
      >
        <ResilientMedia
          className="contact-media absolute inset-0"
          decorative
          media={bellomoEditorialImages.contact}
        />
        <div className="absolute inset-0 bg-[#042b43]/88" />
        <SectionReveal
          className="relative mx-auto max-w-[86rem]"
          replay
          variant="panel"
        >
          <p
            className="section-label section-label-light"
            data-motion-item="eyebrow"
          >
            <SiteText id="texto-29" /></p>
          <div className="compact-contact-layout mt-5">
            <div className="motion-copy">
              <h2
                className="font-display max-w-3xl text-5xl leading-[0.96] tracking-[-0.04em] sm:text-6xl"
                data-motion-item="heading"
              >
                <SiteText id="texto-30" /></h2>
              <p
                className="mt-5 text-base leading-7 text-white/70"
                data-motion-item="body"
              >
                <SiteText id="texto-31" /></p>
            </div>
            <div className="compact-contact-actions" data-motion-item="action">
              <a
                href={whatsappHref(
                  "Hola Bellomo, quiero conocer un desarrollo o consultar por una obra."
                )}
                rel="noopener noreferrer"
                target="_blank"
              >
                <WhatsAppIcon />
                <SiteText id="texto-32" /></a>
              <a href={phoneHref(phones[0] || "")}>
                <PhoneIcon />
                <SiteText id="texto-34" /></a>
              <a
                href={"https://www.google.com/maps/search/?api=1&query=" + encodeURIComponent(bellomoContact.address + ", " + bellomoContact.city)}
                rel="noopener noreferrer"
                target="_blank"
              >
                <LocationIcon />
                <SiteText id="texto-36" /></a>
            </div>
          </div>
        </SectionReveal>
      </section>

      <footer
        className="site-footer compact-footer bg-[#03263a] px-5 text-white sm:px-8 lg:px-12"
        ref={footerRef}
      >
        <SectionReveal
          className="mx-auto max-w-[86rem]"
          replay
          variant="fade"
        >
          <div className="compact-footer-grid">
            <div className="compact-footer-brand">
              <Brand className="h-auto w-[190px]" />
              <p><SiteText id="texto-37" /></p>
            </div>
            <div>
              <h2><SiteText id="texto-38" /></h2>
              <address>
                {bellomoContact.address}
                <br />
                {bellomoContact.city}
              </address>
            </div>
            <div>
              <h2><SiteText id="texto-39" /></h2>
              <p><SiteText id="texto-40" /></p>
              <a href={phoneHref(phones[0] || "")}>{phones[0]}</a>
              <a href={phoneHref(phones[1] || phones[0] || "")}>{phones[1]}</a>
              <p className="mt-3"><SiteText id="texto-43" /></p>
              <a href={phoneHref(bellomoContact.constructionPhone)}>{bellomoContact.constructionPhone}</a>
            </div>
            <div>
              <h2><SiteText id="texto-45" /></h2>
              <p>{bellomoContact.weekdayHours}</p>
              <p>{bellomoContact.saturdayHours}</p>
              <div className="compact-footer-socials" aria-label="Redes sociales">
                <a
                  aria-label="Bellomo en Instagram"
                  href={website.links["enlace-46"].value}
                  rel="noopener noreferrer"
                  target="_blank"
                >
                  <InstagramIcon />
                </a>
                <a
                  aria-label="Bellomo en Facebook"
                  href={website.links["enlace-47"].value}
                  rel="noopener noreferrer"
                  target="_blank"
                >
                  <FacebookIcon />
                </a>
              </div>
            </div>
          </div>
          <div className="compact-footer-legal">
            <p><SiteText id="texto-48" />{currentYear} <SiteText id="texto-49" /></p>
            <a
              aria-label="Sitio desarrollado por EverSys Solutions. Visitar Instagram"
              className="eversys-attribution"
              href={website.links["enlace-50"].value}
              rel="noopener noreferrer"
              target="_blank"
            >
              <span><SiteText id="texto-51" /></span>
              <Image unoptimized
                alt=""
                aria-hidden="true"
                className="eversys-attribution-logo"
                height={772}
                sizes="24px"
                src={website.assets["imagen-52"].value}
                width={1467}
              />
              <span><SiteText id="texto-53" /></span>
            </a>
          </div>
        </SectionReveal>
      </footer>

      <SocialRail footerVisible={footerVisible} />

      <div
        className={[
          "floating-actions",
          footerVisible ? "is-footer-visible" : "",
        ].join(" ")}
      >
        <ScrollBatteryButton />
        <a
          aria-label="Consultar a Bellomo por WhatsApp"
          className="whatsapp-float"
          href={whatsappHref(
            "Hola Bellomo, quiero recibir información sobre sus desarrollos."
          )}
          rel="noopener noreferrer"
          target="_blank"
        >
          <WhatsAppIcon className="h-6 w-6" />
          <span className="hidden sm:inline"><SiteText id="texto-54" /></span>
        </a>
      </div>
    </ManagedPage>
  );
}

export default function Home() { return <HomeContent />; }
