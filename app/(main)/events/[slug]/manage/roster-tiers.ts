import type { ManageGuest } from './load'

// PURE, kept out of load.ts so it never pulls the admin client into a test or a client bundle.

/** Holders and seats per tier, for the roster's "By ticket type" line (LIVE-2548). Tickets with no
 *  tier group under "General". Sorted by seats, most first. PURE. */
export function tierBreakdown(guests: Pick<ManageGuest, 'ticket'>[]): { tier: string; holders: number; seats: number }[] {
  const by = new Map<string, { holders: number; seats: number }>()
  for (const g of guests) {
    if (!g.ticket) continue
    const key = g.ticket.tierName ?? 'General'
    const row = by.get(key) ?? { holders: 0, seats: 0 }
    row.holders += 1
    row.seats += g.ticket.qty
    by.set(key, row)
  }
  return [...by.entries()].map(([tier, v]) => ({ tier, ...v })).sort((a, b) => b.seats - a.seats || a.tier.localeCompare(b.tier))
}
