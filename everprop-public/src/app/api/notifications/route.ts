import { NextResponse } from 'next/server';
import { notificationEmitter } from '@/lib/server/notification-emitter';

const globalForNotifications = globalThis as unknown as {
  __recentNotifications?: Array<Record<string, unknown>>;
};

if (!globalForNotifications.__recentNotifications) {
  globalForNotifications.__recentNotifications = [];
}

export async function GET() {
  const list = globalForNotifications.__recentNotifications ?? [];
  return NextResponse.json({
    notifications: list,
    unreadCount: list.filter((n) => !n.read).length,
  });
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const notification = {
      id: body.id || crypto.randomUUID(),
      targetUserId: body.targetUserId || null,
      title: body.title || 'Nueva notificación',
      message: body.message || '',
      leadId: body.leadId || null,
      actionUrl: body.actionUrl || null,
      eventType: body.eventType || body.type || 'INFO',
      timestamp: body.timestamp || new Date().toISOString(),
      read: false,
    };

    // Store in recent in-memory list (limit 50)
    const list = globalForNotifications.__recentNotifications ?? [];
    globalForNotifications.__recentNotifications = [notification, ...list.filter(n => n.id !== notification.id)].slice(0, 50);

    // Broadcast to all SSE connections
    notificationEmitter.emit('notification:created', notification);

    return NextResponse.json(notification, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: 'Invalid notification payload' },
      { status: 400 }
    );
  }
}

export async function PATCH() {
  const list = globalForNotifications.__recentNotifications ?? [];
  globalForNotifications.__recentNotifications = list.map((n) => ({ ...n, read: true }));
  notificationEmitter.emit('notifications:updated', { allRead: true });
  return NextResponse.json({ ok: true });
}

export async function DELETE() {
  globalForNotifications.__recentNotifications = [];
  notificationEmitter.emit('notifications:updated', { cleared: true });
  return NextResponse.json({ ok: true });
}

