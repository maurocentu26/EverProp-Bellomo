// Enable these sections for the final delivery without removing their implementation.
export const FINAL_DELIVERY_ENABLED = false;

export function isReleaseRouteVisible(href: string): boolean {
  return FINAL_DELIVERY_ENABLED || !/^\/admin\/(cobranzas|settings)(?:[/?#]|$)/.test(href);
}
