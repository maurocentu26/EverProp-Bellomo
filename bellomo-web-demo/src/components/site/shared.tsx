"use client";
import type { BellomoImage, PropertyCategory } from "@/data/bellomo";

import { SiteText } from "../WebsiteProvider";
import { CmsImage as Image } from "../OfficialCms";
import type { ReactNode } from "react";


export function Brand({ compact = false }: { compact?: boolean }) {


  return (
    <span className="brand-lockup">
      <Image
        alt="Bellomo"
        className="brand-wordmark"
        height={50}
        loading={compact ? "eager" : "lazy"}
        src="/brand/logo-bellomo-isotipo.png"
        width={190}
      />
      {!compact && <span><SiteText id="rami-text-74"/></span>}
    </span>
  );
}

export function Media({
  className = "",
  media,
  preload = false,
  sizes = "(max-width: 768px) 100vw, 50vw",
}: {
  className?: string;
  media: BellomoImage;
  preload?: boolean;
  sizes?: string;
}) {


  const fit = media.fit ?? (media.kind === "Render" ? "contain" : "cover");

  return (
    <figure className={`media-frame is-${fit} ${className}`} data-kind={media.kind ?? "Fotografía"}>
      <Image
        alt={media.alt}
        className="media-image"
        fill
        {...(preload ? { preload: true } : { loading: "lazy" as const })}
        sizes={sizes}
        src={media.src}
        style={{ objectPosition: media.position }}
      />
    </figure>
  );
}

export function SectionHeading({
  eyebrow,
  title,
  children,
  light = false,
}: {
  eyebrow: ReactNode;
  title: ReactNode;
  children?: ReactNode;
  light?: boolean;
}) {


  return (
    <header className={`section-heading ${light ? "is-light" : ""}`} data-reveal>
      <p className="eyebrow">{eyebrow}</p>
      <h2>{title}</h2>
      {children && <div className="section-heading-copy">{children}</div>}
    </header>
  );
}

export function ArrowIcon({ className = "" }: { className?: string }) {


  return (
    <svg aria-hidden="true" className={className} fill="none" viewBox="0 0 24 24">
      <path d="M5 12h14m-5-5 5 5-5 5" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" />
    </svg>
  );
}

export function WhatsAppIcon({ className = "" }: { className?: string }) {


  return (
    <svg aria-hidden="true" className={className} fill="none" viewBox="0 0 24 24">
      <path d="M20.2 11.8a8.2 8.2 0 0 1-12.1 7.3L4 20l.9-4a8.2 8.2 0 1 1 15.3-4.2Z" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.7" />
      <path d="M8.4 7.9c.2-.4.4-.4.7-.4h.4c.2 0 .4.1.5.4l.7 1.7c.1.3.1.5-.1.7l-.6.7c-.2.2-.1.4 0 .6.5.9 1.3 1.7 2.2 2.2.2.1.4.2.6 0l.8-1c.2-.2.4-.3.7-.2l1.8.8c.3.1.5.3.5.5 0 .3-.1 1.3-.7 1.8-.5.5-1.3.8-2.1.7-1.1-.1-2.5-.6-4.2-2.1-2.1-1.8-3.3-4.1-3.4-5.1 0-.6.1-1 .2-1.3Z" fill="currentColor" />
    </svg>
  );
}

export function PinIcon({ className = "" }: { className?: string }) {


  return (
    <svg aria-hidden="true" className={className} fill="none" viewBox="0 0 24 24">
      <path d="M20 10c0 5-8 11-8 11S4 15 4 10a8 8 0 1 1 16 0Z" stroke="currentColor" strokeWidth="1.7" />
      <circle cx="12" cy="10" r="2.5" stroke="currentColor" strokeWidth="1.7" />
    </svg>
  );
}

export function PropertyIcon({ type }: { type: PropertyCategory["icon"] }) {


  const paths: Record<PropertyCategory["icon"], ReactNode> = {
    land: <><path d="M3 18.5 8 16l5 2.5 8-4" /><path d="M5 16V7m0 0 5 2-5 2V7Z" /><path d="M3 21h18" /></>,
    home: <><path d="m3 11 9-7 9 7" /><path d="M5.5 9.5V21h13V9.5" /><path d="M9.5 21v-6h5v6" /></>,
    store: <><path d="M4 10v11h16V10" /><path d="M3 10h18l-2-6H5l-2 6Z" /><path d="M8 10v1.5a2 2 0 0 0 4 0V10m0 0v1.5a2 2 0 0 0 4 0V10" /></>,
    garage: <><path d="M3 11 12 4l9 7v10H3V11Z" /><path d="M6.5 21v-7h11v7" /><path d="M8.5 17h7" /></>,
    building: <><path d="M5 21V4h10v17M15 9h4v12" /><path d="M8 8h4M8 12h4M8 16h4M17 13h2M17 17h2" /><path d="M3 21h18" /></>,
  };

  return (
    <svg aria-hidden="true" fill="none" viewBox="0 0 24 24">
      <g stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.35">{paths[type]}</g>
    </svg>
  );
}
