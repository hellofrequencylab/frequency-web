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
  type FrequencySignature,
  type PillarCounts,
  type PillarKey,
} from '@/lib/frequency-signature'

function db(): SupabaseClient {
  return createAdminClient() as unknown as SupabaseClient
}

// Row shape from practice_logs ⨝ practices: we only need the practice's domain_id to
// map the log onto a Pillar. practice_id is nullable (ON DELETE SET NULL); such logs
// (and any with a null/unknown domain) simply don't contribute to a Pillar.
interface LogJoinRow {
  practice: { domain_id: string | null } | null
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
      .select('practice:practices(domain_id)')
      .eq('profile_id', profileId),
  ])

  const byId = pillarsById(pillars) // domain_id → Pillar (has the slug)

  const counts: PillarCounts = { mind: 0, body: 0, spirit: 0, expression: 0 }
  for (const row of (logRows ?? []) as unknown as LogJoinRow[]) {
    const domainId = row.practice?.domain_id
    if (!domainId) continue
    const slug = byId.get(domainId)?.slug as PillarKey | undefined
    if (slug && PILLAR_KEYS.includes(slug)) counts[slug] += 1
  }

  return computeSignature(counts)
}
