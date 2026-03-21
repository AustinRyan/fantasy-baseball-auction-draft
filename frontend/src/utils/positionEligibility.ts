/** Maps raw positions to the roster slots they can fill. */
export const POSITION_SLOT_MAP: Record<string, string[]> = {
  C: ['C', 'U'],
  '1B': ['1B', 'CI', 'U'],
  '2B': ['2B', 'MI', 'U'],
  '3B': ['3B', 'CI', 'U'],
  SS: ['SS', 'MI', 'U'],
  OF: ['OF', 'U'],
  DH: ['U'],
  SP: ['P'],
  RP: ['P'],
};

/** Expand raw positions into all eligible roster slots (deduplicated, ordered). */
export function getEligibleSlots(positions: string[]): string[] {
  const slots = new Set<string>();
  for (const pos of positions) {
    const eligible = POSITION_SLOT_MAP[pos];
    if (eligible) {
      for (const s of eligible) slots.add(s);
    } else {
      slots.add(pos);
    }
  }
  return Array.from(slots);
}
