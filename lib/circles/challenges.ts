// Circle challenge adoptions — a circle taking on a global season challenge
// together (collaborative), per migration 20260611000000_circle_challenge_adoptions.
//
// season_challenges are GLOBAL and progress is tracked per-member in
// challenge_progress. A circle "adopting" one only adds the circle framing; this
// module reads the adoptions and folds the existing per-member progress into a
// COLLECTIVE view — "N of M members done" — for the CircleQuest module. It never
// re-implements the challenge engine (lib/achievements.ts owns advancement).
//
// circle_challenge_adoptions lags the generated Database types (fresh migration),
// so this module reads through an untyped admin handle — the repo convention from
// lib/practices.ts / lib/events/circle-current.ts. The capability gate in the caller
// (admin-actions.ts) is the authority for writes either way.

import { createAdminClient } from '@/lib/supabase/admin'
import type { SupabaseClient } from '@supabase/supabase-js'

function db(): SupabaseClient {
  return createAdminClient() as unknown as SupabaseClient
}

/** One adopted challenge with the circle's COLLECTIVE progress on it. */
export interface CircleChallenge {
  id: string // season_challenges.id
  slug: string
  name: string
  description: string | null
  category: string | null
  difficulty: string | null
  target: number
  /** Active circle members who have completed this challenge. */
  membersCompleted: number
  /** Active circle members with some progress but not yet complete. */
  membersInProgress: number
  /** Total active circle members (the denominator). */
  memberCount: number
}

/** A global challenge a circle could adopt (not yet adopted). */
export interface AdoptableChallenge {
  id: string
  slug: string
  name: string
  category: string | null
  difficulty: string | null
  target: number
}

// Meta-challenges that are about completing OTHER challenges or reaching a rank —
// they aren't meaningful as a shared circle goal, so they're hidden from the
// adopt picker (a circle adopts concrete acts, not the completionist meta).
const META_SLUGS = new Set(['complete-all-challenges', 'reach-conduit'])

/** Active member profile ids for a circle. */
async function activeMemberIds(client: SupabaseClient, circleId: string): Promise<string[]> {
  const { data } = await client
    .from('memberships')
    .select('profile_id')
    .eq('circle_id', circleId)
    .eq('status', 'active')
  return [...new Set(((data ?? []) as { profile_id: string }[]).map((m) => m.profile_id))]
}

/**
 * The challenges this circle has adopted, each with collective member progress.
 * Read-only. Returns [] when nothing is adopted (the module shows an empty state).
 */
export async function getCircleChallenges(circleId: string): Promise<CircleChallenge[]> {
  const client = db()

  const { data: adoptionRows } = await client
    .from('circle_challenge_adoptions')
    .select('created_at, challenge:season_challenges(id, slug, name, description, category, difficulty, target)')
    .eq('circle_id', circleId)
    .order('created_at', { ascending: false })

  type Row = {
    challenge: {
      id: string
      slug: string
      name: string
      description: string | null
      category: string | null
      difficulty: string | null
      target: number
    } | null
  }
  const challenges = ((adoptionRows ?? []) as unknown as Row[]).map((r) => r.challenge).filter((c): c is NonNullable<Row['challenge']> => !!c)
  if (challenges.length === 0) return []

  const memberIds = await activeMemberIds(client, circleId)
  const memberCount = memberIds.length

  // One read of every member's progress across all adopted challenges, then fold.
  let progress: { challenge_id: string; profile_id: string; completed_at: string | null }[] = []
  if (memberCount > 0) {
    const { data } = await client
      .from('challenge_progress')
      .select('challenge_id, profile_id, completed_at')
      .in('challenge_id', challenges.map((c) => c.id))
      .in('profile_id', memberIds)
    progress = (data ?? []) as typeof progress
  }

  return challenges.map((c) => {
    const rows = progress.filter((p) => p.challenge_id === c.id)
    const membersCompleted = rows.filter((p) => p.completed_at).length
    const membersInProgress = rows.filter((p) => !p.completed_at).length
    return {
      id: c.id,
      slug: c.slug,
      name: c.name,
      description: c.description,
      category: c.category,
      difficulty: c.difficulty,
      target: c.target,
      membersCompleted,
      membersInProgress,
      memberCount,
    }
  })
}

/**
 * Global challenges this circle could adopt — the active, non-meta season
 * challenges it hasn't already taken on. Read-only; used to populate the host's
 * adopt picker.
 */
export async function listAdoptableChallenges(circleId: string): Promise<AdoptableChallenge[]> {
  const client = db()

  const nowIso = new Date().toISOString()
  const [{ data: allRows }, { data: adoptedRows }] = await Promise.all([
    client
      .from('season_challenges')
      .select('id, slug, name, category, difficulty, target, valid_from, valid_until, sort_order')
      .order('sort_order', { ascending: true }),
    client.from('circle_challenge_adoptions').select('challenge_id').eq('circle_id', circleId),
  ])

  const adopted = new Set(((adoptedRows ?? []) as { challenge_id: string }[]).map((r) => r.challenge_id))

  type Row = {
    id: string
    slug: string
    name: string
    category: string | null
    difficulty: string | null
    target: number
    valid_from: string | null
    valid_until: string | null
  }
  return ((allRows ?? []) as Row[])
    .filter((c) => !adopted.has(c.id))
    .filter((c) => !META_SLUGS.has(c.slug))
    // Respect each challenge's run window (null bounds = always on).
    .filter((c) => !(c.valid_from && c.valid_from > nowIso))
    .filter((c) => !(c.valid_until && c.valid_until < nowIso))
    .map((c) => ({
      id: c.id,
      slug: c.slug,
      name: c.name,
      category: c.category,
      difficulty: c.difficulty,
      target: c.target,
    }))
}
