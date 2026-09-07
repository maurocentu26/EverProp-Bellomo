import { randomUUID } from "node:crypto";

const API_URL = process.env.EVERPROP_API_URL || "http://127.0.0.1:18080";
const TENANT = process.env.EVERPROP_TENANT || "bellomo";

type LeadRequest = {
  name?: unknown;
  phone?: unknown;
  email?: unknown;
  project?: unknown;
  notes?: unknown;
  source?: unknown;
};

function cleanString(value: unknown, maxLength: number) {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

function normalizePhone(value: string) {
  if (!value) return null;
  const digits = value.replace(/\D/g, "");
  const international = digits.startsWith("54") ? `+${digits}` : `+54${digits}`;
  return /^\+[1-9]\d{7,14}$/.test(international) ? international : null;
}

function validEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

export async function POST(request: Request) {
  if (process.env.LOCAL_DEMO === "1") return Response.json({ error: "Demo de catálogo: el envío de consultas está deshabilitado. No se enviaron datos al equipo comercial." }, { status: 409 });
  let body: LeadRequest;
  try {
    body = (await request.json()) as LeadRequest;
  } catch {
    return Response.json({ error: "La solicitud no contiene JSON válido." }, { status: 400 });
  }

  const name = cleanString(body.name, 200);
  const rawPhone = cleanString(body.phone, 32);
  const email = cleanString(body.email, 320).toLocaleLowerCase("es-AR");
  const phone = normalizePhone(rawPhone);
  const project = cleanString(body.project, 120) || "Consulta general";
  const notes = cleanString(body.notes, 300);

  if (!name || (!rawPhone && !email)) {
    return Response.json(
      { error: "Ingresá tu nombre y al menos un teléfono o email." },
      { status: 400 },
    );
  }

  if (rawPhone && !phone) {
    return Response.json(
      { error: "Ingresá un teléfono válido, con código de área." },
      { status: 400 },
    );
  }

  if (email && !validEmail(email)) {
    return Response.json({ error: "Ingresá un email válido." }, { status: 400 });
  }

  const identity = phone || email;
  const source = cleanString(body.source, 64).toUpperCase() || "BELLOMITO";
  const payload = {
    contact: {
      display_name: name,
      email: email || null,
      phone_e164: phone,
      locale: "es-AR",
    },
    identity: {
      channel_type: phone ? "PHONE" : "EMAIL",
      provider_user_id: identity,
      display_name: name,
    },
    lead: {
      source_channel: "WEB_CHAT",
      source_kind: source.replace(/[^A-Z0-9_]/g, "_").slice(0, 64),
      title: `Consulta Bellomito: ${project}`,
      priority: "NORMAL",
    },
    touchpoint: {
      type: "WEB_CHAT",
      summary: notes || `Solicitud de contacto por ${project}`,
    },
  };

  try {
    const response = await fetch(new URL("/api/v1/public/leads", API_URL), {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        "Idempotency-Key": `bellomito:${randomUUID()}`,
        "X-Everprop-Tenant": TENANT,
      },
      body: JSON.stringify(payload),
      cache: "no-store",
      signal: AbortSignal.timeout(10_000),
    });

    const data = (await response.json().catch(() => null)) as
      | { data?: { lead_id?: string }; error?: { message?: string }; message?: string }
      | null;

    if (!response.ok) {
      const message =
        response.status === 429
          ? "Hay muchas solicitudes en curso. Probá nuevamente en un minuto."
          : data?.error?.message || data?.message || "El CRM no pudo aceptar la solicitud.";
      return Response.json({ error: message }, { status: response.status });
    }

    return Response.json(
      {
        success: true,
        message: "Tu consulta quedó registrada. El equipo de Bellomo va a contactarte.",
        leadId: data?.data?.lead_id ?? null,
      },
      { status: response.status },
    );
  } catch {
    return Response.json(
      { error: "El CRM no está disponible en este momento. Intentá nuevamente más tarde." },
      { status: 503 },
    );
  }
}
