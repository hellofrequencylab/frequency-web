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
// THE SHARE HANDSHAKE (PROG-CAL7 Together, LIVE-541). Source-level, the house archetype above: the
// failure this guards is a share that lands accepted with nobody asked, or a share moved by a Space
// that does not own its side, and neither throws at runtime.
describe('sharing a Plan is a handshake, and each door serves one side', () => {
  const source = readFileSync('app/(main)/spaces/[slug]/settings/calendar/plan-actions.ts', 'utf8')
  const body = (name: string) => {
    const at = source.indexOf(`export async function ${name}(`)
    expect(at, `${name} exists`).toBeGreaterThan(-1)
    return source.slice(at, source.indexOf('\n}', at))
  }

  it('the host offers a Plan of its own to an accepted collaborator only, and it lands pending', () => {
    const share = body('sharePlanWithSpace')
    expect(share).toContain('const editor = await resolveEditor(slug)')
    expect(share).toContain('getSpacePlan(editor.spaceId, planId)')
    expect(share).toContain('acceptedCollaborators(editor.spaceId)')
    expect(share).toContain("insertPlanShare({ planId, guestSpaceId, requestedBy: editor.profileId, status: 'pending' })")
    expect(share).not.toContain("'accepted'")
    expect(source).not.toMatch(/status:\s*'accepted'/)
    const store = readFileSync('lib/calendar/plans-store.ts', 'utf8')
    expect(store).toContain("requestedBy: string; status: 'pending' }")
  })

  it('the guest answers on its own session, keyed by its own Space and the pending state', () => {
    const answer = body('respondToPlanShare')
    expect(answer).toContain('parseShareAnswer(rawAnswer)')
    expect(answer).toContain('answerPlanShareRow(shareId, editor.spaceId, answer, editor.profileId)')
    const store = readFileSync('lib/calendar/plans-store.ts', 'utf8')
    const at = store.indexOf('export async function answerPlanShareRow(')
    const rowBody = store.slice(at, store.indexOf('\n}', at))
    expect(rowBody).toContain(".eq('guest_space_id', guestSpaceId)")
    expect(rowBody).toContain(".eq('status', 'pending')")
  })

  it('the host takes back only a share of a Plan proven to be its own', () => {
    const revoke = body('revokePlanShare')
    expect(revoke).toContain('getPlanShareRow(shareId)')
    expect(revoke).toContain('getSpacePlan(editor.spaceId, share.plan_id)')
    expect(revoke).toContain('revokePlanShareRow(shareId, plan.id, editor.profileId)')
  })

  it('the picker reads the accepted collaborations and nothing else, and the drawer has no id field', () => {
    expect(source).toContain("import { listAcceptedCollaborations } from '@/lib/spaces/collaborations'")
    const drawer = readFileSync('app/(main)/spaces/[slug]/settings/calendar/plan-drawer.tsx', 'utf8')
    expect(drawer).not.toContain('placeholder="Space id"')
    expect(drawer).toContain('id="plan-share"')
    expect(drawer).toContain('options={shareChoices}')
  })
})
