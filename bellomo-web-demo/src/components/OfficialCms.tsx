"use client";
import Image, { type ImageProps } from "next/image";
import type { AnchorHTMLAttributes } from "react";
import * as original from "@/data/bellomo";
import { ramiBindings } from "@/lib/website-content";
import { useWebsite } from "./WebsiteProvider";

export function useOfficialData(): typeof original {
  const { content } = useWebsite();
  const filter = (value: unknown): unknown => Array.isArray(value) ? value.filter(item => !item || typeof item !== 'object' || item.enabled !== false).map(filter) : value && typeof value === 'object' ? Object.fromEntries(Object.entries(value).map(([k,v]) => [k,filter(v)])) : value;
  const data = filter(content.official) as unknown as typeof original;
  const sectionForAnchor: Record<string,string> = { '#proyectos': 'desarrollos-seleccionados', '#construccion': 'servicios', '#comercializadora': 'servicios' };
  const navigation = data.navigation.filter(item => content.sections.find(section => section.id === (sectionForAnchor[item.href] ?? item.href.slice(1)))?.enabled !== false);
  return { ...data, navigation, whatsappHref: (message: string) => `https://wa.me/${data.bellomoContact.whatsappPhone}?text=${encodeURIComponent(message)}` };
}
export function CmsImage(props: ImageProps) {
  const { content } = useWebsite();
  const key = typeof props.src === 'string' ? ramiBindings.images[props.src as keyof typeof ramiBindings.images] : undefined;
  const src = key ? content.assets[key as keyof typeof content.assets]?.value ?? props.src : props.src;
  return src ? <Image {...props} alt={props.alt} src={src} unoptimized/> : null;
}
export function CmsLink(props: AnchorHTMLAttributes<HTMLAnchorElement>) {
  const { content } = useWebsite();
  const key = props.href ? ramiBindings.links[props.href as keyof typeof ramiBindings.links] : undefined;
  const href = key ? content.links[key as keyof typeof content.links]?.value ?? props.href : props.href;
  return <a {...props} href={href}/>;
}
export function PublicSection({ id, children }: { id: string; children: React.ReactNode }) {
  const { content } = useWebsite();
  return content.sections.find(s => s.id === id)?.enabled === false ? null : children;
}
