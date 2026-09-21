import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

describe('createPenciledPlan action contract', () => {
  const source = readFileSync('app/(main)/spaces/[slug]/settings/calendar/plan-actions.ts', 'utf8')
  const migration = readFileSync('supabase/migrations/20270345007000_create_penciled_plan.sql', 'utf8')

  it('validates title and date, then creates one entry, one Plan, and links them', () => {
    expect(source).toContain('export async function createPenciledPlan(')
    expect(source).toContain('parsePlanInput({ title, stage: \'pencil\', targetKind: \'event\' })')
    expect(source).toContain('parseEntryInput(input)')
    expect(source).toContain('createPenciledPlanRows(editor.spaceId, parsedPlan.data.title, parsedEntry.data)')
    expect(source).toContain('return ok({ id: created.data.planId, entryId: created.data.entryId })')
    expect(migration).toContain('create or replace function public.create_penciled_plan(')
    expect(migration).toContain('insert into public.space_plans')
    expect(migration).toContain('insert into public.space_calendar_entries')
    expect(migration).toContain('security invoker')
  })

  it('keeps the action behind the existing editor capability gate', () => {
    const action = source.slice(source.indexOf('export async function createPenciledPlan('))
    expect(action).toContain('const editor = await resolveEditor(slug)')
    expect(action).toContain('if (!editor) return fail(\'You do not have access to this calendar.\')')
  })

  it('moves a Plan and every linked calendar date through one transactional action', () => {
    const store = readFileSync('lib/calendar/plans-store.ts', 'utf8')
    const entries = readFileSync('app/(main)/spaces/[slug]/settings/calendar/entry-actions.ts', 'utf8')
    const migration = readFileSync('supabase/migrations/20270345007100_transition_space_plan_stage.sql', 'utf8')
    expect(source).toContain('export async function transitionPlanStage(')
    expect(source).toContain('transitionSpacePlanRows')
    expect(store).toContain("rpc('transition_space_plan_stage'")
    expect(store).toContain('p_stage: stage')
    expect(entries).toContain('transitionPlanStage(slug, current.plan_id, planStage)')
    expect(migration).toContain('update public.space_plans')
    expect(migration).toContain('update public.space_calendar_entries')
    expect(migration).toContain("('cancelled'::text,  'plan'::text,       'cancelled'::text")
    expect(migration).toContain('security invoker')
  })
})