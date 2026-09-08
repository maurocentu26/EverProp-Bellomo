import { isMockDataMode } from "./data-mode";
import {
  loadEverpropNotifications,
  markAllEverpropNotificationsRead,
  markEverpropNotificationRead,
  clearAllEverpropNotifications,
} from "./everprop-api";

export type AppNotification = {
  id: string;
  targetUserId: string;
  title?: string;
  message: string;
  leadId?: string | null;
  actionUrl?: string | null;
  eventType?: string | null;
  timestamp: string;
  read: boolean;
};

export type UserIdentifier = {
  id: string;
  email?: string | null;
} | string | null | undefined;

const STORAGE_KEY = "everprop:notifications";

function normalized(value?: string | null): string {
  return value?.trim().toLowerCase() ?? "";
}

/**
 * Enforces exact recipient matching without role-based overrides or hard-coded
 * identity aliases. The authenticated API remains the authority in API mode.
 */
export function isNotificationForUser(
  targetUserId: string | null | undefined,
  currentUser: UserIdentifier
): boolean {
  const target = normalized(targetUserId);
  if (!target || !currentUser) return false;

  if (typeof currentUser === "string") {
    return target === normalized(currentUser);
  }

  return target === normalized(currentUser.id)
    || Boolean(currentUser.email && target === normalized(currentUser.email));
}

export function safeAdminActionUrl(value?: string | null): string | null {
  if (!value) return null;

  try {
    const base = "https://everprop.invalid";
    const parsed = new URL(value, base);
    if (parsed.origin !== base) return null;
    if (parsed.pathname !== "/admin" && !parsed.pathname.startsWith("/admin/")) return null;
    return `${parsed.pathname}${parsed.search}${parsed.hash}`;
  } catch {
    return null;
  }
}

export function loadNotifications(): AppNotification[] {
  if (typeof window === "undefined") return [];
  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored) {
    try {
      return JSON.parse(stored);
    } catch (e) {
      console.error(e);
      return [];
    }
  }
  return [];
}

export function saveNotifications(notifications: AppNotification[]) {
  if (typeof window === "undefined") return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(notifications));

  try {
    const channel = new BroadcastChannel("everprop_notifications");
    channel.postMessage({ type: "NOTIFICATIONS_UPDATED" });
    channel.close();
    window.dispatchEvent(new Event("everprop_notifications_updated"));
  } catch (e) {
    console.error(e);
  }
}

export async function fetchNotifications(currentUser?: UserIdentifier): Promise<AppNotification[]> {
  if (!currentUser) return [];

  if (!isMockDataMode) {
    const response = await loadEverpropNotifications();
    return response.data.filter((notification) =>
      isNotificationForUser(notification.targetUserId, currentUser)
    );
  }

  return loadNotifications().filter((notification) =>
    isNotificationForUser(notification.targetUserId, currentUser)
  );
}

export async function markAllNotificationsAsRead(currentUser?: UserIdentifier): Promise<void> {
  if (!currentUser) return;

  if (!isMockDataMode) {
    await markAllEverpropNotificationsRead();
    return;
  }

  markAllAsRead(currentUser);
}

export async function markNotificationAsRead(id: string): Promise<void> {
  if (!isMockDataMode) {
    await markEverpropNotificationRead(id);
    return;
  }

  const notifs = loadNotifications();
  const updated = notifs.map((notification) =>
    notification.id === id ? { ...notification, read: true } : notification
  );
  saveNotifications(updated);
}

export function createNotification(
  targetUserId: string,
  message: string,
  extra?: Partial<Omit<AppNotification, "id" | "targetUserId" | "message" | "timestamp" | "read">>
) {
  if (!isMockDataMode) return;

  const notifs = loadNotifications();
  const newNotif: AppNotification = {
    id: crypto.randomUUID(),
    targetUserId,
    message,
    title: extra?.title || "Notificación",
    leadId: extra?.leadId || null,
    actionUrl: extra?.actionUrl || null,
    eventType: extra?.eventType || "INFO",
    timestamp: new Date().toISOString(),
    read: false,
  };
  saveNotifications([newNotif, ...notifs].slice(0, 50));
}

export function markAllAsRead(currentUser: UserIdentifier) {
  if (!currentUser) return;

  const notifs = loadNotifications();
  const updated = notifs.map((notification) =>
    isNotificationForUser(notification.targetUserId, currentUser)
      ? { ...notification, read: true }
      : notification
  );
  saveNotifications(updated);
}

export async function clearAllNotifications(currentUser?: UserIdentifier): Promise<void> {
  if (!currentUser) return;

  if (!isMockDataMode) {
    await clearAllEverpropNotifications();
    return;
  }

  if (typeof window !== "undefined") {
    const remaining = loadNotifications().filter((notification) =>
      !isNotificationForUser(notification.targetUserId, currentUser)
    );
    saveNotifications(remaining);
  }
}

// ── Desktop Notification Permissions ──

export async function requestDesktopNotificationPermission(): Promise<NotificationPermission | "unsupported"> {
  if (typeof window === "undefined" || !("Notification" in window)) {
    return "unsupported";
  }
  if (Notification.permission === "granted") return "granted";
  if (Notification.permission === "denied") return "denied";
  return Notification.requestPermission();
}

export function showDesktopNotification(title: string, options?: NotificationOptions): void {
  if (typeof window === "undefined" || !("Notification" in window)) return;
  if (Notification.permission !== "granted") return;
  try {
    new Notification(title, {
      icon: "/favicon.ico",
      badge: "/favicon.ico",
      ...options,
    });
  } catch {
    // Desktop notification support varies by browser and OS policy.
  }
}
