// Vera's per-member memory (AI-VERA.md §5, ADR-066): a small, useful record of
// who a member is — stated interests/goals/neighborhood + derived milestones + a
// rolling summary. NOT raw transcripts. Member-viewable + erasable; the AI core
// writes via the service role. ai_member_context isn't in database.types yet, so
// we cast (repo convention) rather than regenerate the generated file.

import type { SupabaseClient } from '@supabase/supabase-js'
import { createAdminClient } from '@/lib/supabase/admin'

export interface MemberFacts {
  interests?: string[]
  goals?: string[]
  neighborhood?: string | null
  constraints?: string[]
}

export interface MemberContext {
  summary: string | null
  facts: MemberFacts
  milestones: Record<string, unknown>
  interactionCount: number
}

/** A member's memory plus the markers the summarization batch needs to decide
 *  whether it's due for compression (the live interaction counter vs. the snapshot
 *  taken at the last summarize, and when that was). */
export interface MemberContextForSummary extends MemberContext {
  profileId: string
  lastSummarizedAt: string | null
  /** interaction_count at the last summarize, stored in milestones (see writeDigest). */
  summarizedAtInteractionCount: number | null
}

/** milestones key under which we stash the interaction_count at last summarize.
 *  Kept inside the existing milestones jsonb so no new column is needed. */
const SUMMARIZED_AT_COUNT_KEY = 'summarizedAtInteractionCount'

const ARRAY_KEYS = ['interests', 'goals', 'constraints'] as const
const MAX_PER_LIST = 25

/** Pure: merge newly-learned facts into existing. List fields union
 *  (trimmed, case-insensitive de-dupe, first casing wins, capped); `neighborhood`
 *  overwrites only when explicitly provided. Unit-tested. */
export function mergeFacts(existing: MemberFacts, incoming: Partial<MemberFacts>): MemberFacts {
  const out: MemberFacts = { ...existing }
  for (const key of ARRAY_KEYS) {
    const add = incoming[key]
    if (!add || add.length === 0) continue
    const seen = new Map<string, string>()
    for (const v of [...(existing[key] ?? []), ...add]) {
      const t = (v ?? '').trim()
      if (!t) continue
      const k = t.toLowerCase()
      if (!seen.has(k)) seen.set(k, t)
    }
    out[key] = [...seen.values()].slice(0, MAX_PER_LIST)
  }
  if (incoming.neighborhood !== undefined) out.neighborhood = incoming.neighborhood
  return out
}

function db(): SupabaseClient {
  return createAdminClient()
}

/** Read a member's context (service role). Null if none yet. Never throws. */
export async function getMemberContext(profileId: string): Promise<MemberContext | null> {
  try {
    const { data } = await db()
      .from('ai_member_context')
      .select('summary, facts, milestones, interaction_count')
      .eq('profile_id', profileId)
      .maybeSingle()
    if (!data) return null
    const d = data as { summary: string | null; facts: MemberFacts; milestones: Record<string, unknown>; interaction_count: number }
    return {
      summary: d.summary,
      facts: d.facts ?? {},
      milestones: d.milestones ?? {},
      interactionCount: d.interaction_count ?? 0,
    }
  } catch {
    return null
  }
}

/** Merge newly-learned facts into the member's memory (backs the remember_fact
 *  tool). Read-merge-upsert; bumps interaction_count. Best-effort. */
export async function rememberFacts(profileId: string, incoming: Partial<MemberFacts>): Promise<void> {
  try {
    const current = await getMemberContext(profileId)
    const facts = mergeFacts(current?.facts ?? {}, incoming)
    await db()
      .from('ai_member_context')
      .upsert(
        {
          profile_id: profileId,
          facts,
          interaction_count: (current?.interactionCount ?? 0) + 1,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'profile_id' },
      )
  } catch {
    /* best-effort; never break the caller */
  }
}

// ── Summarization batch support (build-list P6 §2.3) ───────────────────────────

interface ContextRow {
  profile_id: string
  summary: string | null
  facts: MemberFacts
  milestones: Record<string, unknown>
  interaction_count: number
  last_summarized_at: string | null
}

function rowToSummaryContext(row: ContextRow): MemberContextForSummary {
  const milestones = row.milestones ?? {}
  const stamped = (milestones as Record<string, unknown>)[SUMMARIZED_AT_COUNT_KEY]
  return {
    profileId: row.profile_id,
    summary: row.summary,
    facts: row.facts ?? {},
    milestones,
    interactionCount: row.interaction_count ?? 0,
    lastSummarizedAt: row.last_summarized_at,
    summarizedAtInteractionCount: typeof stamped === 'number' ? stamped : null,
  }
}

/**
 * Claim a bounded batch of members whose memory MAY be due for compression
 * (service role). Coarse DB-side ordering: never-summarized rows and the
 * stalest-summarized rows first, so a small daily batch eventually sweeps
 * everyone. The precise "needs compression?" decision is the pure selection
 * logic in memory-summary.ts, applied per-row by the cron. Never throws.
 */
export async function claimMembersDueForSummary(limit: number): Promise<MemberContextForSummary[]> {
  try {
    const { data } = await db()
      .from('ai_member_context')
      .select('profile_id, summary, facts, milestones, interaction_count, last_summarized_at')
      // Oldest summarize first; NULLs (never summarized) sort first by default.
      .order('last_summarized_at', { ascending: true, nullsFirst: true })
      .limit(limit)
    return ((data ?? []) as ContextRow[]).map(rowToSummaryContext)
  } catch {
    return []
  }
}

/**
 * Persist a compressed digest back to the member's memory via the SAME store the
 * facts live in (never a side table). Overwrites summary + facts with the digest,
 * stamps last_summarized_at = now, and snapshots interaction_count into milestones
 * so drift since this summarize can be measured next run. Does NOT touch
 * interaction_count itself (that's the live counter rememberFacts bumps).
 * Best-effort — a failed write must never abort the batch.
 */
export async function writeDigest(
  profileId: string,
  digest: { summary: string; facts: MemberFacts },
  opts: { interactionCount: number; milestones?: Record<string, unknown>; now?: Date } = { interactionCount: 0 },
): Promise<void> {
  try {
    const now = opts.now ?? new Date()
    const milestones = {
      ...(opts.milestones ?? {}),
      [SUMMARIZED_AT_COUNT_KEY]: opts.interactionCount,
    }
    await db()
      .from('ai_member_context')
      .update({
        summary: digest.summary || null,
        facts: digest.facts,
        milestones,
        last_summarized_at: now.toISOString(),
        updated_at: now.toISOString(),
      })
      .eq('profile_id', profileId)
  } catch {
    /* best-effort; never break the batch */
  }
}
