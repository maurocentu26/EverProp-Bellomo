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

const STORAGE_KEY = "everprop:notifications";

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

export async function fetchNotifications(targetUserId?: string): Promise<AppNotification[]> {
  if (!isMockDataMode) {
    const res = await loadEverpropNotifications();
    return res.data;
  }

  const local = loadNotifications();
  if (!targetUserId) return local;
  return local.filter((n) => n.targetUserId === targetUserId);
}

export async function markAllNotificationsAsRead(targetUserId?: string): Promise<void> {
  if (!isMockDataMode) {
    await markAllEverpropNotificationsRead();
    return;
  }

  if (targetUserId) markAllAsRead(targetUserId);
}

export async function markNotificationAsRead(id: string): Promise<void> {
  if (!isMockDataMode) {
    await markEverpropNotificationRead(id);
    return;
  }

  const notifs = loadNotifications();
  const updated = notifs.map((n) => (n.id === id ? { ...n, read: true } : n));
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

export function markAllAsRead(targetUserId: string) {
  const notifs = loadNotifications();
  const updated = notifs.map((n) =>
    n.targetUserId === targetUserId ? { ...n, read: true } : n
  );
  saveNotifications(updated);
}

export async function clearAllNotifications(targetUserId?: string): Promise<void> {
  if (!isMockDataMode) {
    await clearAllEverpropNotifications();
    return;
  }

  if (typeof window !== "undefined") {
    const remaining = targetUserId
      ? loadNotifications().filter((notification) => notification.targetUserId !== targetUserId)
      : [];
    saveNotifications(remaining);
    try {
      const channel = new BroadcastChannel("everprop_notifications");
      channel.postMessage({ type: "NOTIFICATIONS_UPDATED" });
      channel.close();
      window.dispatchEvent(new Event("everprop_notifications_updated"));
    } catch (e) {
      console.error(e);
    }
  }
}

// ── Desktop Notification Permissions ──

export async function requestDesktopNotificationPermission(): Promise<NotificationPermission | 'unsupported'> {
  if (typeof window === 'undefined' || !('Notification' in window)) {
    return 'unsupported';
  }
  if (Notification.permission === 'granted') return 'granted';
  if (Notification.permission === 'denied') return 'denied';
  return Notification.requestPermission();
}

export function showDesktopNotification(title: string, options?: NotificationOptions): void {
  if (typeof window === 'undefined' || !('Notification' in window)) return;
  if (Notification.permission !== 'granted') return;
  try {
    new Notification(title, {
      icon: '/favicon.ico',
      badge: '/favicon.ico',
      ...options,
    });
  } catch {
    // Silently fail
  }
}
