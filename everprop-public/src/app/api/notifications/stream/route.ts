import { notificationEmitter } from '@/lib/server/notification-emitter';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(request: Request) {
  const encoder = new TextEncoder();
  let cleanup: (() => void) | null = null;

  const stream = new ReadableStream({
    start(controller) {
      // Send initial connection event
      controller.enqueue(encoder.encode('event: connected\ndata: {}\n\n'));

      // Handler for new notifications
      const onNotification = (notification: unknown) => {
        try {
          const data = JSON.stringify(notification);
          controller.enqueue(encoder.encode(`event: notification\ndata: ${data}\n\n`));
        } catch {
          // Stream might be closed
        }
      };

      // Handler for notification updates (mark as read, etc.)
      const onUpdate = (update: unknown) => {
        try {
          const data = JSON.stringify(update);
          controller.enqueue(encoder.encode(`event: update\ndata: ${data}\n\n`));
        } catch {
          // Stream might be closed
        }
      };

      notificationEmitter.on('notification:created', onNotification);
      notificationEmitter.on('notifications:updated', onUpdate);

      // Keepalive ping every 15 seconds
      const keepalive = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(': keepalive\n\n'));
        } catch {
          clearInterval(keepalive);
        }
      }, 15_000);

      cleanup = () => {
        clearInterval(keepalive);
        notificationEmitter.off('notification:created', onNotification);
        notificationEmitter.off('notifications:updated', onUpdate);
        try {
          controller.close();
        } catch {
          // Controller might already be closed
        }
      };
    },
    cancel() {
      cleanup?.();
    },
  });

  // Handle client disconnect / abort signal
  request.signal.addEventListener('abort', () => {
    cleanup?.();
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
}
