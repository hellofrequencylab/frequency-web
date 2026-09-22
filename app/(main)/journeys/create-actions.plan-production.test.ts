import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'

// PROG-CAL8 — A JOURNEY PRODUCED FROM A PLAN MUST CARRY THE PLAN, WHICHEVER ROAD IT TOOK.
//
// The Plan board's "Make it a Production" opens `/journeys/new?space=<slug>&plan=<id>` for a Plan
// whose target kind is `journey`. From there the author can leave by any of FOUR doors — Vera's
// Spark, a template, the Master Framework, or "Skip, I'll build it myself" — and all four end in a
// `createPlan` call. A Journey that comes out of one of them holding no `space_plan_id` is a
// Journey nothing can trace back to the Plan it was produced from, and a Plan left sitting under
// Planning for ever.
//
// 🔴 WHY SOURCE AND NOT A DRIVEN TEST. Every road ends in `redirect()` (or, for the framework, an
// ActionResult) behind auth, capabilities, governed proposals and Vera. The seed-errors suite
// beside this one reached the same conclusion for the same file and for the same reason. What is
// checkable is the shape that would regress: a fifth road added without the stamp, or a `createPlan`
// call quietly dropping the argument. Both are one-line mistakes and neither would fail anything
// else in the tree.

const RAW = () => readFileSync('app/(main)/journeys/create-actions.ts', 'utf8')
/** Comments stripped: a rule must be proved by the CODE, never by a comment that mentions it. */
const CODE = () =>
  RAW()
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '')

describe('every create road stamps the Plan it was produced from', () => {
  it('passes spacePlanId to createPlan on all four roads', () => {
    const code = CODE()
    const calls = [...code.matchAll(/createPlan\(/g)]
    expect(calls.length, 'the Spark, template, framework and draft roads').toBeGreaterThanOrEqual(4)
    for (const m of calls) {
      const tail = code.slice(m.index, m.index + 320)
      expect(
        tail,
        'a createPlan call that does not pass spacePlanId produces a Journey with no link back ' +
          'to the Plan it was produced from (PROG-CAL8)',
      ).toContain('spacePlanId: ctx.spacePlanId')
    }
  })

  it('closes the production seam before every exit, so the Plan reaches Production', () => {
    // The seam advances the Plan's stage. `redirect()` THROWS, so a call placed after it never
    // runs — which is exactly the mistake this arm exists to catch.
    const code = CODE()
    const exits = [...code.matchAll(/redirect\(`\/journeys\/\$\{plan\.slug\}\/edit`\)|return ok\(\{ slug: plan\.slug \}\)/g)]
    expect(exits.length, 'four successful exits').toBeGreaterThanOrEqual(4)
    for (const m of exits) {
      expect(
        code.slice(Math.max(0, m.index - 200), m.index),
        'every successful create must close the production seam BEFORE it leaves',
      ).toContain('closeJourneyProductionSeam(')
    }
  })
})

describe('the Plan is authorized, never taken on the query string’s word', () => {
  it('resolves it through getSpacePlan, scoped to the Space the Journey is stamped to', () => {
    const code = CODE()
    const ctx = code.slice(
      code.indexOf('async function resolveCreateContext('),
      code.indexOf('async function closeJourneyProductionSeam('),
    )
    expect(ctx).toContain('getSpacePlan(space.id,')
    // Shape-checked before it is ever handed to a query.
    expect(ctx).toMatch(/UUID_RE\.test\(spacePlanId\)/)
    // A Plan the caller may not see comes back null and the link is simply not made. The Journey
    // is still created: the author's work must never be lost to a bad query string.
    expect(ctx).toContain('plan?.id ?? null')
  })

  it('takes no Plan at all on the personal road, where there is no Space to authorize against', () => {
    const code = CODE()
    const ctx = code.slice(
      code.indexOf('async function resolveCreateContext('),
      code.indexOf('async function closeJourneyProductionSeam('),
    )
    const personal = ctx.slice(ctx.lastIndexOf('return { authorId: caller.id, spaceId: null'))
    expect(personal).toContain('spacePlanId: null')
  })
})

describe('the seam is best-effort, and something notices when it fires', () => {
  it('logs a named event rather than throwing into a committed create', () => {
    const code = CODE()
    const seam = code.slice(
      code.indexOf('async function closeJourneyProductionSeam('),
      code.indexOf('export async function createJourneyDraftAction('),
    )
    expect(seam).toContain("transitionSpacePlanRows(spaceId, spacePlanId, 'production')")
    // AGENTS.md: every fail-safe needs a gate that notices it fired.
    expect((seam.match(/log\.error\('calendar\.production_plan_stage_not_advanced'/g) ?? []).length).toBe(2)
    expect(seam, 'a committed Journey must never be undone by a lagging stage column').not.toMatch(/\bthrow\b/)
  })
})

describe('the back-link goes on the INSERT, and is not called plan_id', () => {
  const planStore = () => readFileSync('lib/journey-plans.ts', 'utf8')

  it('createPlan writes space_plan_id with the row rather than in a second write', () => {
    // A follow-up write is a second thing that can fail silently, and would leave a Journey that
    // exists without the link it was created to carry.
    const src = planStore()
    const start = src.indexOf('export async function createPlan(')
    expect(start, 'createPlan moved').toBeGreaterThan(-1)
    const insert = src.slice(start, src.indexOf('.select(PLAN_COLS)', start))
    expect(insert).toContain('space_plan_id: input.spacePlanId')
  })

  it('never names the column plan_id, which already means something else here', () => {
    // 🔴 THE COLLISION THIS GUARDS. journey_plans IS the Journey table: `journey_plan_items.plan_id`
    // and `JourneyBuilder`'s own `planId` prop both mean THE JOURNEY. A `plan_id` on journey_plans
    // would read as "the journey this journey belongs to" to every future reader.
    expect(planStore()).not.toMatch(/journey_plans[\s\S]{0,400}?\bplan_id:/)
  })
})
