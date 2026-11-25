import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'
import { log } from '@/lib/log'
import { formatEventWhen } from '@/lib/time/zone'
import { verifyTimeVoteToken } from './time-vote-token'
import { isTimeVoteChoice, type TimeVoteChoice } from './time-votes'
import { notifyTimeVote } from './time-vote-notify'

// FIND A TIME FROM AN EMAIL LINK (EMAIL-092), the IO half. There is no session: the signed link IS
// the authorisation, so every function here verifies it FIRST and then touches exactly one Plan's
// live candidate dates and exactly one email address's answers, under the service role. Nothing the
// browser sends widens that: the Plan and the address come out of the verified token, and an entry
// id the browser names must be one of that Plan's live candidate dates or the write is refused.
// A bad, forged or expired link and an archived Plan all answer the same way, so a stranger learns
// nothing about which Plans exist.

interface GuestTimeOption {
  entryId: string
  whenLabel: string
  mine: TimeVoteChoice | null
}

export interface GuestPoll {
  planTitle: string
  spaceName: string
  email: string
  name: string | null
  options: GuestTimeOption[]
}

interface PlanRow {
  id: string
  space_id: string
  title: string
  archived_at: string | null
  owner_profile_id: string | null
  created_by: string | null
}
interface OptionRow {
  id: string
  starts_at: string
  time_zone: string
  all_day: boolean
}

/** The admin client, reached untyped for the tables lib/database.types.ts does not carry yet. */
type Loose = {
  from: (t: string) => {
    select: (c: string) => LooseQuery
    insert: (row: Record<string, unknown>) => PromiseLike<{ error: { message: string } | null }>
    update: (row: Record<string, unknown>) => LooseQuery
    delete: () => LooseQuery
  }
}
type LooseQuery = PromiseLike<{ data: unknown; error: { message: string } | null }> & {
  eq: (c: string, v: string) => LooseQuery
  in: (c: string, v: readonly string[]) => LooseQuery
  is: (c: string, v: null) => LooseQuery
  order: (c: string, o: { ascending: boolean }) => LooseQuery
  limit: (n: number) => LooseQuery
}

function admin(): Loose {
  return createAdminClient() as unknown as Loose
}

async function readPoll(token: unknown): Promise<{ plan: PlanRow; email: string; spaceName: string; spaceSlug: string; rows: OptionRow[] } | null> {
  const t = verifyTimeVoteToken(token)
  if (!t) return null
  const db = admin()
  const planRes = await db
    .from('space_plans')
    .select('id, space_id, title, archived_at, owner_profile_id, created_by')
    .eq('id', t.planId)
    .limit(1)
  const plan = ((planRes.data as PlanRow[] | null) ?? [])[0]
  if (planRes.error || !plan || plan.archived_at) return null
  const [spaceRes, rowsRes] = await Promise.all([
    db.from('spaces').select('name, slug').eq('id', plan.space_id).limit(1),
    db
      .from('space_calendar_entries')
      .select('id, starts_at, time_zone, all_day')
      .eq('space_id', plan.space_id)
      .eq('plan_id', plan.id)
      .eq('kind', 'pencil')
      .is('removed_at', null)
      .is('published_event_id', null)
      .order('starts_at', { ascending: true })
      .limit(12),
  ])
  const space = ((spaceRes.data as { name: string; slug: string }[] | null) ?? [])[0]
  if (spaceRes.error || rowsRes.error || !space) {
    log.warn('calendar.time_vote_guest.read_failed', { plan_id: plan.id })
    return null
  }
  return { plan, email: t.email, spaceName: space.name, spaceSlug: space.slug, rows: (rowsRes.data as OptionRow[] | null) ?? [] }
}

const whenOf = (r: OptionRow) => formatEventWhen(r.starts_at, r.time_zone, { style: r.all_day ? 'date' : 'full' })

/** The Plan's candidate dates and this address's answers, or null for any link that does not open. */
export async function loadGuestPoll(token: unknown): Promise<GuestPoll | null> {
  try {
    const poll = await readPoll(token)
    if (!poll) return null
    const votes = poll.rows.length
      ? await admin()
          .from('space_calendar_time_votes')
          .select('entry_id, choice, voter_name')
          .eq('voter_email', poll.email)
          .in('entry_id', poll.rows.map((r) => r.id))
          .limit(50)
      : { data: [], error: null }
    const mine = new Map<string, TimeVoteChoice>()
    let name: string | null = null
    for (const v of (votes.data as { entry_id: string; choice: string; voter_name: string | null }[] | null) ?? []) {
      if (isTimeVoteChoice(v.choice)) mine.set(v.entry_id, v.choice)
      name = name ?? v.voter_name
    }
    return {
      planTitle: poll.plan.title,
      spaceName: poll.spaceName,
      email: poll.email,
      name,
      options: poll.rows.map((r) => ({ entryId: r.id, whenLabel: whenOf(r), mine: mine.get(r.id) ?? null })),
    }
  } catch (err) {
    log.warn('calendar.time_vote_guest.load_failed', { error: err instanceof Error ? err.message : String(err) })
    return null
  }
}

/** Save this address's answer on one candidate date (null takes it back). The Plan's lead hears
 *  about a new answer. */
export async function saveGuestVote(
  token: unknown,
  entryId: unknown,
  choice: unknown,
  rawName: unknown,
): Promise<{ ok: true } | { error: string }> {
  try {
    const poll = await readPoll(token)
    if (!poll) return { error: 'This link is invalid or expired.' }
    const row = poll.rows.find((r) => r.id === entryId)
    if (!row) return { error: 'That date is no longer an option.' }
    if (choice !== null && !isTimeVoteChoice(choice)) return { error: 'Answer Yes, If need be or No.' }
    const name = typeof rawName === 'string' ? rawName.replace(/\s+/g, ' ').trim().slice(0, 120) || null : null
    const db = admin()
    const existing = await db
      .from('space_calendar_time_votes')
      .select('id')
      .eq('entry_id', row.id)
      .eq('voter_email', poll.email)
      .limit(1)
    if (existing.error) return { error: 'Your answer could not be saved.' }
    const had = ((existing.data as { id: string }[] | null) ?? [])[0]
    const res =
      choice === null
        ? had
          ? await db.from('space_calendar_time_votes').delete().eq('id', had.id)
          : { error: null }
        : had
          ? await db.from('space_calendar_time_votes').update({ choice, voter_name: name }).eq('id', had.id)
          : await db.from('space_calendar_time_votes').insert({
              space_id: poll.plan.space_id,
              entry_id: row.id,
              voter_email: poll.email,
              voter_name: name,
              choice,
            })
    if (res.error) {
      log.warn('calendar.time_vote_guest.write_failed', { plan_id: poll.plan.id, error: res.error.message })
      return { error: 'Your answer could not be saved.' }
    }
    if (choice !== null) {
      await notifyTimeVote({
        spaceSlug: poll.spaceSlug,
        planId: poll.plan.id,
        planTitle: poll.plan.title,
        leadProfileId: poll.plan.owner_profile_id ?? poll.plan.created_by,
        voterProfileId: null,
        voterName: name ?? poll.email,
        choice,
        whenLabel: whenOf(row),
      })
    }
    return { ok: true }
  } catch (err) {
    log.warn('calendar.time_vote_guest.save_failed', { error: err instanceof Error ? err.message : String(err) })
    return { error: 'Your answer could not be saved.' }
  }
}
