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
      return json(list.filter(p => p.published).map(p => ({
        id: p.id, title: p.title, operation: p.operation, propertyType: p.propertyType,
        price: p.price, currency: p.currency, city: p.city, neighborhood: p.neighborhood,
        bedrooms: p.bedrooms, bathrooms: p.bathrooms, area_m2: p.area_m2,
        description: p.description, status: p.status,
      })));
    }
    return json(list);
  } catch { return json({ error: "No se pudo leer el catálogo demo." }, 500); }
}
export async function POST(request: Request) {
  if (!enabled(request)) return json({ error: "Demo local deshabilitada." }, 404);
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return json({ error: "Revisá los datos de la propiedad." }, 400);
  try {
    const list = read();
    const property: Listing = { ...parsed.data, id: randomUUID(), companyId: "c1", status: "available", published: true };
    save([property, ...list]);
    return json(property, 201);
  } catch { return json({ error: "No se pudo guardar la propiedad." }, 500); }
}
export async function PATCH(request: Request) {
  if (!enabled(request)) return json({ error: "Demo local deshabilitada." }, 404);
  const parsed = z.object({ id: z.string(), published: z.boolean() }).safeParse(await request.json().catch(() => null));
  if (!parsed.success) return json({ error: "Cambio de publicación inválido." }, 400);
  try {
    const list = read();
    const property = list.find(p => p.id === parsed.data.id);
    if (!property) return json({ error: "Propiedad no encontrada." }, 404);
    property.published = parsed.data.published;
    save(list);
    return json(property);
  } catch { return json({ error: "No se pudo guardar la publicación." }, 500); }
}
