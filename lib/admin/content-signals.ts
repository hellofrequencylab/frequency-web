// Performance reads for the admin content suite (ADR-211): which member-created
// Journeys, Practices, and season Challenges are actually working, plus the
// staff "feature" writes. These power /admin/content and Vera's creator tips
// (lib/ai/creator-tips.ts), so curation and the AI analysis read the SAME
// numbers — one source of signal.
//
// Server-only. The journey_plan*/practices tables are ahead of the generated
// Database types, so this module reads through an untyped admin handle (repo
// convention — see lib/practices.ts). The ranking math is pure and exported
// for unit tests.

import { createAdminClient } from '@/lib/supabase/admin'
import type { SupabaseClient } from '@supabase/supabase-js'

function db(): SupabaseClient {
  return createAdminClient()
}

// --- Pure ranking math (unit-tested in content-signals.test.ts) ------------

/** Performance score for a Journey. Adoption is the strongest signal (someone
 *  committed to the whole plan), forks show remix value, active adoptions show
 *  staying power (adopters who are still on it). Mirrors the practices_ranked
 *  weighting philosophy: recent/committed engagement outweighs raw totals. */
export function journeyScore(j: {
  adopt_count: number
  forked_count: number
  active_adoptions: number
}): number {
  return j.adopt_count * 3 + j.forked_count * 2 + j.active_adoptions
}

/** Completion percent (0-100), safe for zero starters. */
export function completionRate(completed: number, started: number): number {
  if (started <= 0) return 0
  return Math.round((completed / started) * 100)
}

// --- Journeys ---------------------------------------------------------------

export interface RankedJourney {
  id: string
  slug: string
  title: string
  emoji: string | null
  author_id: string | null
  visibility: string
  status: 'draft' | 'pending' | 'approved' | 'rejected'
  official: boolean
  quest_id: string | null
  adopt_count: number
  forked_count: number
  featured_at: string | null
  created_at: string
  /** Adoptions still active — the completion-ish proxy (no per-plan completion table). */
  active_adoptions: number
  score: number
  author: { display_name: string | null; handle: string | null } | null
}

/** All public + pending Journeys with their performance signal, best first.
 *  Drafts stay out (nothing to curate yet); rejected plans are included so the
 *  admin can see and reverse a rejection. */
export async function rankedJourneys(): Promise<RankedJourney[]> {
  const client = db()
  const [{ data: planRows }, { data: adoptionRows }] = await Promise.all([
    client
      .from('journey_plans')
      .select(
        'id, slug, title, emoji, author_id, visibility, status, official, quest_id, ' +
          'adopt_count, forked_count, featured_at, created_at, author:profiles(display_name, handle)',
      )
      .or('visibility.eq.public,status.eq.pending')
      .neq('status', 'draft')
      .limit(300),
    client.from('journey_plan_adoptions').select('plan_id').eq('active', true),
  ])

  const activeByPlan = new Map<string, number>()
  for (const r of (adoptionRows ?? []) as { plan_id: string }[]) {
    activeByPlan.set(r.plan_id, (activeByPlan.get(r.plan_id) ?? 0) + 1)
  }

  type Row = Omit<RankedJourney, 'active_adoptions' | 'score' | 'author'> & {
    author: { display_name: string | null; handle: string | null }[] | { display_name: string | null; handle: string | null } | null
  }
  return ((planRows ?? []) as unknown as Row[])
    .map((p) => {
      const active_adoptions = activeByPlan.get(p.id) ?? 0
      const author = Array.isArray(p.author) ? p.author[0] ?? null : p.author
      return {
        ...p,
        author,
        active_adoptions,
        score: journeyScore({ ...p, active_adoptions }),
      }
    })
    .sort((a, b) => b.score - a.score || (a.created_at < b.created_at ? 1 : -1))
}

// --- Practices ---------------------------------------------------------------

export interface RankedPracticeSignal {
  id: string
  title: string
  created_by: string | null
  is_public: boolean
  is_template: boolean
  status: string | null
  domain_id: string | null
  /** Payout tier ('light' | 'standard' | 'heavy'); the column is NOT NULL DEFAULT
   *  'standard', so this is effectively always set. */
  weight_class: string | null
  created_at: string
  adopters: number
  logs_30d: number
  logs_total: number
  score: number
  featured_at: string | null
  creator: { display_name: string | null; handle: string | null } | null
}

/** The practice library with its popularity signal (practices_ranked view),
 *  best first, enriched with featured_at (the view's columns are frozen and
 *  predate it) and the creator profile. Includes non-public rows so pending
 *  proposals surface for review. */
export async function rankedPractices(limit = 200): Promise<RankedPracticeSignal[]> {
  const client = db()
  const { data: rows } = await client
    .from('practices_ranked')
    .select('id, title, created_by, is_public, is_template, status, domain_id, weight_class, created_at, adopters, logs_30d, logs_total, score')
    .order('score', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(limit)
  const base = (rows ?? []) as Omit<RankedPracticeSignal, 'featured_at' | 'creator'>[]
  if (base.length === 0) return []

  const ids = base.map((p) => p.id)
  const creatorIds = [...new Set(base.map((p) => p.created_by).filter((c): c is string => !!c))]
  const [{ data: featRows }, { data: creatorRows }] = await Promise.all([
    client.from('practices').select('id, featured_at').in('id', ids),
    creatorIds.length
      ? client.from('profiles').select('id, display_name, handle').in('id', creatorIds)
      : Promise.resolve({ data: [] as { id: string; display_name: string | null; handle: string | null }[] }),
  ])
  const featured = new Map(
    ((featRows ?? []) as { id: string; featured_at: string | null }[]).map((r) => [r.id, r.featured_at]),
  )
  const creators = new Map(
    ((creatorRows ?? []) as { id: string; display_name: string | null; handle: string | null }[]).map((r) => [
      r.id,
      { display_name: r.display_name, handle: r.handle },
    ]),
  )
  return base.map((p) => ({
    ...p,
    featured_at: featured.get(p.id) ?? null,
    creator: p.created_by ? creators.get(p.created_by) ?? null : null,
  }))
}

// --- Challenges ---------------------------------------------------------------

export interface ChallengeCompletion {
  challenge_id: string
  started: number
  completed: number
  /** completed / started, 0-100. */
  rate: number
}

/** Per-challenge progress: how many members started it and how many finished. */
export async function challengeCompletionRates(): Promise<Map<string, ChallengeCompletion>> {
  const { data } = await db().from('challenge_progress').select('challenge_id, completed_at')
  const out = new Map<string, ChallengeCompletion>()
  for (const r of (data ?? []) as { challenge_id: string; completed_at: string | null }[]) {
    const c = out.get(r.challenge_id) ?? { challenge_id: r.challenge_id, started: 0, completed: 0, rate: 0 }
    c.started += 1
    if (r.completed_at) c.completed += 1
    out.set(r.challenge_id, c)
  }
  for (const c of out.values()) c.rate = completionRate(c.completed, c.started)
  return out
}

// --- Feature writes ------------------------------------------------------------

/** Set or clear a Journey's featured mark. Caller enforces authz. */
export async function setJourneyFeatured(id: string, featured: boolean): Promise<void> {
  const { error } = await db()
    .from('journey_plans')
    .update({ featured_at: featured ? new Date().toISOString() : null })
    .eq('id', id)
  if (error) throw new Error(error.message)
}

/** Set or clear a Practice's featured mark. Caller enforces authz. */
export async function setPracticeFeatured(id: string, featured: boolean): Promise<void> {
  const { error } = await db()
    .from('practices')
    .update({ featured_at: featured ? new Date().toISOString() : null })
    .eq('id', id)
  if (error) throw new Error(error.message)
}

/** Set a Practice's library review status. Caller enforces authz. */
export async function setPracticeStatus(
  id: string,
  status: 'draft' | 'pending' | 'approved' | 'rejected',
): Promise<void> {
  const { error } = await db().from('practices').update({ status }).eq('id', id)
  if (error) throw new Error(error.message)
}
