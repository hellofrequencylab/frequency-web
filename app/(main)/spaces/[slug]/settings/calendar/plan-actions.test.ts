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

// THE THREAD (PROG-CAL7 Together, LIVE-542). Source-level: the failure this guards is a comment
// door that admits a Space with no accepted share, or a store that reaches the table around RLS,
// or a table whose written word can be rewritten. None of those throws at runtime.
describe('the thread under a Plan admits either side of an accepted share, on the session', () => {
  const source = readFileSync('app/(main)/spaces/[slug]/settings/calendar/plan-actions.ts', 'utf8')
  const body = (name: string) => {
    const at = source.indexOf(`export async function ${name}(`)
    expect(at, `${name} exists`).toBeGreaterThan(-1)
    return source.slice(at, source.indexOf('\n}', at))
  }

  it('every comment door goes through planSide, which admits the host or an accepted guest', () => {
    const gate = source.slice(source.indexOf('async function planSide('), source.indexOf('\n}', source.indexOf('async function planSide(')))
    expect(gate).toContain('const editor = await resolveEditor(slug)')
    expect(gate).toContain('getSpacePlan(editor.spaceId, planId)')
    expect(gate).toContain('listSharedPlanIds(editor.spaceId)')
    for (const name of ['listPlanComments', 'postPlanComment', 'removePlanComment']) {
      expect(body(name)).toContain('const side = await planSide(slug, planId)')
    }
  })

  it('a post is parsed, a to-do thread is proven against the Plan-scoped task list, and the author is the caller', () => {
    const post = body('postPlanComment')
    expect(post).toContain('parseCommentBody(rawBody)')
    expect(post).toContain('listTasks({ spaceId: side.spaceId, planId, limit: 200 })')
    expect(post).toContain('authorProfileId: side.profileId')
    expect(post).toContain('spaceId: side.spaceId')
    expect(body('removePlanComment')).toContain('removePlanCommentRow(commentId)')
  })

  it('the store is on the session and the table is a record gated by the share helpers', () => {
    const store = readFileSync('lib/calendar/plan-comments-store.ts', 'utf8')
    expect(store).toContain("from '@/lib/supabase/server'")
    expect(store).not.toMatch(/createAdminClient|supabase\/admin/)
    expect(store).toContain("rpc('remove_plan_comment'")
    const migration = readFileSync('supabase/migrations/20270345009400_space_plan_comments.sql', 'utf8')
    expect(migration).toContain('create table if not exists public.space_plan_comments')
    expect(migration).toContain('private.can_write_plan_host(plan_id)')
    expect(migration).toContain('private.plan_is_shared_with_me(plan_id)')
    expect(migration).toContain('author_profile_id = private.get_my_profile_id()')
    expect(migration).not.toMatch(/on public\.space_plan_comments\s+for\s+(update|delete)/i)
    expect(migration).toContain('create or replace function public.remove_plan_comment(p_comment_id uuid)')
    expect(migration).toContain('revoke all on table public.space_plan_comments from anon')
  })
})

// THE RECORD (PROG-CAL7 Together, LIVE-543). Source-level: the failure this guards is a door that
// changes a Plan and writes no record, so the other team learns nothing; none of those throws.
describe('every door that changes a Plan writes the Plan record, on the session, append only', () => {
  const dir = 'app/(main)/spaces/[slug]/settings/calendar/'
  const source = readFileSync(dir + 'plan-actions.ts', 'utf8')
  const body = (src: string, name: string) => {
    const at = src.indexOf(`export async function ${name}(`)
    expect(at, `${name} exists`).toBeGreaterThan(-1)
    return src.slice(at, src.indexOf('\n}', at))
  }

  it('the Plan doors record stage, field, to-do, share and comment changes with the sentence they report', () => {
    for (const [name, kind] of [
      ['saveSpacePlan', "kind: 'field'"],
      ['transitionPlanStage', "kind: 'stage'"],
      ['archiveSpacePlan', "kind: 'field'"],
      ['addPlanTodo', "kind: 'todo_added'"],
      ['setPlanTodoDone', "kind: 'todo_done'"],
      ['acceptVeraChecklist', "kind: 'todo_added'"],
      ['sharePlanWithSpace', "kind: 'shared'"],
      ['respondToPlanShare', "kind: 'share_answered'"],
      ['revokePlanShare', "kind: 'share_revoked'"],
      ['postPlanComment', "kind: 'comment'"],
    ] as const) {
      const b = body(source, name)
      expect(b, name).toContain('recordPlanActivity(')
      expect(b, name).toContain(kind)
    }
  })

  it('a date moved or added, an inbox tick and a Vera line each write the record too', () => {
    const entries = readFileSync(dir + 'entry-actions.ts', 'utf8')
    const save = body(entries, 'saveCalendarEntry')
    expect(save).toContain("kind: 'date_moved'")
    expect(save).toContain("kind: 'date_added'")
    const tasks = readFileSync(dir + 'task-actions.ts', 'utf8')
    expect(body(tasks, 'setSpaceTaskDone')).toContain('getTaskInScope(taskId, editor.spaceId)')
    expect(body(tasks, 'setSpaceTaskDone')).toContain("kind: 'todo_done'")
    const vera = readFileSync(dir + 'vera-calendar-actions.ts', 'utf8')
    expect(body(vera, 'applyVeraChanges')).toContain('if (outcome.recordOn)')
    expect(body(vera, 'applyVeraChanges')).toContain('summary: `Through Vera: ${outcome.message}`')
  })

  it('the store is on the session, best effort, and the table is a record gated by the share helpers', () => {
    const store = readFileSync('lib/calendar/plan-activity-store.ts', 'utf8')
    expect(store).toContain("from '@/lib/supabase/server'")
    expect(store).not.toMatch(/createAdminClient|supabase\/admin/)
    expect(store).toContain('export async function recordPlanActivity(input: PlanActivityInput): Promise<void>')
    expect(store).toContain("log.error('calendar.plan_activity.record_failed'")
    const migration = readFileSync('supabase/migrations/20270345009410_space_plan_activity.sql', 'utf8')
    expect(migration).toContain('create table if not exists public.space_plan_activity')
    expect(migration).toContain('private.can_write_plan_host(plan_id)')
    expect(migration).toContain('private.plan_is_shared_with_me(plan_id)')
    expect(migration).toContain('actor_profile_id = private.get_my_profile_id()')
    expect(migration).not.toMatch(/on public\.space_plan_activity\s+for\s+(update|delete)/i)
    expect(migration).toContain('revoke all on table public.space_plan_activity from anon')
    expect(body(source, 'listPlanActivity')).toContain('const side = await planSide(slug, planId)')
  })
})
