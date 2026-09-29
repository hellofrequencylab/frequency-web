import 'server-only'
import { createClient } from '@/lib/supabase/server'
import type { Json } from '@/lib/database.types'
import {
  PLAN_COLS,
  mapPlanRow,
  type PlanWrite,
  type SpacePlan,
} from './plans'
import type { PlanPlaybook } from './playbooks'
import { planAnchorDayKey, type AnchorCandidate } from './relative-schedule'
import { log } from '@/lib/log'

// PLAN IO (ADR-1386). Caller session, so RLS on space_plans is the lock.
//
// ── 🔴 EVERY FAILURE HERE IS LOGGED, AND THE 2026-09-21 OUTAGE IS WHY ───────────────────────
// space_plans shipped with mutually recursive RLS policies, so EVERY statement against it
// aborted with SQLSTATE 42P17. The feature was 100% dead from the day it shipped and nobody
// knew for five days, because this file threw the Postgres error away at every single site:
//
//   * the write paths returned a fixed string ("The Plan could not be saved."), so the owner
//     saw a sentence that could not be searched for and that named no cause;
//   * the READ paths were worse — `catch { return [] }` turned a total outage into an empty
//     state, so the calendar rendered a cheerful "no Plans yet" over a burning database.
//
// A fail-safe that hides the fire is not a fail-safe (AGENTS.md: "a swallowed error is an
// invisible regression"). The fallbacks are KEPT — a calendar that still renders when Plans are
// unavailable is the right behaviour — but every one of them now emits a structured line first,
// so the next failure of this kind is one log query away instead of five days away.


async function db() {
  return await createClient()
}

/**
 * Record a Plan IO failure, then hand back the sentence the owner reads.
 *
 * The user-facing copy stays deliberately plain — a stack trace is not an empty state, and
 * PostgREST messages leak schema. The DIAGNOSIS goes to the log, where `code` is the part that
 * matters: 42P17 is recursive RLS, 42501 is a policy refusal, 23503 is a bad foreign key. Those
 * are three completely different bugs that this file used to report with one identical string.
 */
function planIoFailed(
  op: string,
  message: string,
  error: { message?: string; code?: string; details?: string; hint?: string } | null,
): { error: string } {
  log.error(`calendar.plan.${op}_failed`, {
    db_error: error?.message ?? null,
    // Not always present on a PostgREST error; null is honest and keeps the field queryable.
    db_code: (error as { code?: string } | null)?.code ?? null,
    db_details: (error as { details?: string } | null)?.details ?? null,
    db_hint: (error as { hint?: string } | null)?.hint ?? null,
  })
  return { error: message }
}

/** The read-path twin: a fallback that still renders, but never silently. */
function planReadFailed(op: string, error: unknown): void {
  const e = (error ?? null) as { message?: string; code?: string } | null
  log.error(`calendar.plan.${op}_failed`, {
    db_error: e?.message ?? String(error ?? 'unknown'),
    db_code: e?.code ?? null,
  })
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
    if (error || !data) {
      planReadFailed('list', error)
      return []
    }
    return data.map(mapPlanRow)
  } catch (err) {
    planReadFailed('list', err)
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
    // A missing row is a normal answer here (a deleted or foreign Plan), so only a real error
    // is worth a line. Logging "not found" would bury the failures in routine misses.
    if (error) {
      planReadFailed('get', error)
      return null
    }
    if (!data?.[0]) return null
    return mapPlanRow(data[0])
  } catch (err) {
    planReadFailed('get', err)
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
      // `links` is PlanLink[] and the column is jsonb. PlanLink is a plain {url,label}, so it is
      // valid JSON; TypeScript cannot prove a structural type against the generated recursive
      // `Json` union, so the serialisation boundary says so once, here. `files` is the same story
      // with a plain {assetId,url} (PROG-CAL14).
      links: write.links as unknown as Json,
      files: write.files as unknown as Json,
      space_id: spaceId,
      owner_profile_id: profileId,
      created_by: profileId,
    })
    .select(PLAN_COLS)
  if (error || !data?.[0]) return planIoFailed('insert', 'The Plan could not be saved.', error)
  return { data: mapPlanRow(data[0]) }
}

/** `links` is PlanLink[] and `files` is PlanFile[]; both columns are jsonb, which the generated
 *  types express as `Json`. A PlanLink is a plain {url,label} and a PlanFile a plain {assetId,url},
 *  so both ARE valid JSON; TypeScript cannot prove a structural type against the recursive `Json`
 *  union. The serialisation boundary says so here, once, rather than at every call site, and
 *  nowhere else in this file casts the client. An absent key is left absent, so a partial write
 *  still only touches the columns it names. */
function planWritePayload(write: Partial<PlanWrite> & { archived_at?: string | null }) {
  const { links, files, ...rest } = write
  return {
    ...rest,
    ...(links === undefined ? {} : { links: links as unknown as Json }),
    ...(files === undefined ? {} : { files: files as unknown as Json }),
  }
}

export async function updateSpacePlan(
  spaceId: string,
  planId: string,
  write: Partial<PlanWrite> & { archived_at?: string | null },
): Promise<{ data: SpacePlan } | { error: string }> {
  const { data, error } = await (await db())
    .from('space_plans')
    .update(planWritePayload(write))
    .eq('space_id', spaceId)
    .eq('id', planId)
    .select(PLAN_COLS)
  if (error || !data?.[0]) return planIoFailed('update', 'The Plan could not be saved.', error)
  return { data: mapPlanRow(data[0]) }
}

/**
 * PUT A PLAN AWAY (HYG-120). Sets `archived_at`, which is the one column `listSpacePlans` filters on,
 * so the Plan leaves every list, board and drawer. Its TENTATIVE dates go with it: a pencilled entry
 * that never became an event is deleted, because a Pencil is a hold and an archived Plan holds
 * nothing. A date that already became a published event keeps the event and only drops the link,
 * so nothing a guest can see changes. Entries first, then the Plan, so a failure half-way leaves a
 * live Plan with fewer dates rather than an archived Plan still stacking the grid. All three writes
 * run on the caller's session: RLS is the lock, as everywhere in this file. Reversible in SQL
 * (`archived_at = null`); there is no restore control yet and the drawer copy says so.
 */
export async function archiveSpacePlanRows(
  spaceId: string,
  planId: string,
): Promise<{ data: true } | { error: string }> {
  const client = await db()
  const dropped = await client
    .from('space_calendar_entries')
    .delete()
    .eq('space_id', spaceId)
    .eq('plan_id', planId)
    .is('published_event_id', null)
    // 🔴 STILL A HARD DELETE, ON PURPOSE, AND ONLY OF LIVE DATES (LIVE-536). The Delete button on a
    // date is now a tombstone; THIS path is not, because its own confirmation says in as many words
    // that the dates are deleted and not hidden and that there is no restore control
    // (lib/calendar/vera-command.ts, components/spaces/vera-calendar-box.tsx, both pinned by tests).
    // Softening it silently would make that gate's words false, which is a separate change with its
    // own copy. What the filter DOES fix is the hole the tombstone opened: a date the operator had
    // already deleted is a recoverable row, and archiving its Plan must not be what finally destroys
    // it. Removed dates are left exactly as they were removed.
    .is('removed_at', null)
  if (dropped.error) return planIoFailed('archive_entries', 'The Plan could not be archived.', dropped.error)
  const unlinked = await client
    .from('space_calendar_entries')
    .update({ plan_id: null })
    .eq('space_id', spaceId)
    .eq('plan_id', planId)
    // A tombstone is not edited by an archive: restoring a removed date must give back the row that
    // was removed, Plan link included (LIVE-536).
    .is('removed_at', null)
  if (unlinked.error) return planIoFailed('archive_unlink', 'The Plan could not be archived.', unlinked.error)
  const res = await updateSpacePlan(spaceId, planId, { archived_at: new Date().toISOString() })
  if ('error' in res) return res
  return { data: true }
}

/** Keep the Plan authoritative while mirroring its lifecycle onto every linked calendar entry. */
export async function transitionSpacePlanRows(
  spaceId: string,
  planId: string,
  stage: string,
): Promise<{ data: true } | { error: string }> {
  const { data, error } = await (await db()).rpc('transition_space_plan_stage', {
    p_space_id: spaceId,
    p_plan_id: planId,
    p_stage: stage,
  })
  if (error || data !== true) {
    return planIoFailed('transition', 'The Plan stage could not be changed.', error)
  }
  return { data: true }
}

export async function createPenciledPlanRows(
  spaceId: string,
  title: string,
  entry: PlanPencilEntry,
): Promise<{ data: { planId: string; entryId: string } } | { error: string }> {
  const { data, error } = await (await db()).rpc('create_penciled_plan', {
    p_space_id: spaceId,
    p_title: title,
    p_starts_at: entry.starts_at,
    p_ends_at: entry.ends_at,
    p_time_zone: entry.time_zone,
  })
  const row = Array.isArray(data) ? data[0] : data
  const rec = row && typeof row === 'object' ? (row as Record<string, unknown>) : null
  const planId = typeof rec?.plan_id === 'string' ? rec.plan_id : null
  const entryId = typeof rec?.entry_id === 'string' ? rec.entry_id : null
  if (error || !planId || !entryId) {
    return planIoFailed('pencil', 'The date could not be penciled in.', error)
  }
  return { data: { planId, entryId } }
}

type PlanPencilEntry = {
  starts_at: string
  ends_at: string
  time_zone: string
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
    // A removed date cannot join a Plan: it is not on the calendar (LIVE-536).
    .is('removed_at', null)
    .select('id')
  if (error || !data?.length) {
    return planIoFailed('attach_entry', 'That date could not join the Plan.', error)
  }
  return { data: true }
}

/**
 * THE PLAN'S ANCHOR DAY: the date every relative to-do counts down to (ADR-1386 P5).
 *
 * Read on the CALLER's session, so RLS on space_calendar_entries is the lock, exactly like every
 * other read in this file. The pick itself is pure (`planAnchorDayKey`) because a Pencil may hold
 * several candidate dates and a cancelled one is not a date. Null means the Plan has no live date
 * yet, in which case an offset is stored and simply has nothing to resolve against — it resolves the
 * moment a date is penciled in and the Plan is re-anchored.
 */
export async function getPlanAnchorDayKey(spaceId: string, planId: string): Promise<string | null> {
  try {
    const { data, error } = await ((await db())
      .from('space_calendar_entries')
      .select('starts_at, status, stage')
      .eq('space_id', spaceId)
      .eq('plan_id', planId)
      // A deleted date is not a date to count down to (LIVE-536).
      .is('removed_at', null)
      .limit(50) as unknown as PromiseLike<{
      data: AnchorCandidate[] | null
      error: { message: string } | null
    }>)
    if (error || !data) {
      planReadFailed('anchor_day', error)
      return null
    }
    return planAnchorDayKey(data)
  } catch (err) {
    planReadFailed('anchor_day', err)
    return null
  }
}

/** The date each Plan should open its Production from: its earliest date that has NOT already been
 *  published (PROG-CAL3).
 *
 *  Why this exists at all: `plan-board.tsx` built its "Make it a Production" href from
 *  `{spaceId, planId}` and NO entryId, so `productionPrefill` never ran and the Spark opened with a
 *  title and nothing else — no date, no time, no location, no description. The board has plans, not
 *  dates, so the pairing has to be read; the month window the calendar happens to be showing is not
 *  it, because a Plan's date is usually in another month. */
export async function listPlanPencilEntryIds(spaceId: string): Promise<Record<string, string>> {
  try {
    const { data, error } = await (await db())
      .from('space_calendar_entries')
      .select('id, plan_id, starts_at')
      .eq('space_id', spaceId)
      .eq('kind', 'pencil')
      .is('removed_at', null)
      .is('published_event_id', null)
      .order('starts_at', { ascending: true })
      .limit(500)
    // Logged, never swallowed: this file's header records the five days space_plans was 100%
    // dead behind a `catch { return [] }`. The empty map is still the right fallback (the board
    // renders, "Make it a Production" just opens unprefilled) but the fire gets a line first.
    if (error || !data) {
      planReadFailed('pencil_pairs', error)
      return {}
    }
    const rows = data as unknown as { id: string; plan_id: string | null }[]
    const out: Record<string, string> = {}
    for (const row of rows) {
      if (!row.plan_id || out[row.plan_id]) continue
      out[row.plan_id] = row.id
    }
    return out
  } catch (err) {
    planReadFailed('pencil_pairs', err)
    return {}
  }
}

/** Has any date of this Plan already become a published event? The input to `planPublishLag`, which
 *  is how the best-effort stage transition on the publish seam gets NOTICED when it fails. */
export async function planHasPublishedEntry(spaceId: string, planId: string): Promise<boolean> {
  try {
    const { data, error } = await (await db())
      .from('space_calendar_entries')
      .select('id')
      .eq('space_id', spaceId)
      .eq('plan_id', planId)
      .is('removed_at', null)
      .not('published_event_id', 'is', null)
      .limit(1)
    // A read failure here must not read as "no published event": that is the exact shape of the
    // swallowed error this file's header is about, and here it would silently disarm the GATE on
    // the publish seam's fail-safe (planPublishLag), hiding a lagging Plan instead of showing it.
    if (error || !data) {
      planReadFailed('published_entry', error)
      return false
    }
    return data.length > 0
  } catch (err) {
    planReadFailed('published_entry', err)
    return false
  }
}

/** The events this Plan's dates BECAME (`space_calendar_entries.published_event_id`, PROG-CAL3), read
 *  on the caller's session. The other half of the link is `events.plan_id`
 *  (lib/events/plan-link.ts `listPlanEventIds`); the recap unions both so a link repaired on one
 *  side only still finds its record. Logged, never swallowed, per this file's header. */
export async function listPlanPublishedEventIds(spaceId: string, planId: string): Promise<string[]> {
  try {
    const { data, error } = await (await db())
      .from('space_calendar_entries')
      .select('published_event_id')
      .eq('space_id', spaceId)
      .eq('plan_id', planId)
      .is('removed_at', null)
      .not('published_event_id', 'is', null)
      .limit(50)
    if (error || !data) {
      planReadFailed('published_event_ids', error)
      return []
    }
    const rows = data as unknown as { published_event_id: string | null }[]
    return rows.map((r) => r.published_event_id).filter((id): id is string => !!id)
  } catch (err) {
    planReadFailed('published_event_ids', err)
    return []
  }
}

export async function listPlaybooks(spaceId: string): Promise<PlanPlaybook[]> {
  try {
    const { data, error } = await (await db())
      .from('space_plan_playbooks')
      .select('id, space_id, title, event_type, task_titles, notes')
      .eq('space_id', spaceId)
      .order('title', { ascending: true })
      .limit(50)
    if (error || !data) {
      planReadFailed('list_playbooks', error)
      return []
    }
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
  } catch (err) {
    planReadFailed('list_playbooks', err)
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
  if (error) return planIoFailed('insert_playbook', 'The playbook could not be saved.', error)
  return { data: true }
}

// ── SHARES, THE HANDSHAKE (PROG-CAL7 Together, LIVE-541) ─────────────────────────────────────
//
// Caller session throughout, so the policies on space_plan_shares (20270345007300) are the lock:
// the host of the Plan and the guest Space may both read a share; only the host may insert; both
// may update, and the two update doors below narrow that to what each side may say. The guest
// answers a PENDING share addressed to its own Space; the host takes back an ACTIVE share of its
// own Plan. A Plan shared with a Space is readable by that Space only once the share is accepted
// (`private.plan_is_shared_with_me`), which is why `listPlansSharedWith` reads by the accepted ids
// and why a pending offer carries no Plan of its own here (lib/calendar/plan-share-subjects.ts
// resolves its title and host for the guest, scoped to the rows the session returned).

import { type PlanShareRow, type PlanShareStatus } from './plan-shares'

const SHARE_COLS = 'id, plan_id, guest_space_id, status, requested_by, created_at, responded_at, responded_by'

export async function listPlanShareRows(planId: string): Promise<PlanShareRow[]> {
  try {
    const { data, error } = await (await db()).from('space_plan_shares').select(SHARE_COLS).eq('plan_id', planId).order('created_at', { ascending: true }).limit(100)
    if (error || !data) {
      planReadFailed('shares_list', error)
      return []
    }
    return data as PlanShareRow[]
  } catch (err) {
    planReadFailed('shares_list', err)
    return []
  }
}

export async function getPlanShareRow(shareId: string): Promise<PlanShareRow | null> {
  try {
    const { data, error } = await (await db()).from('space_plan_shares').select(SHARE_COLS).eq('id', shareId).limit(1)
    if (error) {
      planReadFailed('share_get', error)
      return null
    }
    return (data?.[0] as PlanShareRow | undefined) ?? null
  } catch (err) {
    planReadFailed('share_get', err)
    return null
  }
}

/** Offer a Plan to a guest Space. The status is typed to `pending` and nothing else: the guest
 *  answers, never the host for them, and the action spells the state it writes. */
export async function insertPlanShare(share: { planId: string; guestSpaceId: string; requestedBy: string; status: 'pending' }): Promise<{ id: string } | { error: string; code?: string }> {
  try {
    const { data, error } = await (await db())
      .from('space_plan_shares')
      .insert({ plan_id: share.planId, guest_space_id: share.guestSpaceId, status: share.status, requested_by: share.requestedBy })
      .select('id')
      .single()
    if (error || !data) {
      // 23505 is the partial unique index: one pending-or-accepted share per Plan and guest.
      const code = (error as { code?: string } | null)?.code
      return code === '23505' ? { error: 'That Space already has this Plan.', code } : planIoFailed('share', 'That Plan could not be shared.', error)
    }
    return { id: data.id }
  } catch (err) {
    return planIoFailed('share', 'That Plan could not be shared.', err as { message?: string })
  }
}

/**
 * The guest's answer. Keyed by the share id AND the guest Space AND the pending state in one
 * statement, so a share addressed to another Space, or one already answered, changes nothing
 * and says so: the caller reads the count, never a thrown error.
 */
export async function answerPlanShareRow(
  shareId: string,
  guestSpaceId: string,
  answer: Extract<PlanShareStatus, 'accepted' | 'declined'>,
  responderId: string,
): Promise<{ ok: true } | { error: string }> {
  try {
    const { data, error } = await (await db())
      .from('space_plan_shares')
      .update({ status: answer, responded_at: new Date().toISOString(), responded_by: responderId })
      .eq('id', shareId)
      .eq('guest_space_id', guestSpaceId)
      .eq('status', 'pending')
      .select('id')
    if (error) return planIoFailed('share_answer', 'That share could not be answered.', error)
    if (!data || data.length === 0) return { error: 'That share is not waiting for an answer.' }
    return { ok: true }
  } catch (err) {
    return planIoFailed('share_answer', 'That share could not be answered.', err as { message?: string })
  }
}

/** The host takes an active share back. Keyed by the Plan too, so the caller proves the Plan first. */
export async function revokePlanShareRow(shareId: string, planId: string, responderId: string): Promise<{ ok: true } | { error: string }> {
  try {
    const { data, error } = await (await db())
      .from('space_plan_shares')
      .update({ status: 'revoked', responded_at: new Date().toISOString(), responded_by: responderId })
      .eq('id', shareId)
      .eq('plan_id', planId)
      .in('status', ['pending', 'accepted'])
      .select('id')
    if (error) return planIoFailed('share_revoke', 'That share could not be taken back.', error)
    if (!data || data.length === 0) return { error: 'That share is not active.' }
    return { ok: true }
  } catch (err) {
    return planIoFailed('share_revoke', 'That share could not be taken back.', err as { message?: string })
  }
}

/** Every offer and acceptance addressed to a guest Space, newest first. Declined and revoked
 *  shares are history and stay out of the guest's view. */
export async function listIncomingPlanShareRows(guestSpaceId: string): Promise<PlanShareRow[]> {
  try {
    const { data, error } = await (await db())
      .from('space_plan_shares')
      .select(SHARE_COLS)
      .eq('guest_space_id', guestSpaceId)
      .in('status', ['pending', 'accepted'])
      .order('created_at', { ascending: false })
      .limit(50)
    if (error || !data) {
      planReadFailed('shares_incoming', error)
      return []
    }
    return data as PlanShareRow[]
  } catch (err) {
    planReadFailed('shares_incoming', err)
    return []
  }
}

/** The ids of the Plans a Space works through an ACCEPTED share. */
export async function listSharedPlanIds(spaceId: string): Promise<string[]> {
  const rows = await listIncomingPlanShareRows(spaceId)
  return [...new Set(rows.filter((r) => r.status === 'accepted').map((r) => r.plan_id))]
}

/** The Plans shared with a Space, read on the session: RLS admits them through the accepted share
 *  and nothing else, so an id that slipped in some other way comes back empty. */
export async function listPlansSharedWith(spaceId: string): Promise<SpacePlan[]> {
  const ids = await listSharedPlanIds(spaceId)
  if (ids.length === 0) return []
  try {
    const { data, error } = await (await db())
      .from('space_plans')
      .select(PLAN_COLS)
      .in('id', ids)
      .is('archived_at', null)
      .order('updated_at', { ascending: false })
      .limit(100)
    if (error || !data) {
      planReadFailed('shared_list', error)
      return []
    }
    return data.map(mapPlanRow)
  } catch (err) {
    planReadFailed('shared_list', err)
    return []
  }
}
