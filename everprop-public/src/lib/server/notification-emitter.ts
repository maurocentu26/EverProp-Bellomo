import { EventEmitter } from 'events';

// Singleton EventEmitter for notification broadcasting across SSE connections
// Using globalThis to persist across HMR reloads in development
const globalForEmitter = globalThis as unknown as {
  __notificationEmitter?: EventEmitter;
};

export const notificationEmitter: EventEmitter =
  globalForEmitter.__notificationEmitter ?? new EventEmitter();

if (process.env.NODE_ENV !== 'production') {
  globalForEmitter.__notificationEmitter = notificationEmitter;
}

// Increase max listeners to support multiple SSE connections
notificationEmitter.setMaxListeners(100);
