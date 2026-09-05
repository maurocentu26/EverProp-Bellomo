import { isMockDataMode } from "./data-mode";
import {
  loadEverpropNotifications,
  markAllEverpropNotificationsRead,
  markEverpropNotificationRead,
  type ApiNotification,
} from "./everprop-api";

export type AppNotification = {
  id: string;
  targetUserId: string; // Quien recibe la notificación
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

  // Emitir evento para actualizar otras pestañas u otros componentes locales
  try {
    const channel = new BroadcastChannel("everprop_notifications");
    channel.postMessage({ type: "NOTIFICATIONS_UPDATED" });
    channel.close();

    // También dispatch local en esta misma ventana
    window.dispatchEvent(new Event("everprop_notifications_updated"));
  } catch (e) {
    console.error(e);
  }
}

export async function fetchNotifications(targetUserId?: string): Promise<AppNotification[]> {
  if (!isMockDataMode) {
    try {
      const res = await loadEverpropNotifications();
      return res.data;
    } catch (err) {
      console.error("Error loading notifications from API, falling back to local:", err);
    }
  }

  const local = loadNotifications();
  if (!targetUserId) return local;
  return local.filter((n) => n.targetUserId === targetUserId);
}

export async function markAllNotificationsAsRead(targetUserId?: string): Promise<void> {
  if (!isMockDataMode) {
    try {
      await markAllEverpropNotificationsRead();
    } catch (err) {
      console.error("Error marking notifications as read via API:", err);
    }
  }

  if (targetUserId) {
    markAllAsRead(targetUserId);
  }
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
  targetUserId: string,
  message: string,
  extra?: Partial<Omit<AppNotification, "id" | "targetUserId" | "message" | "timestamp" | "read">>
) {
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
  saveNotifications([newNotif, ...notifs].slice(0, 50)); // Guardar últimas 50
}

export function markAllAsRead(targetUserId: string) {
  const notifs = loadNotifications();
  const updated = notifs.map((n) =>
    n.targetUserId === targetUserId ? { ...n, read: true } : n
  );
  saveNotifications(updated);
}

