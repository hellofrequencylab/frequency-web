// SPACE PLANS, the pure half (ADR-1386). A Plan is the working record behind one or more
// Pencils and Productions. No React, no Supabase.

import { calendarPresentation, entryStage, type CalendarPresentation, type EntryStage } from './registry'

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

/**
 * The columns a person edits on a Plan, as `PlanInput` names them: what the drawer's rail form
 * writes through `saveSpacePlan` (ADR-1468, PROG-CAL2) and what Vera may set one at a time
 * (PROG-CAL11). `playbookId` is also a written column but is not here on purpose: a Plan takes
 * its playbook when it is started from one (`startPlanFromPlaybook`), so neither the drawer nor
 * Vera has any business changing it. Lives beside `PlanInput` so the list and the type cannot drift
 * apart without the test beside the drawer noticing.
 */
export const PLAN_WRITES = ['title', 'notes', 'stage', 'targetKind', 'links'] as const satisfies readonly (keyof PlanInput)[]

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const MAX_TITLE = 200
const MAX_NOTES = 20_000
/** The most links a Plan keeps. Exported because the drawer's repeat control needs the SERVER cap:
 *  `parsePlanLinks` slices to it, so a 21st row typed in the drawer would be dropped on save with
 *  nothing said — the exact failure `RailManifestRepeat`'s `max` exists to prevent (PROG-CAL2). */
export const PLAN_MAX_LINKS = 20
const MAX_LINKS = PLAN_MAX_LINKS

export function planStage(value: string | null | undefined): PlanStage | null {
  return PLAN_STAGES.includes(value as PlanStage) ? (value as PlanStage) : null
}

/** The entry stage a Plan stage IS. A Plan and the dates on it are the same three steps under two
 *  spellings (`plan` in `space_plans.stage`, `planning` in `space_calendar_entries.stage`), so the
 *  word and the colour come from one row of lib/calendar/registry.ts for both. */
export const PLAN_STAGE_ENTRY: Record<PlanStage, EntryStage> = {
  pencil: 'pencil',
  plan: 'planning',
  production: 'production',
}

/**
 * 🔴 THE ONE PLACE A STAGE VALUE BECOMES A WORD (LIVE-470).
 *
 * Five files used to spell this out by hand: the Studio manifest, the Calendar settings board, the
 * Workflow board's two tables, the workspace's optimistic `sourceLabel` and the drawer's summary.
 * That is how they drifted (LIVE-461: "Planning" in the drawer's summary, "Plan" in the picker
 * right below it). They all read this now, and this reads the registry, so a stage has one word
 * across the board, the drawer, the grid chip, the List pill and the popup.
 *
 * Takes a `WorkflowStage` too, so the board's Cancelled option needs no special case.
 */
export function planStageLabel(stage: string): string {
  const mapped = PLAN_STAGE_ENTRY[stage as PlanStage]
  return entryStage(mapped ?? stage)?.label ?? stage
}

/** The form, colour and word a Plan stage shows in, straight from the calendar registry. */
export function planStagePresentation(stage: string): CalendarPresentation {
  return calendarPresentation({ stage: PLAN_STAGE_ENTRY[stage as PlanStage] ?? stage }, 'team')
}

export function planTarget(value: string | null | undefined): PlanTargetKind | null {
  return PLAN_TARGETS.includes(value as PlanTargetKind) ? (value as PlanTargetKind) : null
}

export function parsePlanLinks(raw: unknown): PlanLink[] {
  if (!Array.isArray(raw)) return []
  const out: PlanLink[] = []
  for (const item of raw.slice(0, MAX_LINKS)) {
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

/** What a target's create door is handed. BOTH identifiers, deliberately.
 *
 *  🔴 THE TWO NAMES FOR A SPACE ARE NOT INTERCHANGEABLE, and pretending they were is the whole of
 *  PROG-CAL8's defect. This used to take `spaceId` alone, and `resolveEditor` sets that to
 *  `space.id` — a UUID. Two of the four doors led somewhere that resolves a SLUG:
 *
 *    • `/journeys/new?space=` is read by `getVisibleSpaceBySlug`, which queries `.eq('slug', norm)`.
 *      A UUID never matched, so the page took its `!space` branch and `redirect('/spaces')` fired.
 *      The owner pressed "Make it a Production" and landed on the Spaces directory.
 *    • `/spaces/<seg>/settings/...` is a `[slug]` segment. A UUID there is a 404.
 *
 *  So each target is handed both and uses the one its destination actually resolves, rather than
 *  every door being bent to one identifier that only the event door ever wanted. `/events/new`
 *  genuinely compares `?space=` against `s.id` (see its `defaultGroupId`), and changing that would
 *  break the Duplicate and circle roads that share the param. The asymmetry is in the destinations;
 *  hiding it here is what made it invisible. */
export interface PlanTargetHrefOpts {
  /** The Space's UUID. For a destination that resolves a Space by id. */
  spaceId: string
  /** The Space's URL slug. For a `[slug]` route segment, or a page that looks the Space up by slug. */
  spaceSlug: string
  planId: string
  entryId?: string
}

export interface PlanTargetDef {
  kind: PlanTargetKind
  label: string
  /** Studio create path when this target has one. Null for maintenance. */
  createHref: ((opts: PlanTargetHrefOpts) => string) | null
}

export const PLAN_TARGET_DEFS: readonly PlanTargetDef[] = [
  {
    kind: 'event',
    label: 'Event',
    // `?space=` here is an ID on purpose: /events/new matches it against the ids of the scopes the
    // caller runs. This door always worked.
    createHref: ({ spaceId, planId, entryId }) => {
      const q = new URLSearchParams({ space: spaceId, plan: planId })
      if (entryId) q.set('pencil', entryId)
      return `/events/new?${q.toString()}`
    },
  },
  {
    kind: 'journey',
    label: 'Journey',
    // `?space=` here is a SLUG: that is the documented contract of /journeys/new, whose Space road
    // swaps the gate from the member tier to managing the named Space. `?plan=` is read there too
    // now, and the Journey it creates carries `journey_plans.space_plan_id` back to this Plan.
    createHref: ({ spaceSlug, planId }) => `/journeys/new?space=${spaceSlug}&plan=${planId}`,
  },
  {
    kind: 'program',
    label: 'Program',
    // The Program owner surface, which is a real page at this exact segment — the old href pointed
    // at `/spaces/<id>/settings`, where there is only a layout and no page at all.
    //
    // The Plan rides along (PROG-CAL9). It landed in the same change that made the page READ it:
    // the page names the Plan on screen and threads it into createSpaceProgramAction, which
    // authorizes it through getSpacePlan, writes `topical_channels.space_plan_id` on the insert and
    // advances the Plan to Production. A parameter nothing read would have been the same class of
    // lie as an href nothing serves, which is why PROG-CAL8 left it out.
    createHref: ({ spaceSlug, planId }) => `/spaces/${spaceSlug}/settings/program?plan=${planId}`,
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
