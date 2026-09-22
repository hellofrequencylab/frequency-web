import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { SPACE_PLAN_MANIFEST } from '@/lib/studio/entities/space-plan'
import type { PlanInput } from '@/lib/calendar/plans'
import { PLAN_RAIL, PLAN_WRITES, planStageLabel } from './plan-rail-plan'

// ─────────────────────────────────────────────────────────────────────────────
// THE PLAN DRAWER DERIVES FROM ITS MANIFEST (ADR-1468, PROG-CAL2).
//
// Three properties the hand-built drawer lacked:
//   1. the drawer renders EXACTLY the manifest's rail fields, in manifest order, plus its one repeat;
//   2. every column the save action writes is honoured, so nothing is written that cannot be shown
//      — which is how `links` sat unreachable for three days (HYG-108's finding on this row);
//   3. the field objects ARE the manifest's, by identity, so a label or option change in
//      lib/studio/entities/space-plan.ts is the whole change.
// Plus a source-shape guard: the drawer file declares no Plan field of its own.
// ─────────────────────────────────────────────────────────────────────────────

const ROOT = join(import.meta.dirname, '..', '..', '..', '..', '..', '..')

describe('the Plan drawer plan', () => {
  it('renders the four rail fields in manifest order, and the links repeat', () => {
    // Owner ruling 2026-09-22: Stage and Production opens under Title, Notes last. The manifest
    // holds that order; this line notices if it moves.
    expect(PLAN_RAIL.fields.map((f) => f.path)).toEqual(['title', 'stage', 'targetKind', 'notes'])
    expect(PLAN_RAIL.repeats.map((r) => r.arrayPath)).toEqual(['links'])
  })

  it('honours every written column: nothing saveSpacePlan writes is missing from the drawer', () => {
    expect(PLAN_RAIL.dropped).toEqual([])
  })

  it('writes exactly the PlanInput columns the drawer edits, and says why playbookId is not one', () => {
    // playbookId IS a PlanInput column and IS written, but a Plan takes its playbook when it is
    // started from one; the drawer has no business changing it, so it is not on the rail. If a
    // future field is added to PlanInput and forgotten here, this is the line that notices.
    type Edited = Exclude<keyof PlanInput, 'playbookId'>
    const edited: readonly Edited[] = ['title', 'notes', 'links', 'stage', 'targetKind']
    expect([...PLAN_WRITES].sort()).toEqual([...edited].sort())
  })

  it('reads label, kind, options and required from the manifest, never from the drawer', () => {
    const byPath = new Map(SPACE_PLAN_MANIFEST.fields.map((f) => [f.path, f]))
    for (const f of PLAN_RAIL.fields) expect(f).toBe(byPath.get(f.path))
    expect(PLAN_RAIL.fields.find((f) => f.path === 'title')?.required).toBe(true)
    // The stage word comes from the manifest, so it is "Planning" (ADR-1523) and never "Plan".
    expect(planStageLabel('plan')).toBe('Planning')
    expect(planStageLabel('pencil')).toBe('Pencil')
    expect(planStageLabel('production')).toBe('Production')
  })

  it('leaves no hand-built Plan field in the drawer file', () => {
    // The to-do composer's controls are not Plan fields and may stay; these four ids were the
    // hand-built ones, and RailManifestFields now mints them from the manifest with idPrefix.
    const src = readFileSync(join(ROOT, 'app/(main)/spaces/[slug]/settings/calendar/plan-drawer.tsx'), 'utf8')
    expect(src).not.toMatch(/<(Input|Textarea|Select)\b[^>]*\bid="plan-(title|stage|target|notes)"/)
    expect(src).not.toMatch(/PLAN_STAGES\.map|PLAN_TARGETS\.map/)
    expect(src).toContain('idPrefix="plan-"')
  })
})
