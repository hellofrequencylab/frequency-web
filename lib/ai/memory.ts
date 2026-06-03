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
  return createAdminClient() as unknown as SupabaseClient
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

/** Erase a member's memory entirely (the member's right; also callable by the AI
 *  core). Member-initiated erase also works via RLS on the user client. */
export async function eraseMemberContext(profileId: string): Promise<void> {
  try {
    await db().from('ai_member_context').delete().eq('profile_id', profileId)
  } catch {
    /* best-effort */
  }
}
