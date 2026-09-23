import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { ENTRY_STAGES } from './registry'
import { planStageLabel } from './plans'
import { PLAN_STAGE_TRANSITIONS } from './workflow-board'
import { SPACE_PLAN_MANIFEST } from '@/lib/studio/entities/space-plan'

// THE STAGE NOUNS, held in one place (ADR-1523, LIVE-461).
//
// docs/NAMING.md: the stages are Pencil, Planning, Production, and capital-P **Plan** is the
// OBJECT — the working record, `space_plans`, "Start a plan". ADR-1386 ruling 2 said the stage
// nouns were "Pencil, Plan, Production", which contradicted it; the owner ruled for NAMING.md on
// 2026-09-22 and ADR-1523 strikes that clause.
//
// 🔴 WHY A TEST AND NOT JUST THE EDIT. The three sites that had it wrong — the board column, the
// drawer's stage picker and the Studio manifest — have NO render coverage between them, so nothing
// in the tree would have noticed the drift, and nothing would notice it coming back. The
// contradiction lived long enough that ONE component disagreed with itself: plan-drawer.tsx
// rendered "Planning" in its read-only Stage row and offered "Plan" in the picker below it.
//
// LIVE-470 finished the job the comment above describes. There are no ternaries left: every site
// calls `planStageLabel`, which reads lib/calendar/registry.ts. So the cases below assert the
// COLLAPSE (no site spells a stage word of its own) and the word the one source hands back,
// instead of asserting the shape of each site's ternary.

const ROOT = join(import.meta.dirname, '..', '..')
const read = (rel: string) => readFileSync(join(ROOT, rel), 'utf8')

/** Every place a `'plan'` stage VALUE is turned into a word a person reads. */
const LABEL_SITES = [
  { file: 'app/(main)/spaces/[slug]/settings/calendar/plan-board.tsx', what: 'the board column heading' },
  { file: 'lib/calendar/workflow-board.ts', what: "the Workflow board's columns and transitions" },
  { file: 'components/spaces/calendar-workspace.tsx', what: "the workspace's optimistic source label" },
  { file: 'lib/studio/entities/space-plan.ts', what: "the Studio manifest's stage options" },
  // The drawer is no longer a site: PROG-CAL2 composed it from the manifest, so it holds no stage
  // label of its own. The case below pins that it stays that way.
] as const

describe('the stage nouns are Pencil, Planning, Production (ADR-1523)', () => {
  it('has no site left that spells a stage word of its own (LIVE-470)', () => {
    for (const site of LABEL_SITES) {
      const src = read(site.file)
      expect(
        /['"]plan['"]\s*\?\s*['"]Plan/.test(src),
        `${site.file} labels the plan stage by hand in ${site.what}. NAMING.md reserves capital-P ` +
          `Plan for the OBJECT, the stage is "Planning" (ADR-1523), and LIVE-470 put the word in ` +
          `one place: call planStageLabel.`,
      ).toBe(false)
      expect(src, `${site.file} should read the one label source`).toContain('planStageLabel')
    }
  })

  it('hands every site the same three words, from the calendar registry', () => {
    expect(planStageLabel('pencil')).toBe('Pencil')
    expect(planStageLabel('plan')).toBe('Planning')
    expect(planStageLabel('production')).toBe('Production')
    // The Workflow board's fourth option is not a Plan stage at all; it still gets its word here.
    expect(planStageLabel('cancelled')).toBe('Cancelled')
  })

  it('the drawer spells no stage of its own: it reads the manifest (PROG-CAL2)', () => {
    // Before PROG-CAL2 this file's own comment anticipated the rebuild: "if the manifest were left
    // saying Plan, the rebuild would import the wrong label and undo the fix silently". The rebuild
    // landed; a ternary creeping back in would be the drawer disagreeing with itself again.
    const src = read('app/(main)/spaces/[slug]/settings/calendar/plan-drawer.tsx')
    expect(src).not.toMatch(/['"]plan['"]\s*\?\s*['"]/)
    expect(src).toContain('@/lib/studio/entities/space-plan')
  })

  it('the Studio manifest agrees, so a manifest-composed drawer inherits the right word', () => {
    // PROG-CAL2 rebuilds the drawer from this manifest. If the manifest were left saying "Plan",
    // the rebuild would import the wrong label and undo the fix silently.
    const stage = SPACE_PLAN_MANIFEST.fields.find((f) => f.path === 'stage')
    expect(stage, 'SPACE_PLAN_MANIFEST has no stage field').toBeTruthy()
    const labels = (stage?.options ?? []).map((o) => o.label)
    expect(labels).toContain('Planning')
    expect(labels).not.toContain('Plan')
  })

  it('the registry and the workflow board already agreed, and still do', () => {
    // These two were never wrong. Pinned so a future "consistency" sweep cannot make them wrong
    // in the name of matching the three that were.
    expect(ENTRY_STAGES.map((s) => s.label)).toEqual(['Pencil', 'Planning', 'Production', 'Cancelled'])
    expect(PLAN_STAGE_TRANSITIONS.find((t) => t.planStage === 'plan')?.label).toBe('Planning')
  })

  it('leaves the OBJECT called Plan, which is the distinction the ruling protects', () => {
    // A sweep that replaced the word everywhere would break exactly this.
    expect(SPACE_PLAN_MANIFEST.label).toBe('Plan')
    expect(read('app/(main)/spaces/[slug]/settings/calendar/calendar-plans-panel.tsx')).toContain('"Plans"')
  })
})
