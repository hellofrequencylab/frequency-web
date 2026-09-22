import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { ENTRY_STAGES } from './registry'
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
// The label expressions are ternaries inside components, so this reads the source for those two
// and the exported table for the manifest. That is deliberate: a render test would mount two
// client components to assert one string each, and would still miss the manifest.

const ROOT = join(import.meta.dirname, '..', '..')
const read = (rel: string) => readFileSync(join(ROOT, rel), 'utf8')

/** Every place a `'plan'` stage VALUE is turned into a word a person reads. */
const LABEL_SITES = [
  { file: 'app/(main)/spaces/[slug]/settings/calendar/plan-board.tsx', what: 'the board column heading' },
  { file: 'app/(main)/spaces/[slug]/settings/calendar/plan-drawer.tsx', what: "the drawer's stage picker" },
] as const

describe('the stage nouns are Pencil, Planning, Production (ADR-1523)', () => {
  it('has no site left that labels the plan stage "Plan"', () => {
    for (const site of LABEL_SITES) {
      const src = read(site.file)
      expect(
        /['"]plan['"]\s*\?\s*['"]Plan['"]/.test(src),
        `${site.file} labels the plan stage "Plan" in ${site.what}. NAMING.md reserves capital-P ` +
          `Plan for the OBJECT; the stage is "Planning" (ADR-1523).`,
      ).toBe(false)
      expect(src).toMatch(/['"]plan['"]\s*\?\s*['"]Planning['"]/)
    }
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
