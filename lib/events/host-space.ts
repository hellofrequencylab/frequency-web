import 'server-only'
import { loadRootSpaceId } from '@/lib/spaces/store'
import { hostingSpaceId } from './belonging'

// ── THE ONE RESOLVER for "which Space hosts this event" ──────────────────────────────────────────
//
// `hostingSpaceId` (lib/events/belonging.ts) has always been the correct rule, and it stayed pure on
// purpose — it is "decided without a database". The problem was that resolving it needs the ROOT
// Space id, which IS a database read, so ten call sites skipped the function and re-derived the pair
// by hand, chaining the explicit hosting column onto the placement one. That version is missing
// the root guard, and
// the guard is the whole point:
//
//   `20260712030000_content_space_id_default_root.sql` stamps EVERY event's space_id to the root
//   tenant on insert. So that fallback is almost never null — it is "Frequency" — and
//   every one of those ten sites read the platform's own tenant as a real hosting Space. Measured
//   2026-08-20: 33 of 59 live events are root-stamped.
//
// What that meant in practice, per site: a members-only ticket resolved to "must be a member of
// Frequency" (unbuyable); the root Space's console could manage members-access on anybody's personal
// event; a root-space steward inherited CRM access to every personal event's attendees; and a
// broadcast from the root Space addressed every event on the platform.
//
// This module exists so there is ONE async door to the rule and no reason to hand-roll it again.
// Keep `belonging.ts` pure; put the I/O here.

/** The Space that HOSTS an event — billed, displayed, accountable — with the ROOT tenant excluded.
 *  Returns null for a personal event (no Space, or only the inherited root). */
export async function resolveHostingSpaceId(row: {
  spaceId: string | null | undefined
  hostSpaceId?: string | null | undefined
}): Promise<string | null> {
  return hostingSpaceId(row, await loadRootSpaceId())
}

/** The same rule for a raw `events` row shape, which is how every call site already has it. */
export async function resolveHostingSpaceIdFromRow(
  row: { space_id: string | null; host_space_id?: string | null } | null | undefined,
): Promise<string | null> {
  if (!row) return null
  return resolveHostingSpaceId({ spaceId: row.space_id, hostSpaceId: row.host_space_id })
}
