import { createAdminClient } from '@/lib/supabase/admin'

// RSVP depth data layer (EVENTS-REWORK A1) — maybe / waitlist / plus-ones,
// host-only decline reasons, the approval queue, and per-event mute.
//
// The capacity trigger (20260610030000) still owns over-capacity coercion:
// writing status='going' to a full event is coerced to 'waitlist' in the DB, so
// these setters never need to re-check capacity. plus_one_names / decline_reason /
// approval_status / muted are in lib/database.types.ts now, so the admin client is
// used directly and fully typed.

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

/** The host's pending-approval queue for an event, oldest first. */
export async function listPendingApprovals(
  eventId: string,
): Promise<{ profileId: string; status: RsvpStatus; createdAt: string }[]> {
  const admin = createAdminClient()
  const { data } = await admin
    .from('event_rsvps')
    .select('profile_id, status, created_at')
    .eq('event_id', eventId)
    .eq('approval_status', 'pending')
    .order('created_at', { ascending: true })

  return (data ?? []).map((r) => ({
    profileId: r.profile_id,
    // `status` is a free-text column at the DB layer; the app constrains it to RsvpStatus.
    status: r.status as RsvpStatus,
    // created_at has a DB default (never null for an app-written RSVP); ?? keeps the string contract.
    createdAt: r.created_at ?? '',
  }))
}

