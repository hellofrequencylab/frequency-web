'use server'

// Seeker waitlist actions (Growth OS Engine 3, GE3-1, ADR-456). Manifesto-first
// join: a signed-in member or an anonymous email joins a track and gets a position.
// The referral-position + share mechanics (GE3-5) are deferred, so position is a
// plain append today (nextWaitlistPosition). Writes go through the service role; this
// action is the authority (the table has no insert policy).

import { revalidatePath } from 'next/cache'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { ok, fail, type ActionResult } from '@/lib/action-result'
import { recordEngagementEvent } from '@/lib/engagement/events'
import { nextWaitlistPosition, type WaitlistTrack } from '@/lib/applications/store'

// waitlist_entries is not in the generated DB types until regen, so writes go through
// an untyped admin handle (the funnels/circles convention, ADR-246): the
// SupabaseClient return annotation widens off the typed-table union without a cast.
function wlDb(): SupabaseClient {
  return createAdminClient()
}

const TRACKS: readonly WaitlistTrack[] = ['seeker', 'builder', 'city']

function asTrack(v: string | null | undefined): WaitlistTrack {
  return v && (TRACKS as readonly string[]).includes(v) ? (v as WaitlistTrack) : 'seeker'
}

/** The signed-in member's profile id + email, or null for an anonymous joiner. */
async function caller(): Promise<{ id: string; email: string | null } | null> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return null
  const admin = createAdminClient()
  const { data } = await admin.from('profiles').select('id, email').eq('auth_user_id', user.id).maybeSingle()
  const me = data as { id: string; email?: string | null } | null
  return me ? { id: me.id, email: me.email ?? user.email ?? null } : null
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export interface JoinWaitlistInput {
  track?: string
  /** Required for an anonymous joiner; ignored for a signed-in member. */
  email?: string
  name?: string
  locality?: string
}

export interface JoinResult {
  position: number | null
  alreadyJoined: boolean
}

/**
 * Join a waitlist track. A signed-in member joins by profile (deduped by the
 * partial unique index); an anonymous joiner needs a valid email (deduped by the
 * email index). Returns the joiner's position. Idempotent: a repeat join returns the
 * existing position rather than erroring.
 */
export async function joinWaitlist(input: JoinWaitlistInput): Promise<ActionResult<JoinResult>> {
  const track = asTrack(input.track)
  const me = await caller()
  const admin = wlDb()

  // Resolve the dedupe target.
  let profileId: string | null = null
  let email: string | null = null
  const name = input.name?.trim()?.slice(0, 120) || null
  if (me) {
    profileId = me.id
    email = me.email
  } else {
    email = input.email?.trim()?.toLowerCase() || null
    if (!email || !EMAIL_RE.test(email)) return fail('Enter a valid email so we can reach you.')
  }

  // Already on this track? Return the existing position (idempotent).
  const existingQ = profileId
    ? admin.from('waitlist_entries').select('id, position').eq('profile_id', profileId).eq('track', track)
    : admin.from('waitlist_entries').select('id, position').eq('email', email).eq('track', track).is('profile_id', null)
  const { data: existing } = await existingQ.maybeSingle()
  if (existing) {
    const row = existing as { id: string; position: number | null }
    return ok({ position: row.position, alreadyJoined: true })
  }

  const position = await nextWaitlistPosition(track)
  const { data, error } = await admin
    .from('waitlist_entries')
    .insert({
      track,
      profile_id: profileId,
      email,
      name,
      locality: input.locality?.trim()?.slice(0, 120) || null,
      position,
      status: 'waiting',
    })
    .select('id')
    .single()
  if (error || !data) return fail('Could not join the waitlist. Please try again.')

  const entryId = String((data as { id: string }).id)
  try {
    await recordEngagementEvent({
      idempotencyKey: `waitlist_join:${entryId}`,
      source: 'web',
      eventType: 'waitlist.joined',
      actorProfileId: profileId,
      context: { entryId, track },
    })
  } catch {
    /* ledger best-effort */
  }

  revalidatePath('/waitlist')
  revalidatePath('/admin/growth/applications')
  return ok({ position, alreadyJoined: false })
}
