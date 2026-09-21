// ─────────────────────────────────────────────────────────────────────────────
// THE PLAN DRAWER'S RAIL PLAN (ADR-1521 · ADR-986 · ADR-1240 · ADR-1309, docs/STUDIO.md).
//
// PROG-CAL2 said the Plan drawer is "a rail composed from a manifest in lib/studio/entities
// (ADR-986), not a hand-built form". It was hand-built: `SPACE_PLAN_MANIFEST` had exactly one
// importer in the repository, `lib/studio/registry.ts`, inside lib/studio itself, and the drawer
// assembled its own Input / Textarea / Select. So the manifest declared five things and the drawer
// rendered four of them in its own words; the fifth, `links`, was declared, parsed on the way in by
// `parsePlanLinks`, written `[]` forever, and reachable from nowhere in the product.
//
// This file is the seam AGENTS.md names ("rails derive from `*-rail-plan.ts`"), in the same shape
// as components/admin/modules/*-rail-plan.ts. The ONE thing it says for itself is `PLAN_WRITES`,
// the columns `saveSpacePlan` persists, restated once where a test can hold it against
// `parsePlanInput`. Everything a field IS — its set, its order, its label, its kind, its options —
// is the manifest's, read through `railForm()`.
//
// PURE: the manifest and the kernel only. The drawer and its tests both import this, so a test can
// pin what the drawer renders without mounting a client module that reaches server actions.
// ─────────────────────────────────────────────────────────────────────────────

import type { RepeatRow } from '@/components/admin/rail/rail-field-value'
import type { PlanLink } from '@/lib/calendar/plans'
import { SPACE_PLAN_MANIFEST } from '@/lib/studio/entities/space-plan'
import { railForm, type RailForm } from '@/lib/studio/kernel/edit-plan'
import type { FieldDef } from '@/lib/studio/kernel/manifest'

/** The columns `saveSpacePlan` persists, which is exactly what `parsePlanInput` accepts and writes
 *  (`playbookId` is set by the playbook actions, never typed in the drawer). */
export const PLAN_WRITES = ['title', 'notes', 'stage', 'targetKind', 'links'] as const

/** `title` is asked at creation and edited here after, so the manifest gives it `editPlane: 'rail'`
 *  and the rail hosts it without `hostInline`. Nothing in this manifest sits on an inline canvas. */
export const PLAN_RAIL: RailForm = railForm(SPACE_PLAN_MANIFEST, PLAN_WRITES)

/** The path the STEPPER owns. `stage` is a `select` in the manifest because the kernel has no
 *  stepper kind, and adding one would be a kernel change every entity inherits for one surface's
 *  sake. The drawer therefore renders the fields around it and the stepper in its place
 *  (ADR-1520), which keeps the manifest's order intact. */
export const PLAN_STAGE_PATH = 'stage'

const stageAt = PLAN_RAIL.fields.findIndex((f) => f.path === PLAN_STAGE_PATH)

/** The rail fields declared before `stage`, in manifest order. */
export const PLAN_FIELDS_BEFORE_STAGE: FieldDef[] =
  stageAt < 0 ? PLAN_RAIL.fields : PLAN_RAIL.fields.slice(0, stageAt)

/** The rail fields declared after `stage`, in manifest order. */
export const PLAN_FIELDS_AFTER_STAGE: FieldDef[] =
  stageAt < 0 ? [] : PLAN_RAIL.fields.slice(stageAt + 1)

/** A Plan's stored links as the repeat control's rows. The keys are the manifest's own row field
 *  paths (`url`, `label`), so a row the manifest grows arrives blank rather than missing. */
export function planLinkRows(links: readonly PlanLink[] | null | undefined): RepeatRow[] {
  const def = PLAN_RAIL.repeats.find((r) => r.arrayPath === 'links')
  const paths = def ? def.fields.map((f) => f.path) : ['url', 'label']
  return (links ?? []).map((link) => {
    const row: RepeatRow = {}
    for (const path of paths) {
      const value = (link as unknown as Record<string, unknown>)[path]
      row[path] = typeof value === 'string' ? value : ''
    }
    return row
  })
}

/** The rows on their way back to `saveSpacePlan`. SHAPING ONLY: what counts as a link is
 *  `parsePlanLinks`, which the save action already runs, and there is not a second parser here. */
export function planLinksFromRows(rows: readonly RepeatRow[]): PlanLink[] {
  return rows.map((row) => ({ url: (row.url ?? '').trim(), label: (row.label ?? '').trim() }))
}
