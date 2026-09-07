import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { properties as seed, type Property } from "@/data/admin-sample";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const file = path.join(process.cwd(), ".demo-data", "properties.json");
type Listing = Property & { published: boolean };
const schema = z.object({
  title: z.string().trim().min(3).max(200),
  operation: z.enum(["sale", "rent", "temporal"]),
  propertyType: z.string().trim().min(1).max(60),
  price: z.number().finite().nonnegative(), currency: z.enum(["USD", "ARS"]),
  city: z.string().trim().min(1).max(150), neighborhood: z.string().max(150),
  bedrooms: z.number().int().nonnegative(), bathrooms: z.number().int().nonnegative(),
  area_m2: z.number().positive().optional(), description: z.string().max(5000).optional(),
  sectorName: z.string().max(100).optional(), unitNumber: z.string().max(100).optional(),
  mainImage: z.string().max(3_000_000).refine(value => !value || /^(\/(?!\/)|https?:\/\/|data:image\/(png|jpeg|webp);base64,)/i.test(value)).optional(),
  projectId: z.string().max(150).optional(),
  published: z.boolean().optional(),
});
function enabled(request: Request) {
  const url = new URL(request.url);
  const origin = request.headers.get("origin");
  return process.env.LOCAL_DEMO === "1" && process.env.NODE_ENV !== "production"
    && ["127.0.0.1", "localhost", "[::1]"].includes(url.hostname)
    && (!origin || origin === `http://${request.headers.get("host")}`);
}
function read(): Listing[] {
  if (!existsSync(file)) {
    const initial = seed.filter(p => p.companyId === "c1").map(p => ({ ...p, published: p.status !== "sold" }));
    save(initial);
    return initial;
  }
  return JSON.parse(readFileSync(file, "utf8"));
}
function save(list: Listing[]) {
  mkdirSync(path.dirname(file), { recursive: true });
  const temporary = `${file}.${randomUUID()}.tmp`;
  writeFileSync(temporary, JSON.stringify(list, null, 2));
  renameSync(temporary, file);
}
function json(value: unknown, status = 200) {
  return Response.json(value, { status, headers: { "Cache-Control": "no-store" } });
}
export function GET(request: Request) {
  if (!enabled(request)) return json({ error: "Demo local deshabilitada." }, 404);
  try {
    const list = read();
    if (new URL(request.url).searchParams.get("public") === "1") {
      const siteFile = path.join(process.cwd(), ".demo-data", "website.json");
      if (existsSync(siteFile)) {
        const site = JSON.parse(readFileSync(siteFile, "utf8"));
        if (site.published.sections.some((section: { id: string; enabled: boolean }) => section.id === "catalogo-demo" && !section.enabled)) return json([]);
      }
      return json(list.filter(p => p.published).map(p => ({
        id: p.id, title: p.title, operation: p.operation, propertyType: p.propertyType,
        price: p.price, currency: p.currency, city: p.city, neighborhood: p.neighborhood,
        bedrooms: p.bedrooms, bathrooms: p.bathrooms, area_m2: p.area_m2,
        description: p.description, status: p.status, mainImage: p.mainImage,
      })));
    }
    return json(list);
  } catch { return json({ error: "No se pudo leer el catálogo demo." }, 500); }
}
export async function POST(request: Request) {
  if (!enabled(request)) return json({ error: "Demo local deshabilitada." }, 404);
  const parsed = z.union([schema, z.array(schema).min(1).max(300)]).safeParse(await request.json().catch(() => null));
  if (!parsed.success) return json({ error: "Revisá los datos de la propiedad." }, 400);
  try {
    const list = read();
    const created: Listing[] = (Array.isArray(parsed.data) ? parsed.data : [parsed.data]).map(data => ({ ...data, id: randomUUID(), companyId: "c1", status: "available", published: data.published ?? true }));
    save([...created, ...list]);
    return json(Array.isArray(parsed.data) ? created : created[0], 201);
  } catch { return json({ error: "No se pudo guardar la propiedad." }, 500); }
}
export async function PATCH(request: Request) {
  if (!enabled(request)) return json({ error: "Demo local deshabilitada." }, 404);
  const parsed = schema.partial().extend({ id: z.string(), published: z.boolean().optional(), status: z.enum(["available", "reserved", "sold"]).optional() }).refine(value => Object.keys(value).length > 1).safeParse(await request.json().catch(() => null));
  if (!parsed.success) return json({ error: "Cambio de publicación inválido." }, 400);
  try {
    const list = read();
    const property = list.find(p => p.id === parsed.data.id);
    if (!property) return json({ error: "Propiedad no encontrada." }, 404);
    Object.assign(property, parsed.data);
    save(list);
    return json(property);
  } catch { return json({ error: "No se pudo guardar la publicación." }, 500); }
}
