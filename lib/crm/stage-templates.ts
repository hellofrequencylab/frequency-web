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

// ── The PLATFORM pipeline (the global /admin/crm/pipeline board) ────────────────────────────────────
// This is NOT a per-Space Mode preset. It is the ONE operator pipeline for the platform team's own
// growth motion: upselling members onto a Business Space, and turning members into donors. Two lanes
// share ONE funnel of columns; a deal's LANE is carried by `crm_deals.source` (a PipelineLane below),
// never by the stage, so the board can filter by lane without needing a per-lane column set. Column
// labels are plain operator words that read the same for both motions (identify -> reach out -> warm ->
// convert / pass), per CONTENT-VOICE (no em/en dashes, plain verbs).
//
// SEAM (documented, not built): giving each lane its OWN distinct columns (Business: Identified ->
// Nudged -> Trialing -> Upgraded/Passed · Donation: Prospect -> Asked -> First gift -> Recurring/
// Declined) needs a `lane` axis on crm_stages so the board can show a different column set per lane.
// Until crm_stages carries a lane, the two motions share this one funnel and are told apart by source.

/** A pipeline LANE: the growth motion a deal belongs to. Persisted in `crm_deals.source`, so a deal is
 *  pre-tagged to its lane at creation and the board filters by it. Two lanes today; a third is one row. */
export type PipelineLane = 'upsell_business' | 'donation'

/** One lane's operator-facing framing: its persisted source id, a plain label for the filter/chip, and
 *  the create call to action that pre-tags a new deal into the lane (CONTENT-VOICE: a plain verb). */
export interface PipelineLaneMeta {
  id: PipelineLane
  /** The plain label shown on the lane filter and the deal's lane chip. */
  label: string
  /** The create CTA that starts a deal already tagged to this lane. */
  cta: string
  /** A one-line, skeptic-plain blurb for the lane (no narrated feelings, no hype). */
  blurb: string
}

/** The registered lanes, in board order. Adding a lane is one row here (plus, later, its own columns
 *  once crm_stages carries a lane axis). */
export const PIPELINE_LANES: readonly PipelineLaneMeta[] = [
  {
    id: 'upsell_business',
    label: 'Business upsell',
    cta: 'Start an upsell',
    blurb: 'Members worth a nudge onto a Business Space.',
  },
  {
    id: 'donation',
    label: 'Donations',
    cta: 'Log a donation ask',
    blurb: 'Members you are asking to give, and the donors they become.',
  },
] as const

/** Is `value` one of the registered pipeline lanes? (A deal whose `source` is anything else is untagged
 *  and shows only under the "All" lane view.) */
export function isPipelineLane(value: unknown): value is PipelineLane {
  return typeof value === 'string' && PIPELINE_LANES.some((l) => l.id === value)
}

/** The lane meta for a source value, or null when the source is not a registered lane. */
export function laneMeta(source: string | null | undefined): PipelineLaneMeta | null {
  return PIPELINE_LANES.find((l) => l.id === source) ?? null
}

// The PLATFORM funnel: one shared set of columns both lanes move through. Kept short and plain so a
// card reads the same whether it is a Business upsell or a donation ask.
const PLATFORM: readonly StageTemplate[] = [
  { name: 'Identified', kind: 'open' }, // spotted a member worth the ask
  { name: 'Reached out', kind: 'open' }, // nudged them / made the ask
  { name: 'Warming up', kind: 'open' }, // trialing Business / gave a first gift
  { name: 'Converted', kind: 'won' }, // upgraded to Business / giving on a rhythm
  { name: 'Passed', kind: 'lost' }, // not now
] as const

/** The PLATFORM pipeline's starting columns (a fresh array each call, so a caller may number/mutate it).
 *  Seeded once for the platform's own Space; both lanes share these columns. */
export function platformPipelineStages(): StageTemplate[] {
  return PLATFORM.map((s) => ({ ...s }))
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
