// Vera auto-curates the splash feed ("People showing up for each other"): she
// reads the recent public posts and features the ~6 that best exemplify neighbors
// genuinely showing up for each other — warm, kind, real — excluding anything
// negative, unsafe, spammy, or off-brand. A janitor can veto any pick (unfeature).
//
// Server-only. Idempotent: a refresh re-features the chosen set and clears any
// stale featured post. Degrades safely: if AI is off / over budget / the call
// fails or returns nothing valid, the current featured set is left untouched so
// the section never wipes itself.

import { createAdminClient } from '@/lib/supabase/admin'
import { completeText } from '../complete'
import { aiAvailable, featureOverBudget, recordAiUsage } from '../usage'

const FEATURE = 'feature-posts'
// How many recent posts Vera reads, and how many she features.
const CANDIDATE_LIMIT = 50
const FEATURE_COUNT = 6
// Cap per-post body length sent to the model so one long post can't blow the prompt.
const MAX_BODY_CHARS = 600

interface Candidate {
  id: string
  body: string
}

export interface RefreshResult {
  /** 'updated' when the featured set changed, 'skipped' when left untouched. */
  status: 'updated' | 'skipped'
  /** Ids now featured (only meaningful when status === 'updated'). */
  featuredIds: string[]
  reason?: string
}

const CURATOR_SYSTEM = `You are Vera, the resident curator for Frequency — a platform for real-world community built on local "circles" and in-person gatherings.

You are choosing which member posts to feature on the public home page, under the heading "People showing up for each other." Pick the posts that best exemplify neighbors genuinely showing up for one another: warm, kind, real, generous, encouraging, or a real moment of connection.

Exclude anything negative, mean, divisive, unsafe, sad without hope, sales-y, spammy, off-topic, or off-brand. Exclude empty or low-effort posts. When in doubt, leave it out — a smaller, warmer set beats a padded one.

You will be given a numbered list of candidate posts, each with an id. Choose up to ${FEATURE_COUNT} that best fit. Respond with ONLY a JSON array of the chosen ids, most exemplary first, like ["id1","id2"]. No prose, no code fences. If none fit, respond with [].`

/** Build the user message listing candidates. Pure — easy to reason about. */
function buildCandidateList(candidates: Candidate[]): string {
  const lines = candidates
    .map((c, i) => `${i + 1}. id=${c.id}\n${c.body.slice(0, MAX_BODY_CHARS)}`)
    .join('\n\n')
  return `Candidate posts:\n\n${lines}\n\n---\nChoose up to ${FEATURE_COUNT} ids. Respond with ONLY a JSON array of ids.`
}

/** Parse the model's reply into ids that exist in the candidate set. Tolerant of
 *  stray prose / code fences; returns only valid, deduped ids (capped). Pure. */
export function parseChosenIds(text: string, validIds: Set<string>): string[] {
  const match = text.match(/\[[\s\S]*\]/)
  if (!match) return []
  let parsed: unknown
  try {
    parsed = JSON.parse(match[0])
  } catch {
    return []
  }
  if (!Array.isArray(parsed)) return []
  const out: string[] = []
  const seen = new Set<string>()
  for (const v of parsed) {
    const id = typeof v === 'string' ? v.trim() : ''
    if (id && validIds.has(id) && !seen.has(id)) {
      seen.add(id)
      out.push(id)
      if (out.length >= FEATURE_COUNT) break
    }
  }
  return out
}

/**
 * Re-curate the featured splash posts with one batched LLM call.
 *
 * Reads the last ~50 public, top-level, non-hidden, non-empty posts via the
 * admin client; scores them with Vera; sets `featured_at = now()` on the chosen
 * ids and clears it on any currently-featured post not re-chosen. Never throws —
 * returns a result describing what happened. On any failure or empty result the
 * current featured set is left exactly as-is.
 */
export async function refreshFeaturedPosts(): Promise<RefreshResult> {
  // Budget + kill switch. Fail closed: leave the section untouched.
  if (!(await aiAvailable()) || (await featureOverBudget(FEATURE))) {
    return { status: 'skipped', featuredIds: [], reason: 'ai-unavailable-or-over-budget' }
  }

  const admin = createAdminClient()

  // Pull recent candidates.
  let candidates: Candidate[] = []
  try {
    const { data, error } = await admin
      .from('posts')
      .select('id, body')
      .eq('visibility', 'public')
      .is('parent_id', null)
      .is('hidden_at', null)
      .not('body', 'is', null)
      .order('created_at', { ascending: false })
      .limit(CANDIDATE_LIMIT)
    if (error) throw error
    candidates = ((data ?? []) as { id: string; body: string | null }[])
      .map((r) => ({ id: r.id, body: (r.body ?? '').trim() }))
      .filter((c) => c.body.length > 0)
  } catch {
    return { status: 'skipped', featuredIds: [], reason: 'candidate-fetch-failed' }
  }

  if (candidates.length === 0) {
    return { status: 'skipped', featuredIds: [], reason: 'no-candidates' }
  }

  // Score in one batched call.
  let chosen: string[] = []
  try {
    const validIds = new Set(candidates.map((c) => c.id))
    const res = await completeText({
      system: CURATOR_SYSTEM,
      messages: [{ role: 'user', content: buildCandidateList(candidates) }],
      tier: 'haiku',
      maxTokens: 256,
      cacheSystem: true,
    })
    void recordAiUsage({ feature: FEATURE, model: res.tier, usage: res.usage, costUsd: res.costUsd })
    chosen = parseChosenIds(res.text, validIds)
  } catch {
    return { status: 'skipped', featuredIds: [], reason: 'scoring-failed' }
  }

  // Nothing valid chosen — never wipe the current set.
  if (chosen.length === 0) {
    return { status: 'skipped', featuredIds: [], reason: 'no-valid-picks' }
  }

  // Apply idempotently: feature the chosen, clear any stale featured post.
  try {
    const now = new Date().toISOString()
    const { error: featErr } = await admin
      .from('posts')
      .update({ featured_at: now })
      .in('id', chosen)
    if (featErr) throw featErr

    // Clear featured_at on anything currently featured that wasn't re-chosen.
    const { data: current } = await admin
      .from('posts')
      .select('id')
      .not('featured_at', 'is', null)
    const stale = ((current ?? []) as { id: string }[])
      .map((r) => r.id)
      .filter((id) => !chosen.includes(id))
    if (stale.length > 0) {
      await admin.from('posts').update({ featured_at: null }).in('id', stale)
    }
  } catch {
    return { status: 'skipped', featuredIds: [], reason: 'apply-failed' }
  }

  return { status: 'updated', featuredIds: chosen }
}

/** Janitor veto: drop one post from the featured set. Never throws. */
export async function unfeaturePost(postId: string): Promise<boolean> {
  if (!postId) return false
  try {
    const admin = createAdminClient()
    const { error } = await admin.from('posts').update({ featured_at: null }).eq('id', postId)
    return !error
  } catch {
    return false
  }
}
