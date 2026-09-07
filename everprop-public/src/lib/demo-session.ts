import "server-only";
import { randomBytes, createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync, renameSync } from "node:fs";
import path from "node:path";
import { MOCK_USERS } from "@/data/auth-sample";
import { canManageInventory, canManageWebsite } from "@/lib/demo-permissions";

const file = path.join(process.cwd(), ".demo-data", "sessions.json");
const cookieName = "everprop_local_session";
const lifetime = 8 * 60 * 60;
type Session = { hash: string; userId: string; expires: number };
function read(): Session[] {
  return existsSync(file) ? (JSON.parse(readFileSync(file, "utf8")) as Session[]).filter(s => s.expires > Date.now()) : [];
}
function save(sessions: Session[]) {
  mkdirSync(path.dirname(file), { recursive: true });
  const temporary = `${file}.${randomBytes(12).toString("hex")}.tmp`;
  writeFileSync(temporary, JSON.stringify(sessions));
  renameSync(temporary, file);
}
function tokenHash(request: Request) {
  const token = request.headers.get("cookie")?.split(";").map(s => s.trim()).find(s => s.startsWith(`${cookieName}=`))?.slice(cookieName.length + 1);
  return token ? createHash("sha256").update(token).digest("hex") : null;
}
export function demoEnabled(request: Request) {
  return process.env.LOCAL_DEMO === "1" && process.env.NODE_ENV !== "production"
    && ["localhost", "127.0.0.1", "[::1]"].includes(new URL(request.url).hostname)
    && (!request.headers.get("origin") || request.headers.get("origin") === `http://${request.headers.get("host")}`);
}
export function demoUser(request: Request) {
  if (!demoEnabled(request)) return null;
  const hash = tokenHash(request);
  if (!hash) return null;
  const session = read().find(s => s.hash === hash);
  return session ? MOCK_USERS.find(user => user.id === session.userId) ?? null : null;
}
export function authorizeDemo(request: Request, permission: "read" | "inventory" | "website") {
  const user = demoUser(request);
  const permitted = permission === "read" || (permission === "inventory" ? canManageInventory(user) : canManageWebsite(user));
  const error = !user ? "Iniciá sesión para continuar." : !permitted ? "Tu perfil no tiene permiso para realizar esta acción." : null;
  return error ? Response.json({ error }, { status: user ? 403 : 401, headers: { "Cache-Control": "no-store" } }) : null;
}
export function startDemoSession(request: Request, email: string) {
  const user = MOCK_USERS.find(user => user.email === email);
  if (!user) return Response.json({ error: "Perfil demo no encontrado." }, { status: 400 });
  const token = randomBytes(32).toString("hex");
  save([...read().filter(s => s.hash !== tokenHash(request)), { hash: createHash("sha256").update(token).digest("hex"), userId: user.id, expires: Date.now() + lifetime * 1000 }]);
  return Response.json({ user }, { headers: { "Cache-Control": "no-store", "Set-Cookie": `${cookieName}=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${lifetime}` } });
}
export function endDemoSession(request: Request) {
  save(read().filter(s => s.hash !== tokenHash(request)));
  return Response.json({ user: null }, { headers: { "Cache-Control": "no-store", "Set-Cookie": `${cookieName}=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0` } });
}
