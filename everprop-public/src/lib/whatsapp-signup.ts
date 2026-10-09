/**
 * Meta Embedded Signup glue (Tech Provider W5). Meta returns two things on separate channels:
 * the exchangeable `code` in the FB.login callback and the asset ids in a window message. Both are
 * untrusted here; the backend re-verifies them with Meta. The code expires in ~30 s, so the payload
 * is sent as soon as both halves are present.
 */
export type SignupSession = { waba_id: string; phone_number_id: string; business_id: string | null };

export type SignupEvent =
  | { kind: 'finish'; session: SignupSession }
  | { kind: 'cancel'; step: string | null }
  | { kind: 'error'; message: string }
  | null;

const DIGITS = /^\d{1,32}$/;

/** Only Meta's own pages may talk to us; anything else (other tabs, extensions, the widget) is ignored. */
export function isMetaOrigin(origin: string): boolean {
  try {
    const url = new URL(origin);
    return url.protocol === 'https:' && (url.hostname === 'facebook.com' || url.hostname.endsWith('.facebook.com'));
  } catch {
    return false;
  }
}

export function parseSignupMessage(origin: string, data: unknown): SignupEvent {
  if (!isMetaOrigin(origin)) return null;
  let payload: unknown = data;
  if (typeof data === 'string') {
    try { payload = JSON.parse(data); } catch { return null; }
  }
  if (!payload || typeof payload !== 'object') return null;
  const message = payload as { type?: unknown; event?: unknown; data?: Record<string, unknown> };
  if (message.type !== 'WA_EMBEDDED_SIGNUP') return null;
  const fields = message.data ?? {};
  if (message.event === 'FINISH') {
    const waba = String(fields.waba_id ?? '');
    const phone = String(fields.phone_number_id ?? '');
    const business = fields.business_id == null ? null : String(fields.business_id);
    if (!DIGITS.test(waba) || !DIGITS.test(phone) || (business !== null && !DIGITS.test(business))) {
      return { kind: 'error', message: 'Meta devolvió datos incompletos. Volvé a iniciar la conexión.' };
    }
    return { kind: 'finish', session: { waba_id: waba, phone_number_id: phone, business_id: business } };
  }
  if (message.event === 'CANCEL') return { kind: 'cancel', step: typeof fields.current_step === 'string' ? fields.current_step : null };
  if (message.event === 'ERROR') return { kind: 'error', message: 'Meta no pudo completar la conexión. Volvé a intentarlo.' };
  // FINISH_ONLY_WABA and other variants: a number is required to chat, so they cannot finish here.
  if (typeof message.event === 'string' && message.event.startsWith('FINISH')) {
    return { kind: 'error', message: 'Elegí o agregá un número de teléfono en el paso de Meta para poder conectar WhatsApp.' };
  }
  return null;
}

/** The connect request body once both halves arrived, else null. */
export function connectPayload(code: string | null, session: SignupSession | null) {
  if (!code || !session) return null;
  return { code, waba_id: session.waba_id, phone_number_id: session.phone_number_id, business_id: session.business_id };
}
