import { createAdminClient } from '@/lib/supabase/admin'

// RSVP depth data layer (EVENTS-REWORK A1) — maybe / waitlist / plus-ones,
// host-only decline reasons, the approval queue, and per-event mute.
//
// The capacity trigger (20260610030000) still owns over-capacity coercion:
// writing status='going' to a full event is coerced to 'waitlist' in the DB, so
// these setters never need to re-check capacity. plus_one_names / decline_reason /
// approval_status / muted are in lib/database.types.ts now, so the admin client is
// used directly and fully typed.

/** The untyped table surface (ADR-246) for the guest identity columns, which postdate
 *  lib/database.types.ts. Narrow on purpose: only the chain listPendingApprovals calls. */
type UntypedTable = {
  from: (table: string) => {
    select: (cols: string) => {
      eq: (col: string, val: unknown) => {
        eq: (col: string, val: unknown) => {
          order: (
            col: string,
            opts: { ascending: boolean },
          ) => Promise<{ data: unknown; error: { message: string } | null }>
        }
      }
    }
  }
}

/** The untyped single-row read surface (ADR-246), for columns the generated types predate. */
type UntypedSingle = {
  from: (table: string) => {
    select: (cols: string) => {
      eq: (col: string, val: unknown) => {
        maybeSingle: () => Promise<{ data: unknown; error: { message: string } | null }>
      }
    }
  }
}

export type RsvpStatus = 'going' | 'not_going' | 'maybe' | 'waitlist'
export type ApprovalStatus = 'none' | 'pending' | 'approved'

export interface SetRsvpArgs {
  eventId: string
  profileId: string
  status: RsvpStatus
  /** Names of the +1s, when the guest brings any (host may require these). */
  plusOneNames?: string[]
  /** Host-only-visible reason; only meaningful when status='not_going'. */
  declineReason?: string | null
  /** 'pending' for approval-required events; 'approved' for invited guests who
   *  skip the queue; 'none' (default) when the event needs no approval. */
  approvalStatus?: ApprovalStatus
}

/**
 * Upsert a guest's RSVP with full depth. One row per (event, profile) — upsert on
 * that pair so a guest changing their mind updates in place. plus_one_names is
 * normalized to a trimmed, non-empty string array; its length is the +1 count.
 *
 * Lets the DB capacity trigger have the final say on 'going' vs 'waitlist'; we
 * don't pre-check capacity here.
 */
export async function setRsvp(args: SetRsvpArgs): Promise<{ id: string } | null> {
  const admin = createAdminClient()
  const names = (args.plusOneNames ?? [])
    .map((n) => n.trim())
    .filter((n) => n.length > 0)

  const { data, error } = await admin
    .from('event_rsvps')
    .upsert(
      {
        event_id: args.eventId,
        profile_id: args.profileId,
        status: args.status,
        plus_ones: names.length,
        plus_one_names: names,
        decline_reason: args.status === 'not_going' ? (args.declineReason ?? null) : null,
        approval_status: args.approvalStatus ?? 'none',
      },
      { onConflict: 'event_id,profile_id' },
    )
    .select('id')
    .maybeSingle()

  if (error || !data) return null
  return { id: data.id }
}

/** Host approves a pending RSVP. Approving does NOT force 'going' — the guest's
 *  chosen status stands and the capacity trigger still applies if they're going. */
export async function approveRsvp(eventId: string, profileId: string): Promise<void> {
  const admin = createAdminClient()
  await admin
    .from('event_rsvps')
    .update({ approval_status: 'approved' })
    .eq('event_id', eventId)
    .eq('profile_id', profileId)
}

/** Approve one pending seat BY ROW, which is the only handle a guest seat has.
 *
 *  `approveRsvp` keys on profile_id, so it can never target a signed-out guest — the predicate
 *  `profile_id = NULL` matches nothing. That is not a gap to paper over with a second lookup:
 *  a host admitting someone should be identifying the SEAT, and the row id is the one identifier
 *  every seat carries. The event id is still matched so a row id from another event cannot be
 *  approved through this path. */
/** What approving a seat came back with. `ok: false` means the row is NOT approved: the caller
 *  must not tell the person waiting, and must not report success. */
export type ApproveRsvpResult = { ok: true } | { ok: false; error: string }

// 🔴 CORRECTION 2026-09-05 (scan-2 L5-10). This used to return `Promise<void>` and never read the
// update's `error`, so both callers went on to send the "you're in" notice unconditionally: a person
// could be told they were approved while the row still said pending, and the host's console reported
// success it had not measured. The update now reads its error and selects the row it touched, so a
// refused write and a predicate that matched nothing (wrong event, stale id) are both reported as
// `ok: false`. Every "approved" notice and every success return is gated on `ok`.
export async function approveRsvpById(eventId: string, rsvpId: string): Promise<ApproveRsvpResult> {
  const admin = createAdminClient()
  const { data, error } = await admin
    .from('event_rsvps')
    .update({ approval_status: 'approved' })
    .eq('event_id', eventId)
    .eq('id', rsvpId)
    .select('id')
  if (error) return { ok: false, error: error.message || 'The approval could not be saved.' }
  if (!data || data.length === 0) return { ok: false, error: 'That request could not be found.' }
  return { ok: true }
}

/** Does this event make people wait for the host?
 *
 *  `events.rsvp_requires_approval` (20270303000000) is the column that was missing for the whole
 *  life of the approval feature: approval_status, the host's approve action and the queue all
 *  shipped in 20260625020000, but nothing could ever set a request to 'pending', so the queue was
 *  permanently empty. Reads false on any error — the fail-safe direction is admitting someone, not
 *  silently holding them in a queue nobody knows to look at. */
// 🔴 CORRECTION 2026-09-05 (scan-2 L5-15). The paragraph above is wrong about the fail-safe
// direction, and this reader now does the OPPOSITE of what it says: it returns TRUE on a read error
// or a missing row. Admitting on a failed read is the unsafe direction for the one thing this gate
// protects. An approval-gated event hides its venue until the host says yes; a member admitted past
// the gate on a flaky read has already been shown the address and told they are in, and neither
// can be un-seen. A request that lands as pending on the same flaky read can be approved a minute
// later, and the host sees it in the queue. So the cost of failing closed is a short wait; the cost
// of failing open is a disclosed venue. app/(main)/events/actions.ts carried a local fail-closed
// copy first (eventRequiresApprovalOrClosed); this is the same rule for every remaining caller.
export async function eventRequiresApproval(eventId: string): Promise<boolean> {
  const admin = createAdminClient()
  const { data, error } = await (admin as unknown as UntypedSingle)
    .from('events')
    .select('rsvp_requires_approval')
    .eq('id', eventId)
    .maybeSingle()
  if (error || !data) {
    console.error('[events approval gate read]', error ?? 'no row')
    return true
  }
  return (data as { rsvp_requires_approval: boolean | null }).rsvp_requires_approval === true
}

/** One seat waiting on the host. `profileId` is null for a signed-out guest, which is why
 *  `rsvpId` exists — it is the only identifier both kinds of seat share. */
export type PendingApproval = {
  rsvpId: string
  profileId: string | null
  guestName: string | null
  guestEmail: string | null
  status: RsvpStatus
  createdAt: string
}

/** The host's pending-approval queue for an event, oldest first.
 *
 *  🔴 This used to return `{ profileId: string }` and hand a guest's NULL straight to
 *  profileMap([null]) → `.in('id', [null])`, so the queue could neither DISPLAY a guest request
 *  nor approve one. An approval gate that silently drops half its requests is worse than no gate:
 *  the person waits forever and the host never knows they asked. */
export async function listPendingApprovals(eventId: string): Promise<PendingApproval[]> {
  const admin = createAdminClient()
  // Untyped (ADR-246): guest_email / guest_name are live columns the generated types predate.
  const { data } = await (admin as unknown as UntypedTable)
    .from('event_rsvps')
    .select('id, profile_id, guest_email, guest_name, status, created_at')
    .eq('event_id', eventId)
    .eq('approval_status', 'pending')
    .order('created_at', { ascending: true })

  const rows = (data ?? []) as {
    id: string; profile_id: string | null; guest_email: string | null
    guest_name: string | null; status: string; created_at: string | null
  }[]

  return rows.map((r) => ({
    rsvpId: r.id,
    profileId: r.profile_id,
    guestName: r.guest_name,
    guestEmail: r.guest_email,
    // `status` is a free-text column at the DB layer; the app constrains it to RsvpStatus.
    status: r.status as RsvpStatus,
    // created_at has a DB default (never null for an app-written RSVP); ?? keeps the string contract.
    createdAt: r.created_at ?? '',
  }))
}

