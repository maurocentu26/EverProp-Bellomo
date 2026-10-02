/** Bound worker activation so a browser failure cannot leave the form busy forever. */
export async function registerNotificationWorker(
  workers: Pick<ServiceWorkerContainer, 'register' | 'ready'>,
  timeoutMs = 10000,
): Promise<ServiceWorkerRegistration> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      (async () => {
        const registration = await workers.register('/notifications-sw.js');
        await workers.ready;
        return registration;
      })(),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error('El navegador no pudo preparar los avisos. Volvé a intentarlo.')), timeoutMs);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Device alerts with the panel closed. "active" only ever means: permission granted, a browser push
 * subscription, and the server listing that subscription for this user. Permission alone is never enough.
 */
export type PushState = 'checking' | 'unsupported' | 'install' | 'server-off' | 'blocked' | 'inactive' | 'activating' | 'active' | 'error';

export type PushEnvironment = {
  secure: boolean;
  serviceWorker: boolean;
  pushManager: boolean;
  notification: boolean;
  /** iPhone/iPad (including iPadOS reporting as Mac with touch). */
  appleMobile: boolean;
  /** Opened from the home-screen icon (display-mode standalone or navigator.standalone). */
  standalone: boolean;
  permission: NotificationPermission | 'unsupported';
};

/** What blocks activation before talking to the server, or null when it can be attempted. */
export function pushBlocker(env: PushEnvironment): 'install' | 'unsupported' | 'blocked' | null {
  // iOS only exposes Web Push to a web app opened from its home-screen icon.
  if (env.appleMobile && !env.standalone && !env.pushManager) return 'install';
  if (!env.secure || !env.serviceWorker || !env.pushManager || !env.notification) return 'unsupported';
  if (env.permission === 'denied') return 'blocked';
  return null;
}

type Subscription = { endpoint: string; toJSON(): unknown };
type PushRegistration = { pushManager: { getSubscription(): Promise<Subscription | null>; subscribe(options: { userVisibleOnly: boolean; applicationServerKey: Uint8Array<ArrayBuffer> }): Promise<Subscription> } };

export type PushDeps = {
  requestPermission: () => Promise<NotificationPermission>;
  registration: () => Promise<PushRegistration>;
  /** GET /push/config: whether the server sends push, its VAPID key and the user's subscription hashes. */
  config: () => Promise<{ enabled: boolean; publicKey: string; subscriptionHashes: string[] }>;
  /** POST /push/subscriptions. */
  register: (subscription: unknown) => Promise<unknown>;
  hash: (endpoint: string) => Promise<string>;
};

export function vapidKey(base64url: string): Uint8Array<ArrayBuffer> {
  const base64 = base64url.replace(/-/g, '+').replace(/_/g, '/');
  return Uint8Array.from(atob(base64 + '='.repeat((4 - (base64.length % 4)) % 4)), (char) => char.charCodeAt(0));
}

export async function endpointHash(endpoint: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(endpoint));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

/** Current state on load: active only when this device's subscription is registered for this user. */
export async function currentPushState(env: PushEnvironment, deps: Pick<PushDeps, 'registration' | 'config' | 'hash'>): Promise<PushState> {
  const blocker = pushBlocker(env);
  if (blocker) return blocker;
  const config = await deps.config();
  if (!config.enabled) return 'server-off';
  const subscription = await (await deps.registration()).pushManager.getSubscription();
  return subscription && config.subscriptionHashes.includes(await deps.hash(subscription.endpoint)) ? 'active' : 'inactive';
}

/**
 * Must be called straight from the click handler: the permission prompt is requested before any
 * other await so WebKit still sees the user's gesture. Reuses an existing local subscription, so a
 * failed registration is retried without reinstalling.
 */
export async function activatePush(deps: PushDeps, publicKey: string): Promise<{ state: PushState; message: string }> {
  const asked = deps.requestPermission();
  try {
    const permission = await asked;
    if (permission === 'denied') return { state: 'blocked', message: 'Las notificaciones están bloqueadas para el panel. Habilitalas en la configuración del dispositivo.' };
    if (permission !== 'granted') return { state: 'inactive', message: 'No se activaron: el permiso quedó sin responder.' };
    const manager = (await deps.registration()).pushManager;
    const subscription = (await manager.getSubscription()) ?? (await manager.subscribe({ userVisibleOnly: true, applicationServerKey: vapidKey(publicKey) }));
    await deps.register(subscription.toJSON());
    const confirmed = (await deps.config()).subscriptionHashes.includes(await deps.hash(subscription.endpoint));
    return confirmed
      ? { state: 'active', message: 'Listo: este dispositivo recibe avisos con el panel cerrado.' }
      : { state: 'error', message: 'El servidor no confirmó este dispositivo. Reintentá.' };
  } catch {
    return { state: 'error', message: 'No pudimos registrar este dispositivo para avisos. Reintentá.' };
  }
}

/** Turns device alerts off: the server forgets this subscription first, then the browser drops it. */
export async function deactivatePush(deps: Pick<PushDeps, 'registration'> & { unregister: (endpoint: string) => Promise<unknown> }): Promise<void> {
  const subscription = (await (await deps.registration()).pushManager.getSubscription()) as (Subscription & { unsubscribe(): Promise<boolean> }) | null;
  if (!subscription) return;
  await deps.unregister(subscription.endpoint);
  await subscription.unsubscribe();
}
