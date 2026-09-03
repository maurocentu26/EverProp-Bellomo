export function deferEffectUpdate(update: () => void) {
  let cancelled = false;

  queueMicrotask(() => {
    if (!cancelled) update();
  });

  return () => {
    cancelled = true;
  };
}
