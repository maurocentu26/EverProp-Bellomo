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

export type UserIdentifier = {
  id: string;
  email?: string | null;
} | string | null | undefined;

const STORAGE_KEY = "everprop:notifications";

/**
 * Grupos de equivalencia de usuarios entre id demo, id UUID de base de datos, id numérico y email.
 */
const USER_ALIAS_GROUPS: string[][] = [
  // Marcos Bellomo (Admin)
  ["usr-admin", "b1100000-0000-4000-8000-000000000100", "3", "admin@bellomo.com"],
  // Lucas Albarracín (Asesor Comercial Lotes)
  ["usr-sales", "b1100000-0000-4000-8000-000000000101", "1", "lucas.albarracin@bellomo.com", "u2"],
  // Valentina Morales (Asesora Comercial Locales & Inversiones)
  ["usr-sales-2", "b1100000-0000-4000-8000-000000000102", "2", "valentina.morales@bellomo.com"],
  // Ing. Sofía Bellomo (Directora de Obra / Ingeniera)
  ["usr-manager", "b1100000-0000-4000-8000-000000000104", "4", "sofia@bellomo.com"],
];

/**
 * Determina de forma estricta si una notificación está dirigida al usuario actual.
 * Cada usuario solo ve sus propias notificaciones (incluso si es Admin).
 */
export function isNotificationForUser(
  targetUserId: string | null | undefined,
  currentUser: UserIdentifier
): boolean {
  if (!currentUser) return false;
  if (!targetUserId) return false;

  const target = String(targetUserId).trim().toLowerCase();
  if (target === "all" || target === "broadcast") return true;

  const currentUserId = typeof currentUser === "string" 
    ? currentUser.trim().toLowerCase() 
    : currentUser.id?.trim().toLowerCase() || "";
  const currentUserEmail = (typeof currentUser !== "string" && currentUser?.email)
    ? currentUser.email.trim().toLowerCase()
    : "";

  if (!currentUserId && !currentUserEmail) return false;

  // 1. Coincidencia directa por ID o Email
  if (target === currentUserId) return true;
  if (currentUserEmail && target === currentUserEmail) return true;

  // 2. Coincidencia por grupo de alias (UUID, demo id, id numérico)
  for (const group of USER_ALIAS_GROUPS) {
    const targetMatches = group.some((alias) => alias.toLowerCase() === target);
    const userMatches = group.some((alias) => 
      alias.toLowerCase() === currentUserId || (currentUserEmail && alias.toLowerCase() === currentUserEmail)
    );
    if (targetMatches && userMatches) {
      return true;
    }
  }

  return false;
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
  if (!isMockDataMode) {
    try {
      const res = await loadEverpropNotifications();
      if (res && Array.isArray(res.data) && res.data.length > 0) {
        return res.data.filter((n) => isNotificationForUser(n.targetUserId, currentUser));
      }
    } catch {
      // Fallback
    }
  }

  const local = loadNotifications();
  if (!currentUser) return [];
  return local.filter((n) => isNotificationForUser(n.targetUserId, currentUser));
}

export async function markAllNotificationsAsRead(currentUser?: UserIdentifier): Promise<void> {
  if (!isMockDataMode) {
    try {
      await markAllEverpropNotificationsRead();
    } catch (err) {
      console.error("Error marking notifications as read via API:", err);
    }
  }

  markAllAsRead(currentUser);
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

export function markAllAsRead(currentUser?: UserIdentifier) {
  const notifs = loadNotifications();
  if (!currentUser) return;
  const updated = notifs.map((n) =>
    isNotificationForUser(n.targetUserId, currentUser) ? { ...n, read: true } : n
  );
  saveNotifications(updated);
}

export async function clearAllNotifications(currentUser?: UserIdentifier): Promise<void> {
  if (!isMockDataMode) {
    try {
      await clearAllEverpropNotifications();
    } catch (err) {
      console.error("Error clearing notifications via API:", err);
    }
  }

  if (typeof window !== "undefined") {
    if (currentUser) {
      const notifs = loadNotifications();
      const remaining = notifs.filter((n) => !isNotificationForUser(n.targetUserId, currentUser));
      saveNotifications(remaining);
    } else {
      localStorage.removeItem(STORAGE_KEY);
      saveNotifications([]);
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
