/**
 * Where the visitor's chat token lives (EVP-20). The token only opens this one conversation, the server
 * expires and revokes it, and it never goes in a URL. It survives closing the tab (localStorage) but is
 * dropped at the server's expiry; if storage is blocked the chat works for this page only and says so.
 */
type Store = Pick<Storage, "getItem" | "setItem" | "removeItem">;
type Stored = { token: string; expiresAt: number };

const DEFAULT_TTL_MS = 24 * 60 * 60 * 1000;

export function chatStorageKey(widgetId: string) {
  return `eversys-chat:${widgetId}`;
}

/** The first store that really writes (Safari private mode and blocked iframes throw), or null. */
export function pickStore(candidates: Array<() => Store>): Store | null {
  for (const get of candidates) {
    try {
      const store = get();
      store.setItem("eversys-chat:probe", "1");
      store.removeItem("eversys-chat:probe");
      return store;
    } catch { /* try the next one */ }
  }
  return null;
}

/** `expired` tells "there was a conversation and it ran out" apart from "nothing saved", so the widget can say so. */
export function loadToken(store: Store | null, key: string, now: number, legacy: Store | null = null): { token: string | null; expired: boolean } {
  if (!store) return { token: null, expired: false };
  try {
    const raw = store.getItem(key);
    // Before EVP-20 the bare token sat in sessionStorage: move it once, capped at the longest server TTL. When
    // sessionStorage is also the chosen store (localStorage blocked), the bare value is that same legacy token.
    const old = raw && !raw.startsWith("{") ? raw : (legacy && legacy !== store ? legacy.getItem(key) : null);
    if (old && !old.startsWith("{")) {
      if (legacy && legacy !== store) legacy.removeItem(key);
      saveToken(store, key, old, now + DEFAULT_TTL_MS);
      return { token: old, expired: false };
    }
    let value: Partial<Stored> | null = null;
    try { value = raw ? (JSON.parse(raw) as Partial<Stored>) : null; } catch { /* corrupt: removed below */ }
    const valid = value && typeof value.token === "string" && typeof value.expiresAt === "number";
    if (valid && value!.expiresAt! > now) return { token: value!.token!, expired: false };
    if (raw) store.removeItem(key);
    return { token: null, expired: Boolean(valid) };
  } catch { /* unreadable: start over */ }
  return { token: null, expired: false };
}

/** Forget the session only if it is still the one that failed: another tab may already have saved a newer one. */
export function dropToken(store: Store | null, key: string, failed: string) {
  if (!store) return;
  try {
    const raw = store.getItem(key);
    if (raw && (raw === failed || (JSON.parse(raw) as Partial<Stored>).token === failed)) store.removeItem(key);
  } catch { /* corrupt or blocked: loadToken discards it next time */ }
}

export function saveToken(store: Store | null, key: string, token: string | null, expiresAt?: number) {
  if (!store) return;
  try {
    if (token) store.setItem(key, JSON.stringify({ token, expiresAt: expiresAt ?? Date.now() + DEFAULT_TTL_MS } satisfies Stored));
    else store.removeItem(key);
  } catch { /* storage full or revoked mid-session: the token stays in memory only */ }
}
