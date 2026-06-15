'use server'

import type { SupabaseClient } from '@supabase/supabase-js'
import { revalidatePath } from 'next/cache'
import type { Database } from '@/lib/database.types'
import { getCallerProfile } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { awardGems } from '@/lib/gems'
import { type ActionResult, ok, fail } from '@/lib/action-result'
import { getConnectionSettings } from '@/lib/connections/connection-settings'

// The Introductions economy (ADR-186, P3). You introduce two people you're connected
// to; when they become friends, you (the introducer) earn reward_introduction gems —
// once, flag-first (idempotent, same doctrine as the founder/chores rewards). Rewards
// the ACTION of introducing, never people-as-points. The tables are in the generated
// types, so the admin client is fully typed.

type Db = SupabaseClient<Database>

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
// Cap introductions per hour — abuse / graph-probing guard.
const HOURLY_CAP = 20

/** Are these two profiles accepted friends with each other? */
async function acceptedFriends(db: Db, x: string, y: string): Promise<boolean> {
  const { data } = await db
    .from('friendships')
    .select('id')
    .eq('status', 'accepted')
    .or(`and(user_a_id.eq.${x},user_b_id.eq.${y}),and(user_a_id.eq.${y},user_b_id.eq.${x})`)
    .maybeSingle()
  return !!data
}

/** Introduce two people you're connected to. Requires the caller to be accepted
 *  friends with BOTH (you introduce people you actually know). */
export async function createIntroduction(
  personAId: string,
  personBId: string,
  note?: string,
): Promise<ActionResult> {
  const me = await getCallerProfile()
  if (!me) return fail('Sign in to make an introduction.')
  // Validate the ids are real UUIDs before they reach any query (defence in depth —
  // the action can be called directly, not just via the picker).
  if (!UUID_RE.test(personAId) || !UUID_RE.test(personBId)) return fail('Invalid selection.')
  if (personAId === personBId) return fail('Pick two different people.')
  if (personAId === me.id || personBId === me.id) return fail('Introduce two other people.')

  const db = createAdminClient()

  // Rate limit: cap introductions per hour (abuse + friendship-graph probing guard).
  const { count: recent } = await db
    .from('introductions')
    .select('id', { count: 'exact', head: true })
    .eq('introducer_id', me.id)
    .gte('created_at', new Date(Date.now() - 3600_000).toISOString())
  if ((recent ?? 0) >= HOURLY_CAP) return fail('That’s a lot of introductions for one hour. Give it a moment.')

  const [knowA, knowB] = await Promise.all([
    acceptedFriends(db, me.id, personAId),
    acceptedFriends(db, me.id, personBId),
  ])
  if (!knowA || !knowB) return fail('You can only introduce people you’re connected to.')
  if (await acceptedFriends(db, personAId, personBId)) return fail('They already know each other.')

  const { error } = await db.from('introductions').insert({
    introducer_id: me.id,
    person_a_id: personAId,
    person_b_id: personBId,
    note: note?.trim().slice(0, 500) || null,
  })
  // Unique index → you've already introduced this pair.
  if (error) return fail(/duplicate|unique/i.test(error.message) ? 'You’ve already introduced them.' : error.message)
  revalidatePath('/friends')
  return ok()
}

export interface IntroductionRewardResult {
  rewarded: number
  gems: number
}

/** Reconcile the caller's pending introductions: any whose two people are now friends
 *  flips to "connected" and pays the introducer once (flag-first). Safe to call on
 *  every view of the Friends page. */
export async function claimIntroductionRewards(): Promise<IntroductionRewardResult> {
  const empty: IntroductionRewardResult = { rewarded: 0, gems: 0 }
  const me = await getCallerProfile()
  if (!me) return empty

  const db = createAdminClient()
  const { data: pending } = await db
    .from('introductions')
    .select('id, person_a_id, person_b_id')
    .eq('introducer_id', me.id)
    .eq('status', 'pending')
  if (!pending?.length) return empty

  const settings = await getConnectionSettings()
  let rewarded = 0
  let gems = 0

  for (const intro of pending) {
    if (!(await acceptedFriends(db, intro.person_a_id, intro.person_b_id))) continue
    // Stamp the flag FIRST (guarded on rewarded=false) so a double-call can't double-pay.
    const { data: claimed } = await db
      .from('introductions')
      .update({ status: 'connected', connected_at: new Date().toISOString(), rewarded: true })
      .eq('id', intro.id)
      .eq('rewarded', false)
      .select('id')
    if (claimed?.length) {
      const r = await awardGems(me.id, 'achievement', settings.rewardIntroduction, {
        reason: 'introduction',
        introduction: intro.id,
      })
      if (r.awarded) {
        rewarded += 1
        gems += r.amount
      }
    }
  }
  if (rewarded) revalidatePath('/friends')
  return { rewarded, gems }
}

// ── Reads for the introductions inbox ────────────────────────────────────────
export interface IntroPerson {
  id: string
  displayName: string
  handle: string
  avatarUrl: string | null
}
export interface IntroductionMade {
  id: string
  status: 'pending' | 'connected' | 'declined'
  note: string | null
  a: IntroPerson
  b: IntroPerson
}
export interface IntroductionForYou {
  id: string
  note: string | null
  introducer: IntroPerson
  other: IntroPerson
}

async function peopleById(db: Db, ids: string[]): Promise<Map<string, IntroPerson>> {
  const map = new Map<string, IntroPerson>()
  const unique = [...new Set(ids)].filter(Boolean)
  if (unique.length === 0) return map
  const { data } = await db.from('profiles').select('id, display_name, handle, avatar_url').in('id', unique)
  for (const r of data ?? []) {
    map.set(r.id, {
      id: r.id,
      displayName: r.display_name ?? '',
      handle: r.handle ?? '',
      avatarUrl: r.avatar_url ?? null,
    })
  }
  return map
}

/** Introductions the caller MADE (with status) and introductions made FOR the caller. */
export async function listMyIntroductions(): Promise<{
  made: IntroductionMade[]
  forYou: IntroductionForYou[]
}> {
  const me = await getCallerProfile()
  if (!me) return { made: [], forYou: [] }
  const db = createAdminClient()

  const { data: rows } = await db
    .from('introductions')
    .select('id, introducer_id, person_a_id, person_b_id, note, status')
    .or(`introducer_id.eq.${me.id},person_a_id.eq.${me.id},person_b_id.eq.${me.id}`)
    .order('created_at', { ascending: false })
  const list = rows ?? []

  const ids = list.flatMap((r) => [r.introducer_id, r.person_a_id, r.person_b_id])
  const people = await peopleById(db, ids)
  const stub: IntroPerson = { id: '', displayName: 'Someone', handle: '', avatarUrl: null }

  const made: IntroductionMade[] = []
  const forYou: IntroductionForYou[] = []
  for (const r of list) {
    if (r.introducer_id === me.id) {
      made.push({
        id: r.id,
        status: r.status as IntroductionMade['status'],
        note: r.note,
        a: people.get(r.person_a_id) ?? stub,
        b: people.get(r.person_b_id) ?? stub,
      })
    } else {
      const otherId = r.person_a_id === me.id ? r.person_b_id : r.person_a_id
      forYou.push({
        id: r.id,
        note: r.note,
        introducer: people.get(r.introducer_id) ?? stub,
        other: people.get(otherId) ?? stub,
      })
    }
  }
  return { made, forYou }
}
