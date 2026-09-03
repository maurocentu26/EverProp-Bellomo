export type AppNotification = {
  id: string;
  targetUserId: string; // Quien recibe la notificación
  message: string;
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

export function createNotification(targetUserId: string, message: string) {
  const notifs = loadNotifications();
  const newNotif: AppNotification = {
    id: crypto.randomUUID(),
    targetUserId,
    message,
    timestamp: new Date().toISOString(),
    read: false,
  };
  saveNotifications([newNotif, ...notifs].slice(0, 50)); // Guardar últimas 50
}

export function markAllAsRead(targetUserId: string) {
  const notifs = loadNotifications();
  const updated = notifs.map(n => 
    n.targetUserId === targetUserId ? { ...n, read: true } : n
  );
  saveNotifications(updated);
}
