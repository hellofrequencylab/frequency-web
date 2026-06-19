// Server data fetch for the Frequency Signature (docs/JOURNEYS.md §9.2). Tallies a
// member's practice_logs per Pillar (Mind / Body / Spirit / Expression) and hands the
// counts to the pure compute (lib/frequency-signature.ts). Fully derived — no schema:
// it rides the same practice_logs the gamification loop already writes.
//
// Server-only. Reads go through the service-role admin client behind app-code authz,
// matching lib/journey-plans.ts. The join to practices(domain_id) → domains(slug) maps
// each log to its Pillar by the domain SLUG (mind/body/spirit/expression), per the
// channels_domains_taxonomy migration.

import { createAdminClient } from '@/lib/supabase/admin'
import type { SupabaseClient } from '@supabase/supabase-js'
import { getPillars, pillarsById } from '@/lib/pillars'
import {
  computeSignature,
  PILLAR_KEYS,
  WINDOW_DAYS,
  type FrequencySignature,
  type PillarCounts,
  type PillarKey,
  type PillarWindowDays,
} from '@/lib/frequency-signature'

function db(): SupabaseClient {
  return createAdminClient()
}

// Row shape from practice_logs ⨝ practices: we need the practice's domain_id to map the
// log onto a Pillar, plus `logged_for` (the practice DAY) to window recent engagement.
// practice_id is nullable (ON DELETE SET NULL); such logs (and any with a null/unknown
// domain) simply don't contribute to a Pillar.
interface LogJoinRow {
  logged_for: string | null
  practice: { domain_id: string | null } | null
}

/** The window's start day as a YYYY-MM-DD string, inclusive: today minus
 *  {@link WINDOW_DAYS}. The ONLY clock read in the Signature pipeline — kept here in the
 *  server fetch (never in the React render, where react-hooks/purity forbids Date). */
function windowStartDay(): string {
  const start = new Date()
  start.setUTCDate(start.getUTCDate() - WINDOW_DAYS)
  return start.toISOString().slice(0, 10)
}

/** A member's Frequency Signature: their practice spread across the four Pillars,
 *  derived from every practice_log they've recorded. Returns the well-defined empty
 *  signature (`total === 0`) for a member who hasn't logged anything mappable yet. */
export async function getMemberSignature(profileId: string): Promise<FrequencySignature> {
  const client = db()

  // Pillars are tiny + static; we need them to resolve each log's domain_id → slug.
  const [pillars, { data: logRows }] = await Promise.all([
    getPillars(),
    client
      .from('practice_logs')
      .select('logged_for, practice:practices(domain_id)')
      .eq('profile_id', profileId),
  ])

  const byId = pillarsById(pillars) // domain_id → Pillar (has the slug)
  const cutoff = windowStartDay()

  // All-time per-Pillar act counts (the long-lived signature shape + shares), plus the
  // set of DISTINCT recent practice-days per Pillar (the windowed engagement that the
  // bloom grows from and decays toward as days age out of the window). The unique
  // constraint on (profile_id, practice_id, logged_for) already makes a (practice, day)
  // unique, but a Pillar spans several practices, so we de-dupe days per Pillar here.
  const counts: PillarCounts = { mind: 0, body: 0, spirit: 0, expression: 0 }
  const windowDaySets: Record<PillarKey, Set<string>> = {
    mind: new Set(),
    body: new Set(),
    spirit: new Set(),
    expression: new Set(),
  }
  for (const row of (logRows ?? []) as unknown as LogJoinRow[]) {
    const domainId = row.practice?.domain_id
    if (!domainId) continue
    const slug = byId.get(domainId)?.slug as PillarKey | undefined
    if (!slug || !PILLAR_KEYS.includes(slug)) continue
    counts[slug] += 1
    const day = row.logged_for
    if (day && day >= cutoff) windowDaySets[slug].add(day)
  }

  const windowDays: PillarWindowDays = {
    mind: windowDaySets.mind.size,
    body: windowDaySets.body.size,
    spirit: windowDaySets.spirit.size,
    expression: windowDaySets.expression.size,
  }

  return computeSignature(counts, windowDays)
}
