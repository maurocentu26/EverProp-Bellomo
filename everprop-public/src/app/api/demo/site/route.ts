import { authorizeDemo } from "@/lib/demo-session";
import { existsSync, mkdirSync, readFileSync, writeFileSync, renameSync } from "node:fs";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { defaultWebsite, type WebsiteContent, type WebsiteState } from "@/lib/website-content";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const file = path.join(process.cwd(), ".demo-data", "website.json");
function enabled(request: Request) {
  return process.env.LOCAL_DEMO === "1" && process.env.NODE_ENV !== "production"
    && ["localhost", "127.0.0.1", "[::1]"].includes(new URL(request.url).hostname)
    && (!request.headers.get("origin") || request.headers.get("origin") === `http://${request.headers.get("host")}`);
}
function json(data: unknown, status = 200) { return Response.json(data, { status, headers: { "Cache-Control": "no-store" } }); }
function read(): WebsiteState {
  if (existsSync(file)) {
    const state = JSON.parse(readFileSync(file, "utf8")) as WebsiteState;
    const merge = (content: WebsiteContent): WebsiteContent => ({ ...defaultWebsite, ...content, texts: Object.fromEntries(Object.keys(defaultWebsite.texts).map(key => [key, content.texts[key as keyof typeof content.texts] || defaultWebsite.texts[key as keyof typeof defaultWebsite.texts]])) as typeof content.texts, links: Object.fromEntries(Object.keys(defaultWebsite.links).map(key => [key, content.links[key as keyof typeof content.links] || defaultWebsite.links[key as keyof typeof defaultWebsite.links]])) as typeof content.links, sections: content.sections.filter(s => s.id !== "catalogo-demo"), data: { ...defaultWebsite.data, ...content.data, navigation: content.data.navigation.filter(item => item.href !== "#catalogo-demo") } });
    return { ...state, draft: merge(state.draft), published: merge(state.published) };
  }
  return { revision: 0, publishedAt: null, draft: defaultWebsite, published: defaultWebsite };
}
function save(state: WebsiteState) {
  mkdirSync(path.dirname(file), { recursive: true });
  const temporary = `${file}.${randomUUID()}.tmp`;
  writeFileSync(temporary, JSON.stringify(state, null, 2)); renameSync(temporary, file);
}
function valid(value: unknown, sample: unknown, key = ""): boolean {
  if (typeof sample === "string") {
    if (typeof value !== "string" || value.length > 3_000_000) return false;
    if (["href", "src", "image", "logo"].includes(key) && value && !/^(\/(?!\/)|#|https?:\/\/|mailto:|tel:|data:image\/(png|jpeg|webp);base64,)/i.test(value)) return false;
    return true;
  }
  if (typeof sample === "number") return typeof value === "number" && Number.isFinite(value) && value >= 0;
  if (typeof sample === "boolean") return typeof value === "boolean";
  if (Array.isArray(sample)) return Array.isArray(value) && value.length <= 100 && (!sample.length || value.every(item => valid(item, sample[0])));
  if (sample && typeof sample === "object") {
    if (!value || typeof value !== "object" || Array.isArray(value)) return false;
    return Object.entries(sample).every(([k, v]) => (["referenceMedia", "referenceLabel", "logo"].includes(k) && !(k in value)) || valid((value as Record<string, unknown>)[k], v, k));
  }
  return false;
}
function validContent(content: WebsiteContent) {
  if (!valid(content, defaultWebsite)) return false;
  if (!content.customSections.every(section => valid(section, { id: "", title: "", body: "", image: "", buttonLabel: "", href: "", enabled: true }))) return false;
  if (!content.promotions.every(promo => valid(promo, { id: "", title: "", eyebrow: "", description: "", image: "", conditions: "", buttonLabel: "", href: "", enabled: true }) && promo.title.trim().length > 0 && promo.title.length <= 140 && promo.conditions.length <= 1200)) return false;
  if (new Set(content.promotions.map(promo => promo.id)).size !== content.promotions.length) return false;
  return Object.values(content.links).every(item => valid(item.value, "", "href"))
    && Object.values(content.assets).every(item => valid(item.value, "", "src"))
    && new Set(content.sections.map(s => s.id)).size === content.sections.length;
}
export function GET(request: Request) {
  if (!enabled(request)) return json({ error: "Demo local deshabilitada." }, 404);
  if (new URL(request.url).searchParams.get("view") !== "published") { const denied = authorizeDemo(request, "website"); if (denied) return denied; }
  try {
    const state = read(); const view = new URL(request.url).searchParams.get("view");
    return json(view === "published" || view === "preview" ? { content: view === "preview" ? state.draft : state.published, revision: state.revision, publishedAt: state.publishedAt } : state);
  } catch { return json({ error: "No se pudo leer la web guardada." }, 500); }
}
export async function PUT(request: Request) {
  if (!enabled(request)) return json({ error: "Demo local deshabilitada." }, 404);
  if (true) { const denied = authorizeDemo(request, "website"); if (denied) return denied; }
  const text = await request.text();
  if (text.length > 15_000_000) return json({ error: "El contenido supera el tamaño permitido. Usá imágenes más pequeñas." }, 413);
  let body: { revision: number; action: string; content?: WebsiteContent };
  try { body = JSON.parse(text); } catch { return json({ error: "Datos inválidos." }, 400); }
  if (!body || !["save", "publish", "discard"].includes(body.action)) return json({ error: "Acción inválida." }, 400);
  if (body.action !== "discard" && (!body.content || !validContent(body.content))) return json({ error: "Revisá los campos y enlaces. Usá imágenes PNG, JPG o WebP." }, 400);
  try {
    const state = read();
    if (body.revision !== state.revision) return json({ error: "La web cambió desde otra ventana. Recargá para ver la última versión antes de guardar." }, 409);
    const draft = body.action === "discard" ? state.published : body.content!;
    const next = { revision: state.revision + 1, draft, published: body.action === "publish" ? draft : state.published, publishedAt: body.action === "publish" ? new Date().toISOString() : state.publishedAt };
    save(next); return json(next);
  } catch { return json({ error: "No se pudo guardar. Tus cambios siguen en el editor." }, 500); }
}
