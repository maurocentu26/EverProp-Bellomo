import { readDemoCatalog, readPublishedWebsite } from "@/lib/demo-catalog";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { generateText } from "ai";
import { bellomoKnowledge } from "@/lib/ai/knowledge";

export const maxDuration = 20;

type IncomingMessage = {
  role?: unknown;
  content?: unknown;
  parts?: unknown;
};

type RateLimitEntry = {
  count: number;
  resetAt: number;
};

const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX_REQUESTS = 20;
const rateLimits = new Map<string, RateLimitEntry>();

function json(body: unknown, status = 200) {
  return Response.json(body, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

function requestIdentity(request: Request) {
  return (
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip") ||
    "local"
  );
}

function isRateLimited(request: Request) {
  const key = requestIdentity(request);
  const now = Date.now();
  const entry = rateLimits.get(key);

  if (!entry || entry.resetAt <= now) {
    rateLimits.set(key, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return false;
  }

  entry.count += 1;
  return entry.count > RATE_LIMIT_MAX_REQUESTS;
}

function messageText(message: IncomingMessage) {
  if (typeof message.content === "string") {
    return message.content.trim();
  }

  if (!Array.isArray(message.parts)) {
    return "";
  }

  return message.parts
    .map((part) => {
      if (!part || typeof part !== "object" || !("text" in part)) return "";
      return typeof part.text === "string" ? part.text : "";
    })
    .join("")
    .trim();
}

function knowledgeFallback(question: string) {
  const normalized = question.toLocaleLowerCase("es-AR");

  if (normalized.includes("san jos") || normalized.includes("lote")) {
    return "¡Claro! **Barrio San José** ofrece lotes de **300 a 600 m²**, servicios completos y financiación con **30% de anticipo y hasta 36 cuotas**. ¿Querés que el equipo comercial te contacte?";
  }

  if (normalized.includes("torre") || normalized.includes("depto") || normalized.includes("departamento")) {
    return "**Torre Bellomo** tiene departamentos de **1, 2 y 3 dormitorios**, con rooftop, piscina, SUM, gimnasio y cocheras. ¿Buscás una unidad para vivir o invertir?";
  }

  if (normalized.includes("local") || normalized.includes("comercial")) {
    return "Los **locales comerciales** van de **35 a 150 m²** y sirven para retail, gastronomía, consultorios o servicios. ¿Querés coordinar una consulta con Bellomo?";
  }

  if (normalized.includes("cuota") || normalized.includes("financi") || normalized.includes("precio")) {
    return "Bellomo ofrece financiación a medida; en **Barrio San José** el plan parte de **30% de anticipo y hasta 36 cuotas**. Decime qué proyecto te interesa y te oriento mejor.";
  }

  if (normalized.includes("direcci") || normalized.includes("horario") || normalized.includes("tel")) {
    return "La oficina comercial está en **Gral. Belgrano 1383, San Salvador de Jujuy**. Atiende de lunes a viernes de 8:30 a 12:30 y de 16:30 a 20:30; sábados de 9:00 a 13:00.";
  }

  return "Soy Bellomito ✨. Puedo ayudarte con **Barrio San José**, **Torre Bellomo**, locales comerciales y planes de financiación. ¿Sobre cuál querés saber más?";
}

export async function POST(request: Request) {
  if (isRateLimited(request)) {
    return json({ error: "Demasiadas consultas. Probá nuevamente en un minuto." }, 429);
  }

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return json({ error: "El cuerpo de la solicitud no es JSON válido." }, 400);
  }

  const messages =
    payload && typeof payload === "object" && "messages" in payload
      ? (payload.messages as unknown)
      : null;

  if (!Array.isArray(messages) || messages.length === 0 || messages.length > 20) {
    return json({ error: "La conversación enviada no es válida." }, 400);
  }

  const formattedMessages = messages
    .map((message) => {
      if (!message || typeof message !== "object") return null;
      const candidate = message as IncomingMessage;
      const role = candidate.role === "assistant" ? "assistant" : "user";
      const content = messageText(candidate);
      return content ? { role, content } : null;
    })
    .filter((message): message is { role: "assistant" | "user"; content: string } => message !== null);

  const totalCharacters = formattedMessages.reduce((total, message) => total + message.content.length, 0);
  const latestQuestion = formattedMessages.at(-1)?.content ?? "";

  if (!latestQuestion || totalCharacters > 6_000) {
    return json({ error: "La conversación está vacía o excede el límite permitido." }, 400);
  }

  if (process.env.LOCAL_DEMO === "1") {
    try {
      const website = await readPublishedWebsite();
      if (!website.bot.enabled) return json({ error: "El asistente está oculto en esta web." }, 404);
      if (/horario|tel[eé]fono|direcci[oó]n|contacto/i.test(latestQuestion)) {
        const contact = website.data.bellomoContact;
        return json({ text: `${contact.address}, ${contact.city}. ${contact.weekdayHours}; ${contact.saturdayHours}. Teléfonos: ${contact.commercialPhones}.`, mode: "demo" });
      }
      const catalog = await readDemoCatalog();
      const words = latestQuestion.toLocaleLowerCase("es-AR").split(/\s+/).filter(word => word.length > 3);
      const matches = catalog.filter(p => words.some(word => (p.title + " " + p.propertyType + " " + p.city).toLocaleLowerCase("es-AR").includes(word)));
      const selection = matches.length ? matches : catalog;
      const summary = selection.slice(0, 5).map(p => "• **" + p.title + "** — " + (p.price > 0 ? p.currency + " " + p.price.toLocaleString("es-AR") : "Consultar precio") + " · " + (p.status === "reserved" ? "Reservado" : p.status === "sold" ? "Vendido" : "Disponible")).join("\n") + (website.bot.knowledge ? "\n\n" + website.bot.knowledge : "");
      return json({ text: catalog.length ? "**Demo local.** Estas son propiedades publicadas ahora en el panel:\n\n" + summary + "\n\nPodés ver el catálogo completo en la sección Propiedades publicadas. Los datos son de demostración." : "**Demo local.** No hay propiedades publicadas en este momento. Podés publicar una desde el panel.", mode: "demo" });
    } catch { return json({ text: "No puedo consultar el catálogo demo ahora. Revisá que el panel local esté encendido.", mode: "demo" }); }
  }
  const apiKey = process.env.GOOGLE_GENERATIVE_AI_API_KEY || process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return json({ text: knowledgeFallback(latestQuestion), mode: "knowledge" });
  }

  const google = createGoogleGenerativeAI({ apiKey });
  const system = `Sos Bellomito, el concierge digital oficial de Bellomo Desarrollos en Jujuy.
Respondé con voseo argentino, tono cálido y profesional, en un máximo de 2 o 3 oraciones.
No inventes disponibilidad, precios ni integraciones. Si hay intención comercial, ofrecé el formulario de contacto de la interfaz.

Base oficial:
${bellomoKnowledge}`;

  try {
    const result = await generateText({
      model: google("gemini-2.5-flash"),
      system,
      messages: formattedMessages,
      abortSignal: AbortSignal.timeout(12_000),
    });
    const text = result.text.trim();

    return json({
      text: text || knowledgeFallback(latestQuestion),
      mode: text ? "ai" : "knowledge",
    });
  } catch {
    return json({ text: knowledgeFallback(latestQuestion), mode: "knowledge" });
  }
}
