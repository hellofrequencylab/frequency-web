import 'server-only'
import { createClient } from '@/lib/supabase/server'
import { log } from '@/lib/log'
import { boundSummary, type PlanActivityInput, type PlanActivityRow } from './plan-activity'

// ACTIVITY IO (PROG-CAL7 Together, LIVE-543). Caller session, never the admin client: RLS on
// space_plan_activity (20270345009410) admits exactly the host and an accepted guest through the
// 20270345007300 share helpers, and signs the actor from the session.
//
// BEST EFFORT, NEVER SILENT. A row that fails to write must not fail the change it describes (the
// change already landed), so `recordPlanActivity` returns nothing. It logs one structured line
// first, because a record that goes quiet is the invisible regression AGENTS.md names.

const ACTIVITY_COLS = 'id, plan_id, actor_profile_id, actor_space_id, kind, summary, created_at'
const READ_LIMIT = 100

async function db() {
  return await createClient()
}

/** Write one row after a change landed. Every door that changes a Plan calls this. */
export async function recordPlanActivity(input: PlanActivityInput): Promise<void> {
  try {
    const { error } = await (await db()).from('space_plan_activity').insert({
      plan_id: input.planId,
      actor_profile_id: input.actorProfileId,
      actor_space_id: input.actorSpaceId,
      kind: input.kind,
      summary: boundSummary(input.summary),
    })
    if (error) {
      log.error('calendar.plan_activity.record_failed', {
        plan_id: input.planId,
        kind: input.kind,
        db_error: error.message ?? null,
        db_code: (error as { code?: string }).code ?? null,
      })
    }
  } catch (err) {
    log.error('calendar.plan_activity.record_failed', {
      plan_id: input.planId,
      kind: input.kind,
      db_error: err instanceof Error ? err.message : String(err),
      db_code: null,
    })
  }
}

/** The latest rows of a Plan the session may read, newest first. */
export async function listPlanActivityRows(planId: string): Promise<PlanActivityRow[]> {
  try {
    const { data, error } = await (await db())
      .from('space_plan_activity')
      .select(ACTIVITY_COLS)
      .eq('plan_id', planId)
      .order('created_at', { ascending: false })
      .limit(READ_LIMIT)
    if (error || !data) {
      log.error('calendar.plan_activity.list_failed', { plan_id: planId, db_error: error?.message ?? null, db_code: (error as { code?: string } | null)?.code ?? null })
      return []
    }
    return data as PlanActivityRow[]
  } catch (err) {
    log.error('calendar.plan_activity.list_failed', { plan_id: planId, db_error: err instanceof Error ? err.message : String(err), db_code: null })
    return []
  }
}
