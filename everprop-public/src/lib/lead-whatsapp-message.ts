// EVP-167: WhatsApp marca como spam a quien manda el mismo texto a muchos contactos.
// Cada lead recibe una de 10 redacciones, elegida de forma estable por su id:
// el mismo lead ve siempre el mismo texto y leads distintos se reparten entre las 10.

type LeadMessageInput = { id: string; name: string; propertyTitle?: string | null };

const firstName = (name: string) => name.trim().split(/\s+/)[0] || name;

const TEMPLATES: ReadonlyArray<(n: string, p: string | null) => string> = [
  (n, p) => `Hola ${n}, te escribo de Bellomo Inmobiliaria por tu consulta${p ? ` sobre ${p}` : ""}. ¿Cómo estás?`,
  (n, p) => `¡Buen día, ${n}! Soy de Bellomo Inmobiliaria. Vi que te interesó ${p ?? "una de nuestras propiedades"}. ¿Te puedo ayudar con algo?`,
  (n, p) => `${n}, ¿qué tal? Te contacto desde Bellomo para responder tu consulta${p ? ` por ${p}` : ""}. ¿Tenés un momento?`,
  (n, p) => `Hola ${n}, gracias por consultarnos${p ? ` por ${p}` : ""}. Soy asesor de Bellomo Inmobiliaria, ¿en qué te puedo ayudar?`,
  (n, p) => `¡Hola ${n}! Recibimos tu consulta${p ? ` sobre ${p}` : ""} en Bellomo Inmobiliaria. ¿Querés que te cuente más detalles?`,
  (n, p) => `${n}, buenas. Te escribo de Bellomo por ${p ? `tu interés en ${p}` : "la consulta que nos dejaste"}. ¿Seguís buscando?`,
  (n, p) => `Hola ${n}, ¿cómo va? Desde Bellomo Inmobiliaria quería ponerme a disposición por tu consulta${p ? ` de ${p}` : ""}.`,
  (n, p) => `¡Qué tal, ${n}! Me comunico de Bellomo Inmobiliaria${p ? ` por ${p}` : ""}. Contame qué estás buscando y te ayudo.`,
  (n, p) => `Hola ${n}. Soy de Bellomo Inmobiliaria y vi tu consulta${p ? ` sobre ${p}` : ""}. ¿Te viene bien que lo charlemos por acá?`,
  (n, p) => `Buenas, ${n}. Te contacto de Bellomo para seguir tu consulta${p ? ` acerca de ${p}` : ""}. ¿Cuándo te queda cómodo hablar?`,
];

export const LEAD_WHATSAPP_TEMPLATE_COUNT = TEMPLATES.length;

function stableIndex(id: string): number {
  // FNV-1a de 32 bits: estable entre navegadores y sesiones.
  let h = 0x811c9dc5;
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h % TEMPLATES.length;
}

export function leadWhatsAppMessage(lead: LeadMessageInput): string {
  const property = lead.propertyTitle?.trim() || null;
  return TEMPLATES[stableIndex(lead.id || lead.name)](firstName(lead.name), property);
}
