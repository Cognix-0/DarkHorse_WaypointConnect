import type { Order } from './types.ts';

/**
 * Team priority policy (used by the order queue and by Suggest plan):
 *  1. Outlets skipped on the last run, then outlets unserved for 2+ days  (fairness)
 *  2. Fresh chilled  (perishable, scarcest capacity)
 *  3. Fresh ambient
 *  4. Tech  (high value, not perishable)
 *  5. Style (weekly, holds stock)
 * Tie-breaks: hardest to place first (van-only, mall slot), earliest window close, heaviest first.
 */
export function priorityRank(o: Order): number {
  if (o.deferredYesterday) return 1;
  if (o.daysSinceLastServed >= 2 && o.brand === 'Fresh') return 1;
  if (o.brand === 'Fresh') return o.temp === 'chilled' ? 2 : 3;
  if (o.brand === 'Tech') return 4;
  return 5;
}

const hardness = (o: Order) => (o.parking === 'van_only' ? 0 : o.parking === 'mall_dock' ? 1 : 2);

export function comparePriority(a: Order, b: Order): number {
  return (
    priorityRank(a) - priorityRank(b) ||
    Number(b.deferredYesterday) - Number(a.deferredYesterday) ||
    b.daysSinceLastServed - a.daysSinceLastServed ||
    hardness(a) - hardness(b) ||
    a.windowClose.localeCompare(b.windowClose) ||
    b.weightKg - a.weightKg ||
    a.ref.localeCompare(b.ref)
  );
}

export const sortByPriority = (orders: Order[]) => [...orders].sort(comparePriority);
