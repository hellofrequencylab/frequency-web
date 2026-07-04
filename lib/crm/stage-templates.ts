// CRM STARTING-PIPELINE SEED (CRM-STRATEGY §7, P3 · unified with Space Modes by ADR-517 Phase F E1). One
// CRM model, many shapes: the same crm_stages primitive, seeded with a DIFFERENT starting pipeline per
// Space. The seed now comes from the resolved MODE PRESET's `pipeline` (lib/spaces/modes.ts) — the SAME
// set the "Suggested pipeline" preview shows on the Mode settings surface — so the preview and the actual
// seed can never disagree. A Space with no Mode preset (root / unknown type) falls back to a GENERIC
// funnel so every Space still gets a working board.
//
// SHAPE: PURE (no Supabase / Next imports; resolveMode is itself pure), so seedStagesForSpace is trivially
// unit-testable. The IO seam that actually writes crm_stages for a Space (ensureSpaceStages) lives in
// lib/crm/pipeline.ts, which imports this. Stage labels are operator-facing pipeline columns, plain and
// per CONTENT-VOICE (no em/en dashes).

import type { SpaceType } from '@/lib/spaces/types'
import type { StageKind } from './pipeline'
import { resolveMode } from '@/lib/spaces/modes'

/** One seed stage in a template: a label + its kind (open / won / lost), which drives the deal status +
 *  the column tone. The first 'open' stage is where a graduated contact's deal lands. Order is the array
 *  index (callers number it). */
export interface StageTemplate {
  name: string
  kind: StageKind
}

// The GENERIC fallback for a Space with NO Mode preset (root / unknown / null): a plain, sensible
// open -> won/lost funnel so every Space gets a working board.
const GENERIC: readonly StageTemplate[] = [
  { name: 'New', kind: 'open' },
  { name: 'Active', kind: 'open' },
  { name: 'Won', kind: 'won' },
  { name: 'Lost', kind: 'lost' },
] as const

/** The generic fallback pipeline (a fresh array each call, so a caller may number/mutate it). */
export function genericStages(): StageTemplate[] {
  return GENERIC.map((s) => ({ ...s }))
}

/**
 * The starting pipeline to SEED for a Space, resolved from its Mode preset. PURE + total: it resolves the
 * ModeProfile for `(type, variant)` (lib/spaces/modes.ts resolveMode) and returns that preset's `pipeline`
 * — the EXACT set the Mode settings "Suggested pipeline" preview renders — so the preview and the seed
 * agree. A type/variant with no registered Mode (root / unknown) falls back to the GENERIC funnel. The
 * returned array is fresh each call (callers number it), with sort order = array index.
 */
export function seedStagesForSpace(
  type: SpaceType | null | undefined,
  variant?: string | null,
): StageTemplate[] {
  const mode = resolveMode(type ?? null, variant ?? null)
  const stages = mode?.pipeline ?? GENERIC
  return stages.map((s) => ({ name: s.name, kind: s.kind }))
}
