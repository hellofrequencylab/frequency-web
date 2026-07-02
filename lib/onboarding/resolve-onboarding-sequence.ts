import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createAdminClient } from '@/lib/supabase/admin'
import { getRootSpaceId } from '@/lib/library/store'
import { parseSequenceDef, type SequenceDef, type SequenceTarget } from './sequence-schema'
import { DEFAULT_ONBOARDING_SEQUENCE } from './default-sequence'

// Resolve which onboarding flow a viewer runs. Loads PUBLISHED kind='sequence' Loom assets across
// the viewer's space UNIONED with the ROOT space (lib/library/scope.ts: space ∪ root), keeps the
// MOST-SPECIFIC target match, and FAILS SAFE to the code default (lib/onboarding/default-sequence.ts)
// whenever nothing resolves — the exact publish-gate + fail-safe discipline as page_settings
// (lib/page-settings/store.ts) and the beta copy-layer (lib/onboarding/resolve-sequence.ts).
//
// ADDITIVE ONLY: this is the machinery. The live /onboarding route still renders OnboardingForm;
// wiring the SequenceRunner to this resolver is a separate, verified cutover.

/** The axes the resolver targets on. Filled by the server seam that knows the arriving member. */
export interface OnboardingViewer {
  /** The active space, if any (else the flow resolves against the root only). */
  spaceId?: string | null
  /** The self-identified persona (lib/onboarding/personas.ts). */
  persona?: string | null
  /** The chosen region (nexus_region_id). */
  regionId?: string | null
}

// A Loom asset counts as LIVE once it reaches the operator-published rungs of the brand-build
// ladder (draft → in_review → approved → final). Draft / in_review rows never serve live, so an
// unfinished managed sequence falls through to the default, exactly like a draft splash funnel.
const LIVE_STATUSES = new Set(['approved', 'final'])

/** Every named target axis must include the viewer's value; an absent axis is a wildcard. */
function targetMatches(target: SequenceTarget | undefined, viewer: OnboardingViewer): boolean {
  if (!target) return true
  if (target.personas?.length && !(viewer.persona && target.personas.includes(viewer.persona))) return false
  if (target.regionIds?.length && !(viewer.regionId && target.regionIds.includes(viewer.regionId))) return false
  return true
}

/** How specific a match is — a space-scoped row beats the root; a narrower target beats a wider one. */
function specificity(def: SequenceDef, rowSpaceId: string, viewerSpaceId: string | null): number {
  let score = 0
  if (viewerSpaceId && rowSpaceId === viewerSpaceId) score += 100
  if (def.target?.personas?.length) score += 10
  if (def.target?.regionIds?.length) score += 1
  return score
}

export async function resolveOnboardingSequence(viewer: OnboardingViewer): Promise<SequenceDef> {
  try {
    const rootId = await getRootSpaceId()
    const spaceIds = Array.from(new Set([viewer.spaceId, rootId].filter((x): x is string => !!x)))
    if (spaceIds.length === 0) return DEFAULT_ONBOARDING_SEQUENCE

    // eslint-disable-next-line no-restricted-syntax -- library_assets isn't in lib/database.types.ts yet (matches lib/library/store.ts); genuinely untyped table access
    const db = createAdminClient() as unknown as SupabaseClient
    const { data, error } = await db
      .from('library_assets')
      .select('space_id, config, status')
      .eq('kind', 'sequence')
      .in('space_id', spaceIds)
    if (error || !data) return DEFAULT_ONBOARDING_SEQUENCE

    // The viewer's own (non-root) space, for the space-beats-root tiebreak.
    const viewerSpaceId = viewer.spaceId && viewer.spaceId !== rootId ? viewer.spaceId : null

    let best: { def: SequenceDef; score: number } | null = null
    for (const row of data as Array<{ space_id: string; config: unknown; status: string }>) {
      if (!LIVE_STATUSES.has(row.status)) continue
      const def = parseSequenceDef(row.config)
      if (!def || !targetMatches(def.target, viewer)) continue
      const score = specificity(def, row.space_id, viewerSpaceId)
      if (!best || score > best.score) best = { def, score }
    }

    return best?.def ?? DEFAULT_ONBOARDING_SEQUENCE
  } catch {
    return DEFAULT_ONBOARDING_SEQUENCE
  }
}
