import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'
import { log } from '@/lib/log'
import type { WorkSpace, WorkTodo } from '@/lib/work/rollup-core'
import { inboxTodos, type InboxTodoRow } from './inbox'

// THE INBOX TO-DOS VIEW, the read half (SCAN-1347, owner ruling 2026-11-25: "To-dos tab in the
// Inbox"). Two reads: the open Plan to-dos handed to the viewer, and the open unclaimed to-dos on
// live Plans the viewer owns (the same people the overdue nudge falls back to). Then the Spaces and
// Plan titles they hang off. The pure join and order is inboxTodos in ./inbox.
//
// authz-delegated: every query is bound to the caller's own profile id, which the page reads from
// the signed-in session (getMyProfileId) and never from a request. Only the viewer's own to-dos and
// the to-dos on Plans they own come back.

const TODO_LIMIT = 100
const COLS = 'id, title, due_at, space_id, plan_id'

export async function loadInboxTodos(profileId: string, now: Date): Promise<WorkTodo[]> {
  const db = createAdminClient()
  const [mine, owned] = await Promise.all([
    db.from('crm_tasks').select(COLS).eq('status', 'open').eq('assignee_profile_id', profileId).not('space_id', 'is', null).limit(TODO_LIMIT),
    db.from('space_plans').select('id, title').eq('owner_profile_id', profileId).is('archived_at', null).limit(TODO_LIMIT),
  ])
  if (mine.error || owned.error) {
    log.error('notifications.inbox.todos_failed', { db_error: (mine.error ?? owned.error)?.message ?? null })
    return []
  }
  const ownedPlans = (owned.data ?? []) as unknown as { id: string; title: string }[]
  let unclaimed: InboxTodoRow[] = []
  if (ownedPlans.length > 0) {
    const { data, error } = await db
      .from('crm_tasks')
      .select(COLS)
      .eq('status', 'open')
      .is('assignee_profile_id', null)
      .in(
        'plan_id',
        ownedPlans.map((p) => p.id),
      )
      .limit(TODO_LIMIT)
    if (error) log.error('notifications.inbox.todos_unclaimed_failed', { db_error: error.message })
    else unclaimed = (data ?? []) as unknown as InboxTodoRow[]
  }
  const rows = [...((mine.data ?? []) as unknown as InboxTodoRow[]), ...unclaimed]
  if (rows.length === 0) return []

  const plans = new Map(ownedPlans.map((p) => [p.id, p.title]))
  const otherPlanIds = [...new Set(rows.map((r) => r.plan_id).filter((id): id is string => Boolean(id) && !plans.has(id as string)))]
  const spaceIds = [...new Set(rows.map((r) => r.space_id))]
  const [planRows, spaceRows] = await Promise.all([
    otherPlanIds.length > 0 ? db.from('space_plans').select('id, title').in('id', otherPlanIds).is('archived_at', null) : Promise.resolve({ data: [], error: null }),
    db.from('spaces').select('id, slug, name').in('id', spaceIds),
  ])
  if (planRows.error || spaceRows.error) {
    log.error('notifications.inbox.todos_join_failed', { db_error: (planRows.error ?? spaceRows.error)?.message ?? null })
    return []
  }
  for (const p of (planRows.data ?? []) as unknown as { id: string; title: string }[]) plans.set(p.id, p.title)
  const spaces = new Map(((spaceRows.data ?? []) as unknown as WorkSpace[]).map((s) => [s.id, s]))
  return inboxTodos(rows, spaces, plans, now)
}
