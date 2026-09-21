// SPACE PLANS, the pure half (ADR-1386). A Plan is the working record behind one or more
// Pencils and Productions. No React, no Supabase.

export const PLAN_STAGES = ['pencil', 'plan', 'production'] as const
export type PlanStage = (typeof PLAN_STAGES)[number]

export const PLAN_TARGETS = ['event', 'journey', 'program', 'maintenance'] as const
export type PlanTargetKind = (typeof PLAN_TARGETS)[number]

export interface PlanLink {
  url: string
  label: string
}

export interface SpacePlan {
  id: string
  spaceId: string
  title: string
  stage: PlanStage
  notes: string | null
  links: PlanLink[]
  targetKind: PlanTargetKind
  playbookId: string | null
  ownerProfileId: string | null
  createdBy: string | null
  archivedAt: string | null
  createdAt: string
  updatedAt: string
}

export const PLAN_COLS =
  'id, space_id, title, stage, notes, links, target_kind, playbook_id, owner_profile_id, created_by, archived_at, created_at, updated_at'

export interface PlanInput {
  title: string
  notes?: string | null
  links?: PlanLink[] | null
  stage?: string | null
  targetKind?: string | null
  playbookId?: string | null
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const MAX_TITLE = 200
const MAX_NOTES = 20_000
/** The most links one Plan keeps. Exported because the drawer control must stop offering Add at
 *  the same number the parser caps at: a row typed past the cap is dropped on save with nothing said. */
export const PLAN_LINKS_MAX = 20

export function planStage(value: string | null | undefined): PlanStage | null {
  return PLAN_STAGES.includes(value as PlanStage) ? (value as PlanStage) : null
}

/** HOW A PLAN STAGE READS, declared once. Before this the same three stages were spelled out as a
 *  ternary in four places (the Plan drawer's Stage select, the Plan board's columns, the Studio
 *  manifest's options, the drawer's own summary row) and they disagreed: `plan` read "Plan" in
 *  three of them and "Planning" in the fourth. docs/NAMING.md §Calendar rules the stage words are
 *  Pencil, Planning, Production, so the registry carries those and every surface reads them here.
 *
 *  A PLAN STAGE IS NOT AN ENTRY STAGE. `ENTRY_STAGES` walks one date and carries a fourth value,
 *  Cancelled, which is an exit rather than a step. PLAN_STAGES walks the whole working record and
 *  has no exit at all: a Plan leaves through `archived_at`, never through its stage. It is also
 *  DERIVED where the dates can say it (`derivePlanStage`), so the stepper is the operator's
 *  override of that derivation, and no step is ever refused. The hints below therefore describe a
 *  record that holds MANY dates, which is why they are not the entry copy. */
export interface PlanStageDef {
  stage: PlanStage
  /** The stage name staff see (docs/NAMING.md). */
  label: string
  /** One plain line under the stage stepper saying what the stage means for a whole Plan. */
  hint: string
}

export const PLAN_STAGE_DEFS: readonly PlanStageDef[] = [
  {
    stage: 'pencil',
    label: 'Pencil',
    hint: 'Every date on this Plan is still being held. Nothing is decided yet.',
  },
  {
    stage: 'plan',
    label: 'Planning',
    hint: 'The dates are decided and the team is putting this together.',
  },
  {
    stage: 'production',
    label: 'Production',
    hint: 'Ready to run. Open the production Studio when you want people to see it.',
  },
] as const

/** Total: an unknown or missing stage reads as the one `parsePlanInput` and `mapPlanRow` default to. */
export function planStageDef(value: string | null | undefined): PlanStageDef {
  return PLAN_STAGE_DEFS.find((d) => d.stage === value) ?? PLAN_STAGE_DEFS[1]
}

export function planTarget(value: string | null | undefined): PlanTargetKind | null {
  return PLAN_TARGETS.includes(value as PlanTargetKind) ? (value as PlanTargetKind) : null
}

export function parsePlanLinks(raw: unknown): PlanLink[] {
  if (!Array.isArray(raw)) return []
  const out: PlanLink[] = []
  for (const item of raw.slice(0, PLAN_LINKS_MAX)) {
    if (!item || typeof item !== 'object') continue
    const rec = item as Record<string, unknown>
    const url = typeof rec.url === 'string' ? rec.url.trim() : ''
    if (!/^https?:\/\//i.test(url) || url.length > 2000) continue
    const label = typeof rec.label === 'string' ? rec.label.trim().slice(0, 80) : ''
    out.push({ url, label: label || url })
  }
  return out
}

/** Derive the Plan stage from the dates and events it already holds. A someday Plan stays `plan`. */
export function derivePlanStage(opts: {
  entryStages: readonly (string | null | undefined)[]
  hasProductionEvent: boolean
}): PlanStage {
  if (opts.hasProductionEvent) return 'production'
  const stages = opts.entryStages.map((s) => s ?? '')
  if (stages.length === 0) return 'plan'
  if (stages.every((s) => s === 'pencil' || s === '')) return 'pencil'
  return 'plan'
}

/** THE GATE ON THE PUBLISH SEAM'S FAIL-SAFE (PROG-CAL3, AGENTS.md "every fail-safe needs a gate
 *  that notices it fired").
 *
 *  Publishing a Production advances its Plan to `production` BEST-EFFORT: the event row already
 *  exists by then, so a thrown transition would leave a published event and an error message
 *  telling the host their event failed to be created. The cost of that choice is that the Plan can
 *  silently lag, which is exactly the "swallowed error is an invisible regression" failure mode.
 *
 *  So the lag is DERIVED and shown, never assumed away: a Plan with a date that already carries a
 *  `published_event_id` is a Plan that reached Production, whatever its stage column says. The
 *  drawer's readiness bar renders this beside the manifest gaps, and one save fixes it. */
export function planPublishLag(opts: {
  stage: PlanStage
  hasPublishedEvent: boolean
}): string | null {
  if (!opts.hasPublishedEvent || opts.stage === 'production') return null
  return 'This Plan already has a published event. Set its stage to Production to catch it up.'
}

export function parsePlanInput(input: PlanInput): { data: PlanWrite } | { error: string } {
  const title = typeof input.title === 'string' ? input.title.replace(/\s+/g, ' ').trim() : ''
  if (!title) return { error: 'Give the Plan a title.' }
  if (title.length > MAX_TITLE) return { error: 'The title is too long.' }
  const notes =
    typeof input.notes === 'string' && input.notes.trim()
      ? input.notes.trim().slice(0, MAX_NOTES)
      : null
  const stage = planStage(input.stage) ?? 'plan'
  const targetKind = planTarget(input.targetKind) ?? 'event'
  const playbookId =
    typeof input.playbookId === 'string' && UUID_RE.test(input.playbookId) ? input.playbookId : null
  return {
    data: {
      title,
      notes,
      links: parsePlanLinks(input.links),
      stage,
      target_kind: targetKind,
      playbook_id: playbookId,
    },
  }
}

export type PlanWrite = {
  title: string
  notes: string | null
  links: PlanLink[]
  stage: PlanStage
  target_kind: PlanTargetKind
  playbook_id: string | null
}

export function mapPlanRow(r: {
  id: string
  space_id: string
  title: string
  stage: string
  notes: string | null
  links: unknown
  target_kind: string
  playbook_id: string | null
  owner_profile_id: string | null
  created_by: string | null
  archived_at: string | null
  created_at: string
  updated_at: string
}): SpacePlan {
  return {
    id: r.id,
    spaceId: r.space_id,
    title: r.title,
    stage: planStage(r.stage) ?? 'plan',
    notes: r.notes,
    links: parsePlanLinks(r.links),
    targetKind: planTarget(r.target_kind) ?? 'event',
    playbookId: r.playbook_id,
    ownerProfileId: r.owner_profile_id,
    createdBy: r.created_by,
    archivedAt: r.archived_at,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  }
}

export interface PlanTargetDef {
  kind: PlanTargetKind
  label: string
  /** Studio create path when this target has one. Null for maintenance. */
  createHref: ((opts: { spaceId: string; planId: string; entryId?: string }) => string) | null
}

export const PLAN_TARGET_DEFS: readonly PlanTargetDef[] = [
  {
    kind: 'event',
    label: 'Event',
    createHref: ({ spaceId, planId, entryId }) => {
      const q = new URLSearchParams({ space: spaceId, plan: planId })
      if (entryId) q.set('pencil', entryId)
      return `/events/new?${q.toString()}`
    },
  },
  {
    kind: 'journey',
    label: 'Journey',
    createHref: ({ spaceId, planId }) => `/journeys/new?space=${spaceId}&plan=${planId}`,
  },
  {
    kind: 'program',
    label: 'Program',
    createHref: ({ spaceId, planId }) => `/spaces/${spaceId}/settings?plan=${planId}`,
  },
  { kind: 'maintenance', label: 'Maintenance', createHref: null },
]

export function planTargetDef(kind: string | null | undefined): PlanTargetDef {
  return PLAN_TARGET_DEFS.find((d) => d.kind === kind) ?? PLAN_TARGET_DEFS[0]
}

/** Explicit skipped dates survive regeneration: never infer a gap back into the cadence. */
export function keepExplicitExceptions(
  generatedDayKeys: readonly string[],
  exceptionDates: readonly string[],
): string[] {
  const skip = new Set(exceptionDates.filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d)))
  return generatedDayKeys.filter((d) => !skip.has(d))
}
