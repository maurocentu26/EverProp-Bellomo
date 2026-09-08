import { isMockDataMode } from "./data-mode";
import {
  loadEverpropNotifications,
  markAllEverpropNotificationsRead,
  markEverpropNotificationRead,
  clearAllEverpropNotifications,
  type ApiNotification,
} from "./everprop-api";

export type AppNotification = {
  id: string;
  targetUserId: string | null;
  title?: string;
  message: string;
  leadId?: string | null;
  actionUrl?: string | null;
  eventType?: string | null;
  timestamp: string;
  read: boolean;
};

const STORAGE_KEY = "everprop:notifications";

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

export async function fetchNotifications(targetUserId?: string, isAdmin?: boolean): Promise<AppNotification[]> {
  if (!isMockDataMode) {
    try {
      const res = await loadEverpropNotifications();
      if (res && Array.isArray(res.data) && res.data.length > 0) {
        return res.data;
      }
    } catch {
      // Remote API not reachable, fallback to local
    }
  }

  const local = loadNotifications();
  if (!targetUserId || isAdmin) return local;
  return local.filter((n) => !n.targetUserId || n.targetUserId === targetUserId);
}

export async function markAllNotificationsAsRead(targetUserId?: string, isAdmin?: boolean): Promise<void> {
  if (!isMockDataMode) {
    try {
      await markAllEverpropNotificationsRead();
    } catch (err) {
      console.error("Error marking notifications as read via API:", err);
    }
  }

  // Notificar al servidor Next.js para marcar en memoria
  if (typeof window !== "undefined") {
    fetch("/api/notifications", { method: "PATCH" }).catch(() => {});
  }

  markAllAsRead(targetUserId, isAdmin);
}

export async function markNotificationAsRead(id: string): Promise<void> {
  if (!isMockDataMode) {
    try {
      await markEverpropNotificationRead(id);
    } catch (err) {
      console.error("Error marking notification read via API:", err);
    }
  }

  const notifs = loadNotifications();
  const updated = notifs.map((n) => (n.id === id ? { ...n, read: true } : n));
  saveNotifications(updated);
}

export function createNotification(
  targetUserId: string | null,
  message: string,
  extra?: Partial<Omit<AppNotification, "id" | "targetUserId" | "message" | "timestamp" | "read">>
) {
  const notifs = loadNotifications();
  const newNotif: AppNotification = {
    id: crypto.randomUUID(),
    targetUserId: targetUserId || null,
    message,
    title: extra?.title || "Notificación",
    leadId: extra?.leadId || null,
    actionUrl: extra?.actionUrl || null,
    eventType: extra?.eventType || "INFO",
    timestamp: new Date().toISOString(),
    read: false,
  };
  saveNotifications([newNotif, ...notifs].slice(0, 50));

  // Notificar al endpoint SSE en servidor para emisión en tiempo real
  if (typeof window !== "undefined") {
    fetch("/api/notifications", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(newNotif),
    }).catch((err) => {
      console.warn("Could not post notification to SSE endpoint:", err);
    });
  }
}

export function markAllAsRead(targetUserId?: string, isAdmin?: boolean) {
  const notifs = loadNotifications();
  const updated = notifs.map((n) =>
    (!targetUserId || isAdmin || !n.targetUserId || n.targetUserId === targetUserId)
      ? { ...n, read: true }
      : n
  );
  saveNotifications(updated);
}

export async function clearAllNotifications(targetUserId?: string): Promise<void> {
  if (!isMockDataMode) {
    try {
      await clearAllEverpropNotifications();
    } catch (err) {
      console.error("Error clearing notifications via API:", err);
    }
  }

  if (typeof window !== "undefined") {
    fetch("/api/notifications", { method: "DELETE" }).catch(() => {});
    localStorage.removeItem(STORAGE_KEY);
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
