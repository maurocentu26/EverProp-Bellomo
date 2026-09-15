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
