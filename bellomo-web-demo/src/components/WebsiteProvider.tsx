"use client";
import { Children, createContext, isValidElement, useContext, useEffect, useState, type ReactNode } from "react";
import { defaultWebsite } from "@/lib/website-content";
import Promotions from "./Promotions";
import * as original from "@/data/bellomo";
const Context = createContext({ content: defaultWebsite, preview: false });
export function WebsiteProvider({ children }: { children: ReactNode }) {
  const [content, setContent] = useState(defaultWebsite);
  const [preview, setPreview] = useState(false);
  const [loaded, setLoaded] = useState(process.env.NEXT_PUBLIC_LOCAL_DEMO !== "1");
  const [error, setError] = useState("");
  useEffect(() => {
    if (process.env.NEXT_PUBLIC_LOCAL_DEMO !== "1") return;
    let active = true, busy = false; const controller = new AbortController();
    const isPreview = new URLSearchParams(window.location.search).get("preview") === "1";
    async function refresh() {
      if (busy) return; busy = true;
      try {
        const response = await fetch(`/api/demo/site${isPreview ? "?preview=1" : ""}`, { cache: "no-store", signal: controller.signal });
        const data = await response.json(); if (!response.ok) throw new Error(response.status === 401 || response.status === 403 ? "La vista previa es privada. Ingresá al panel con un perfil autorizado." : "No se pudo actualizar la web. Revisá que el panel esté abierto.");
        if (active) { setContent(previous => JSON.stringify(previous) === JSON.stringify(data.content) ? previous : data.content); setLoaded(true); setPreview(isPreview); setError(""); }
      } catch (reason) { if (active) setError(reason instanceof Error ? reason.message : "No se pudo actualizar la web. Revisá que el panel esté abierto."); }
      finally { busy = false; }
    }
    void refresh(); const timer = setInterval(refresh, 2000);
    return () => { active = false; controller.abort(); clearInterval(timer); };
  }, []);
  if (!loaded) return <main className="min-h-screen bg-[#f4f1ea] p-12 text-[#12394f]" role="status">{error || "Cargando la web de Bellomo…"}</main>;
  return <Context.Provider value={{ content, preview }}>
    {preview && <div className="fixed inset-x-0 bottom-0 z-[100] bg-amber-100 px-5 py-3 text-center text-sm text-amber-950">Vista previa del borrador · Todavía no está publicado <a className="ml-3 underline" href="http://127.0.0.1:3001/admin/web-publica">Volver al panel</a></div>}
    {error && <div role="alert" className="fixed bottom-0 left-0 z-[100] bg-amber-100 p-3 text-sm text-amber-950">{error}</div>}
    {children}
  </Context.Provider>;
}
export function useWebsite() { return useContext(Context); }
type Data = Pick<typeof original, "bellomoContact" | "bellomoEditorialImages" | "bellomoProjects" | "bellomoStats" | "constructionHighlights" | "heroSlides" | "navigation" | "propertyCategories">;
export function useSiteData(): Data {
  const { content } = useWebsite();
  return Object.fromEntries(Object.entries(content.data).map(([key, value]) => [key, Array.isArray(value) ? value.filter(item => item.enabled !== false && (key !== "navigation" || content.sections.find(s => `#${s.id}` === (item as { href?: string }).href)?.enabled !== false)) : value])) as unknown as Data;
}
export function SiteText({ id }: { id: string }) { const { content } = useWebsite(); return <>{content.texts[id as keyof typeof content.texts]?.value}</>; }
export function ManagedPage({ children, className }: { children: ReactNode; className?: string }) {
  const { content } = useWebsite();
  const componentIds: Record<string, string> = { Header: "menu", HeroSlider: "inicio", BellomoIntro: "presentacion", BusinessFocus: "comercializadora", SocialRail: "redes" };
  const nodes = Children.toArray(children).map((child, index) => {
    if (!isValidElement<{ id?: string; className?: string }>(child)) return { child, index, id: "" };
    const name = typeof child.type === "function" ? child.type.name : "";
    const id = child.props.id || componentIds[name] || (child.type === "footer" ? "pie" : child.props.className?.includes("floating-actions") ? "flotantes" : "");
    return { child, index, id };
  });
  const customSections = content.customSections.filter(s => s.enabled).map(section => <section key={section.id} id={section.id} className="bg-white px-6 py-16 text-[#12394f]">
      <div className="mx-auto grid max-w-6xl gap-8 md:grid-cols-2"><div><h2 className="font-display text-4xl">{section.title}</h2><p className="mt-4 whitespace-pre-line leading-7">{section.body}</p>{section.href && <a className="mt-6 inline-block rounded-full border px-5 py-3" href={section.href}>{section.buttonLabel || "Ver más"}</a>}</div>
      {section.image && <img src={section.image} alt={section.title} className="max-h-96 w-full rounded-2xl object-cover" />}</div>
    </section>);
  const visibleNodes = nodes.filter(node => content.sections.find(s => s.id === node.id)?.enabled !== false);
  const promotionAnchor = visibleNodes.find(node => node.id === "inicio") || visibleNodes.find(node => node.id === "menu");
  return <main className={className}>
    {!promotionAnchor && <Promotions/>}
    {visibleNodes.map(node => <div key={node.index} style={{ display: "contents" }}>
      {node.id === "pie" && customSections}
      {node.child}
      {node.index === promotionAnchor?.index && <Promotions/>}

    </div>)}
    {content.sections.find(s => s.id === "pie")?.enabled === false && customSections}
  </main>;
}
