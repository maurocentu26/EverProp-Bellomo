const DIRECTION_THRESHOLD = 8;

type TopbarScrollState = { hidden: boolean; anchor: number };

/** Decides the topbar state from a scroll position; `anchor` only moves once the direction threshold is passed. */
export function nextTopbarState(
  { hidden, anchor }: TopbarScrollState,
  { y, maxScroll, height }: { y: number; maxScroll: number; height: number },
): TopbarScrollState {
  const position = Math.min(Math.max(y, 0), Math.max(maxScroll, 0));
  // Hiding grows the scroll area: on pages that barely scroll it would clamp the position and flicker forever.
  if (position <= height || maxScroll <= height * 2) return { hidden: false, anchor: position };
  if (Math.abs(position - anchor) < DIRECTION_THRESHOLD) return { hidden, anchor };
  return { hidden: position > anchor, anchor: position };
}
