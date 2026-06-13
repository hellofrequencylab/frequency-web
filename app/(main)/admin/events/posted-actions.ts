'use server'

// Admin actions for the Posted events oversight area (/admin/events): manage the
// claim invitation (regenerate a link), hand an event to an organizer who showed
// up through another channel (assign host), and remove spam (the clawback fires
// in lib/events/event-drafts.reportRemoveEvent). ALL of these are destructive or
// secret-touching, so every one gates on the STAFF axis: janitor only.
//
// The poster-events columns aren't in the generated types yet, so events reads
// and writes go through the untyped admin handle (repo convention).

import { revalidatePath } from 'next/cache'
import { randomBytes } from 'node:crypto'
import { createAdminClient } from '@/lib/supabase/admin'
import { getCallerProfile } from '@/lib/auth'
import { authorizeAction } from '@/lib/admin/guard'
import { type ActionResult, ok, fail } from '@/lib/action-result'
import { reportRemoveEvent, notifyPosterEventClaimed } from '@/lib/events/event-drafts'
import { isValidClaim } from '@/lib/events/claim-trust'
import { recordEngagementEvent } from '@/lib/engagement/events'
import { awardZapsForAction } from '@/lib/zaps'

const db = () => createAdminClient()

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'https://frequencylocal.com'

/** Destructive / secret-touching ops on posted events are janitor-only (the
 *  STAFF axis, ADR-208) — no staff-domain widening on purpose. */
async function requireJanitor() {
  return authorizeAction(await getCallerProfile(), 'janitor')
}

function revalidateEventSurfaces() {
  revalidatePath('/admin/events')
  revalidatePath('/events')
  revalidatePath('/feed')
}

interface PostedEventRow {
  id: string
  title: string | null
  slug: string | null
  status: string | null
  host_id: string | null
  posted_by_profile_id: string | null
  claim_token: string | null
  claimed_at: string | null
  removed_at: string | null
}

/** Load an event iff it is a POSTED event (poster_scan or posted-on-behalf). */
async function getPostedEvent(eventId: string): Promise<PostedEventRow | null> {
  const { data } = await db()
    .from('events')
    .select(
      'id, title, slug, status, source, host_id, posted_by_profile_id, claim_token, claimed_at, removed_at',
    )
    .eq('id', eventId)
    .maybeSingle()
  const ev = data as (PostedEventRow & { source: string | null }) | null
  if (!ev) return null
  if (ev.source !== 'poster_scan' && !ev.posted_by_profile_id) return null
  return ev
}

// ── New claim link (janitor) ───────────────────────────────────────────────────

/**
 * Regenerate the claim token for a live, unclaimed posted event. The old link
 * stops working the moment the new one is minted (one column, one token), so this
 * is the "the flyer link leaked" / "the organizer lost the email" path.
 */
export async function regenerateClaimLink(eventId: string): Promise<ActionResult<{ claimUrl: string }>> {
  await requireJanitor()

  const ev = await getPostedEvent(eventId)
  if (!ev) return fail('That event is not a posted event.')
  if (ev.status !== 'published') return fail('Only a published event can carry a claim link.')
  if (ev.removed_at) return fail('That event was removed. Removed events cannot be claimed.')
  if (ev.host_id || ev.claimed_at) return fail('That event was already claimed. There is nothing to reissue.')

  const token = randomBytes(24).toString('base64url')
  const { error } = await db()
    .from('events')
    .update({ claim_token: token })
    .eq('id', eventId)
    .is('host_id', null)
    .is('claimed_at', null)
  if (error) return fail('Could not mint a new claim link. Try again.')

  revalidatePath('/admin/events')
  return ok({ claimUrl: `${APP_URL}/events/claim/${token}` })
}

// ── Assign host (janitor) ──────────────────────────────────────────────────────

export interface MemberSearchHit {
  id: string
  displayName: string | null
  handle: string | null
  avatarUrl: string | null
}

/** Search active members by name or handle for the Assign host picker. Janitor
 *  only (it feeds a janitor-only mutation). Mirrors the connections link-member
 *  search shape without touching that module. */
export async function searchMembersToAssign(q: string): Promise<MemberSearchHit[]> {
  await requireJanitor()
  const term = q.trim().replace(/[%,()]/g, '')
  if (term.length < 2) return []
  const { data } = await db()
    .from('profiles')
    .select('id, display_name, handle, avatar_url')
    .eq('is_active', true)
    .eq('is_demo', false)
    .or(`display_name.ilike.%${term}%,handle.ilike.%${term}%`)
    .limit(8)
  return (
    (data ?? []) as { id: string; display_name: string | null; handle: string | null; avatar_url: string | null }[]
  ).map((p) => ({ id: p.id, displayName: p.display_name, handle: p.handle, avatarUrl: p.avatar_url }))
}

/**
 * Manually hand a live, unclaimed posted event to a member — the path for an
 * organizer who turned up through email, a DM, or the front desk instead of the
 * claim link. Mirrors the claim handshake exactly: host_id transfers, the claim
 * token is cleared, the poster is notified, and the poster's claim bonus pays
 * out ONLY when the pairing passes the same trust gate as a self-serve claim
 * (no bonus for self-assigns, reciprocal rings, or fresh sockpuppets).
 */
export async function assignEventHost(eventId: string, profileId: string): Promise<ActionResult> {
  await requireJanitor()

  const ev = await getPostedEvent(eventId)
  if (!ev) return fail('That event is not a posted event.')
  if (ev.status !== 'published') return fail('Only a published event can be handed to a host.')
  if (ev.removed_at) return fail('That event was removed. Reinstate it before assigning a host.')
  if (ev.host_id || ev.claimed_at) return fail('That event already has a host.')

  const admin = db()
  const { data: assignee } = await admin
    .from('profiles')
    .select('id, is_active')
    .eq('id', profileId)
    .maybeSingle()
  if (!assignee || (assignee as { is_active?: boolean }).is_active === false) {
    return fail('Pick an active member to assign.')
  }

  const { error } = await admin
    .from('events')
    .update({ host_id: profileId, claimed_at: new Date().toISOString(), claim_token: null })
    .eq('id', eventId)
    .is('host_id', null)
    .is('claimed_at', null)
  if (error) return fail('Could not assign the host. Try again.')

  const posterId = ev.posted_by_profile_id

  // Same trust gate as a self-serve claim: an assign pays the poster's bonus only
  // when the pairing would have been a valid claim. Any trust-read failure
  // withholds the bonus rather than risk paying a farmed claim.
  let claimValid = false
  let claimReason: string | null = null
  try {
    const trust = await isValidClaim(posterId, profileId)
    claimValid = trust.valid
    claimReason = trust.reason
  } catch {
    claimValid = false
    claimReason = 'trust_check_failed'
  }

  if (posterId && claimValid) {
    try {
      const { recorded } = await recordEngagementEvent({
        idempotencyKey: `event_claim_bonus:${eventId}`,
        source: 'task',
        eventType: 'event.claim_bonus',
        actorProfileId: posterId,
        context: { eventId, kind: 'event_claim_bonus', claimerProfileId: profileId, assigned: true },
      })
      if (recorded) await awardZapsForAction(posterId, 'event_claim_bonus')
    } catch {
      /* bonus is best-effort */
    }
  }

  // Log the handover on the ledger with the same key as a self-serve claim, so
  // the quality math counts an assigned event exactly like a claimed one.
  await recordEngagementEvent({
    idempotencyKey: `event_claimed:${eventId}`,
    source: 'web',
    eventType: 'event.claimed',
    actorProfileId: profileId,
    context: {
      eventId,
      slug: ev.slug ?? '',
      kind: 'event_claim',
      valid: claimValid,
      reason: claimReason,
      claimerProfileId: profileId,
      assigned: true,
    },
  }).catch(() => {})

  // Notify the poster exactly like a claim (idempotent + best-effort in the lib).
  if (posterId && posterId !== profileId) {
    await notifyPosterEventClaimed(posterId, eventId, ev.title, claimValid)
  }

  revalidateEventSurfaces()
  return ok()
}

// ── Remove (janitor) ───────────────────────────────────────────────────────────

/**
 * Remove a posted event for a stated reason. Delegates to the engine's
 * reportRemoveEvent: removed_at + reason land on the row, the event is
 * cancelled, the poster's event_posted Zaps are clawed back exactly once, and
 * the poster is notified. The UI confirms in two steps with a required reason
 * before this ever runs.
 */
export async function removePostedEvent(
  eventId: string,
  reason: string,
): Promise<ActionResult<{ clawedBack: number }>> {
  await requireJanitor()

  const cleanReason = (reason ?? '').trim()
  if (!cleanReason) return fail('A removal reason is required. The poster will see it.')

  const ev = await getPostedEvent(eventId)
  if (!ev) return fail('That event is not a posted event.')

  const res = await reportRemoveEvent(eventId, cleanReason)
  if (!res.removed) return fail('Could not remove the event. Try again.')

  revalidateEventSurfaces()
  return ok({ clawedBack: res.clawedBack })
}
