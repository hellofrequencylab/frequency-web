import 'server-only'
import { createClient } from '@/lib/supabase/server'
import {
  PLAN_COLS,
  mapPlanRow,
  type PlanWrite,
  type SpacePlan,
} from './plans'
import { copyPlaybookToPlan, type PlanPlaybook } from './playbooks'
import { buildVeraProposal } from './vera-plan'

// PLAN IO (ADR-1386). Caller session, so RLS on space_plans is the lock.

type Untyped = {
  from: (t: string) => {
    select: (cols: string) => PlanQuery
    insert: (rows: Record<string, unknown> | Record<string, unknown>[]) => PromiseLike<{
      data: unknown[] | null
      error: { message: string } | null
    }> & {
      select: (c: string) => PromiseLike<{ data: PlanRow[] | null; error: { message: string } | null }>
    }
    update: (row: Record<string, unknown>) => PlanQuery
    delete: () => PlanQuery
  }
}

type PlanRow = Parameters<typeof mapPlanRow>[0]

type PlanQuery = PromiseLike<{ data: PlanRow[] | null; error: { message: string } | null }> & {
  select: (c: string) => PlanQuery
  eq: (c: string, v: string) => PlanQuery
  is: (c: string, v: null) => PlanQuery
  order: (c: string, o: { ascending: boolean }) => PlanQuery
  limit: (n: number) => PlanQuery
}

async function db(): Promise<Untyped> {
  return (await createClient()) as unknown as Untyped
}

export async function listSpacePlans(spaceId: string): Promise<SpacePlan[]> {
  try {
    const { data, error } = await (await db())
      .from('space_plans')
      .select(PLAN_COLS)
      .eq('space_id', spaceId)
      .is('archived_at', null)
      .order('updated_at', { ascending: false })
      .limit(200)
    if (error || !data) return []
    return data.map(mapPlanRow)
  } catch {
    return []
  }
}

export async function getSpacePlan(spaceId: string, planId: string): Promise<SpacePlan | null> {
  try {
    const { data, error } = await (await db())
      .from('space_plans')
      .select(PLAN_COLS)
      .eq('space_id', spaceId)
      .eq('id', planId)
      .limit(1)
    if (error || !data?.[0]) return null
    return mapPlanRow(data[0])
  } catch {
    return null
  }
}

export async function insertSpacePlan(
  spaceId: string,
  write: PlanWrite,
  profileId: string,
): Promise<{ data: SpacePlan } | { error: string }> {
  const { data, error } = await (await db())
    .from('space_plans')
    .insert({
      ...write,
      space_id: spaceId,
      owner_profile_id: profileId,
      created_by: profileId,
    })
    .select(PLAN_COLS)
  if (error || !data?.[0]) return { error: 'The Plan could not be saved.' }
  return { data: mapPlanRow(data[0]) }
}

export async function updateSpacePlan(
  spaceId: string,
  planId: string,
  write: Partial<PlanWrite> & { archived_at?: string | null },
): Promise<{ data: SpacePlan } | { error: string }> {
  const { data, error } = await (await db())
    .from('space_plans')
    .update(write)
    .eq('space_id', spaceId)
    .eq('id', planId)
    .select(PLAN_COLS)
  if (error || !data?.[0]) return { error: 'The Plan could not be saved.' }
  return { data: mapPlanRow(data[0]) }
}

export async function attachEntryToPlan(
  spaceId: string,
  entryId: string,
  planId: string,
): Promise<{ data: true } | { error: string }> {
  const { data, error } = await (await db())
    .from('space_calendar_entries')
    .update({ plan_id: planId })
    .eq('space_id', spaceId)
    .eq('id', entryId)
    .select('id')
  if (error || !data?.length) return { error: 'That date could not join the Plan.' }
  return { data: true }
}

export async function listPlaybooks(spaceId: string): Promise<PlanPlaybook[]> {
  try {
    const { data, error } = await (await db())
      .from('space_plan_playbooks')
      .select('id, space_id, title, event_type, task_titles, notes')
      .eq('space_id', spaceId)
      .order('title', { ascending: true })
      .limit(50)
    if (error || !data) return []
    const rows = data as unknown as {
      id: string
      space_id: string
      title: string
      event_type: string
      task_titles: string[] | null
      notes: string | null
    }[]
    return rows.map((r) => ({
      id: r.id,
      spaceId: r.space_id,
      title: r.title,
      eventType: r.event_type,
      taskTitles: r.task_titles ?? [],
      notes: r.notes,
    }))
  } catch {
    return []
  }
}

export async function insertPlaybook(
  spaceId: string,
  playbook: { title: string; eventType: string; taskTitles: string[]; notes: string | null },
  profileId: string,
): Promise<{ data: true } | { error: string }> {
  const { error } = await (await db()).from('space_plan_playbooks').insert({
    space_id: spaceId,
    title: playbook.title,
    event_type: playbook.eventType,
    task_titles: playbook.taskTitles,
    notes: playbook.notes,
    created_by: profileId,
  })
  if (error) return { error: 'The playbook could not be saved.' }
  return { data: true }
}

export function seedPlanFromPlaybook(playbook: PlanPlaybook) {
  return copyPlaybookToPlan(playbook)
}

export function veraProposalForPlan(opts: Parameters<typeof buildVeraProposal>[0]) {
  return buildVeraProposal(opts)
}
