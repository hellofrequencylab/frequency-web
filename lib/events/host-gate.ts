import { createAdminClient } from '@/lib/supabase/admin'
import { isPlatformStaff } from '@/lib/auth'

// THE HOST-GATE SEAM (ADR-841). Every "only the host may do this" event action gates through
// here so PLATFORM STAFF (web_role admin/janitor, the ADR-208 staff axis) pass alongside the
// actual host. Before this seam each action compared events.host_id to the caller directly,
// which locked staff out of every host-only control on seeded listings (host_id is the staff
// poster, or NULL when the event was posted on an organizer's behalf) — the exact events that
// most need an operator to transfer, place, and cohost them.
//
// The pure decision is split from the IO so it unit-tests without a database. Cohost standing
// is deliberately NOT part of this gate — cohosts get their (wider) management through
// isEventCohost at the call sites that admit them (ADR-834 keeps the two relations distinct).

/** The facts the pure gate decides over. */
export interface HostGateFacts {
  /** events.host_id (null on a seeded, still-unclaimed listing). */
  hostId: string | null
  /** The signed-in caller's profile id (null = anonymous). */
  viewerProfileId: string | null
  /** Platform staff on the STAFF axis (web_role admin/janitor), preview-aware. */
  staff: boolean
}

/**
 * May this viewer act with the event HOST's authority? PURE. The host themself always may;
 * platform staff may on ANY event (including a hostless seeded listing, where nobody else
 * can). Anonymous never passes, staff or not — every action still requires a signed-in actor
 * to attribute writes to. Fail-closed on missing facts.
 */
export function canActAsEventHost(facts: HostGateFacts): boolean {
  if (!facts.viewerProfileId) return false
  if (facts.staff) return true
  return !!facts.hostId && facts.hostId === facts.viewerProfileId
}

/**
 * IO front door: does `viewerProfileId` hold host authority on this event right now?
 * Reads events.host_id and the CALLER's staff standing (isPlatformStaff is caller-based and
 * view-as aware, so a janitor previewing as a member faithfully loses the override — every
 * call site passes the caller's own profile id). FAIL-CLOSED: a missing event, an anonymous
 * caller, or any read error denies.
 */
export async function viewerActsAsEventHost(
  eventId: string,
  viewerProfileId: string | null,
): Promise<boolean> {
  if (!eventId || !viewerProfileId) return false
  try {
    const admin = createAdminClient()
    const { data: ev } = await admin
      .from('events')
      .select('host_id')
      .eq('id', eventId)
      .maybeSingle()
    if (!ev) return false
    const staff = await isPlatformStaff().catch(() => false)
    return canActAsEventHost({ hostId: ev.host_id ?? null, viewerProfileId, staff })
  } catch {
    return false
  }
}
