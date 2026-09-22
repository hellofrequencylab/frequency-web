import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'

// PROG-CAL9 — A PROGRAM PRODUCED FROM A PLAN MUST CARRY THE PLAN, AND THE PLAN MUST ADVANCE.
//
// The Plan board's "Make it a Production" opens `/spaces/<slug>/settings/program?plan=<id>` for a
// Plan whose target kind is `program`. The page threads the Plan into createSpaceProgramAction,
// which is the ONE create road a Program has. A Program that comes out of it holding no
// `space_plan_id` is a Program nothing can trace back to the Plan it was produced from, and a Plan
// left sitting under Planning for ever: exactly the defect PROG-CAL8 left open on purpose so it
// would be closed here, with the column and the seam, rather than by a parameter nothing read.
//
// 🔴 WHY SOURCE AND NOT A DRIVEN TEST. The action ends in `redirect()` behind the caller gate, the
// Space gate, the `program` function gate and the live-circle check, and the data layer is covered
// by lib/channels/programs.test.ts on its own fake. The sibling suite for the Journey half
// (app/(main)/journeys/create-actions.plan-production.test.ts) reached the same conclusion for the
// same reason. What is checkable is the shape that would regress: the authorization dropped for a
// bare bound argument, the seam moved after the redirect (which THROWS, so it would never run), or
// the insert quietly losing the column. Each is a one-line mistake that fails nothing else.

const ACTIONS = 'app/(main)/spaces/[slug]/settings/program/actions.ts'
const PAGE = 'app/(main)/spaces/[slug]/settings/program/page.tsx'
const RAW = () => readFileSync(ACTIONS, 'utf8')
/** Comments stripped: a rule must be proved by the CODE, never by a comment that mentions it. */
const strip = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
const CODE = () => strip(RAW())

const createAction = (code: string) =>
  code.slice(code.indexOf('export async function createSpaceProgramAction('), code.indexOf('export async function updateSpaceProgramAction('))

describe('the Plan is authorized, never taken on the bound argument’s word', () => {
  it('resolves it through getSpacePlan, scoped to the Space the gate resolved', () => {
    const code = CODE()
    const resolver = code.slice(
      code.indexOf('async function resolveProductionPlan('),
      code.indexOf('async function closeProgramProductionSeam('),
    )
    expect(resolver).toContain('getSpacePlan(spaceId, spacePlanId)')
    // Shape-checked before it is ever handed to a query.
    expect(resolver).toMatch(/UUID_RE\.test\(spacePlanId\)/)
    // A Plan the caller may not see comes back null and the link is simply not made. The Program
    // is still created: the operator's work must never be lost to a bad query string.
    expect(resolver).toContain('plan?.id ?? null')
    // And the create road uses THAT, against space.id from requireProgramManager, not the argument.
    const create = createAction(code)
    expect(create).toContain('resolveProductionPlan(space.id, requested)')
    expect(create).toContain('spacePlanId: planId,')
    expect(create, 'the raw argument must never reach the insert').not.toContain('spacePlanId: requested')
  })

  it('carries the Plan back through a failed create so the operator does not lose it on the bounce', () => {
    const create = createAction(CODE())
    expect(create).toContain("createErrorPath(slug, 'missing', requested)")
    expect(create).toContain("createErrorPath(slug, 'failed', requested)")
  })
})

describe('the seam is best-effort, runs before the exit, and something notices when it fires', () => {
  it('advances the Plan to Production with a named event on failure, and never throws into a committed create', () => {
    const code = CODE()
    const seam = code.slice(
      code.indexOf('async function closeProgramProductionSeam('),
      code.indexOf('function createErrorPath('),
    )
    expect(seam).toContain("transitionSpacePlanRows(spaceId, spacePlanId, 'production')")
    // AGENTS.md: every fail-safe needs a gate that notices it fired. Same event name as the event
    // and Journey seams, so one query finds all three.
    expect((seam.match(/log\.error\('calendar\.production_plan_stage_not_advanced'/g) ?? []).length).toBe(2)
    expect(seam, 'a committed Program must never be undone by a lagging stage column').not.toMatch(/\bthrow\b/)
  })

  it('closes the seam BEFORE the redirect to the new Channel', () => {
    // `redirect()` THROWS, so a call placed after it never runs.
    const create = createAction(CODE())
    const exit = create.indexOf('redirect(`/channels/${channelSlug}`)')
    expect(exit).toBeGreaterThan(-1)
    expect(create.slice(0, exit)).toContain('await closeProgramProductionSeam(space.id, channelId, planId)')
  })
})

describe('the door, the page and the row agree', () => {
  it('the page declares plan in its searchParams, resolves it through getSpacePlan, and binds it into the action', () => {
    const page = readFileSync(PAGE, 'utf8')
    expect(page).toMatch(/searchParams: Promise<\{[^}]*\bplan\?: string/)
    expect(page).toContain('getSpacePlan(space.id, planId)')
    expect(page).toContain('createSpaceProgramAction.bind(null, slug, spacePlan?.id ?? null)')
    // Provenance, and the dropped-link notice /journeys/new renders for a Plan the Space does not run.
    expect(page).toContain('Producing')
    expect(page).toContain('You opened this from a Plan this space does not run')
  })

  it('the back-link goes on the INSERT, and is not called plan_id', () => {
    // A follow-up write is a second thing that can fail silently, and would leave a Program that
    // exists without the link it was created to carry.
    const src = strip(readFileSync('lib/channels/programs.ts', 'utf8'))
    const start = src.indexOf('export async function createSpaceProgram(')
    expect(start, 'createSpaceProgram moved').toBeGreaterThan(-1)
    const body = src.slice(start, src.indexOf('export async function', start + 10))
    const insert = body.slice(body.indexOf(".from('topical_channels')"), body.indexOf(".select('id, slug')"))
    expect(insert).toContain('space_plan_id: input.spacePlanId')
    // 🔴 THE COLLISION THIS GUARDS. A Program is a Channel whose template_id is its blueprint; a bare
    // plan_id beside id, template_id and owner_space_id would be misread as a fourth kind of
    // blueprint or as the Space's pricing plan.
    expect(insert).not.toMatch(/\bplan_id:/)
  })

  it('the column exists in the contract and the migration adds it additively', () => {
    const types = readFileSync('lib/database.types.ts', 'utf8')
    const block = types.slice(types.indexOf('      topical_channels: {'), types.indexOf('\n      }\n', types.indexOf('      topical_channels: {')))
    expect(block).toContain('space_plan_id: string | null')
    expect(block).toContain('foreignKeyName: "topical_channels_space_plan_id_fkey"')
    const migration = readFileSync('supabase/migrations/20270345007900_program_becomes_its_production.sql', 'utf8')
    expect(migration).toContain('alter table public.topical_channels')
    expect(migration).toContain('add column if not exists space_plan_id uuid references public.space_plans(id) on delete set null')
    expect(migration).toContain('create index if not exists topical_channels_space_plan_id_idx')
  })
})
