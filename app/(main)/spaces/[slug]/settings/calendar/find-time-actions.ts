'use server'

import { getCallerProfile } from '@/lib/auth'
import { getVisibleSpaceBySlug } from '@/lib/spaces/store'
import { getSpaceCapabilities } from '@/lib/spaces/entitlements'
import { spaceFunctionAccess } from '@/lib/spaces/functions'
import { fail, ok, type ActionResult } from '@/lib/action-result'
import { getSpacePlan } from '@/lib/calendar/plans-store'
import { resolveCommentAuthors } from '@/lib/calendar/plan-comments-store'
import {
  joinOptionGroupRows,
  listPlanTimeOptionRows,
  listSpaceYesVotes,
  listTimeVoteRows,
  setMyTimeVoteRow,
} from '@/lib/calendar/time-votes-store'
import { insertCalendarEntries, listSpaceCalendarEntries } from '@/lib/calendar/entries-store'
import { MAX_CANDIDATE_DATES, parseEntryInput } from '@/lib/calendar/entries'
import { listSpaceEventSpans } from '@/lib/calendar/admin-calendar'
import { availabilityWindow } from '@/lib/calendar/availability'
import { recordPlanActivity } from '@/lib/calendar/plan-activity-store'
import { shortDateLabel } from '@/lib/calendar/short-date'
import { suggestTimes, wallSpanOf, type PastYes, type SuggestPerson, type WallSpan } from '@/lib/calendar/suggest-times'
import { listTasks } from '@/lib/crm/tasks'
import { dayInZone } from '@/lib/time/zone'
import { notifyTimeVote } from '@/lib/calendar/time-vote-notify'
import { countVoters, parseTimeVote, rankTimeOptions, voterKey, type TimeOptionTally } from '@/lib/calendar/time-votes'
import type { EntryRow } from '@/lib/calendar/entries'
import type { SpacePlan } from '@/lib/calendar/plans'
import { formatEventWhen } from '@/lib/time/zone'
import { getSpaceById } from '@/lib/spaces/store'
import { buildTimeVoteInviteEmail, enqueueEmail } from '@/lib/email'
import { normalizeVoteEmail, signTimeVoteToken, timeVotePath } from '@/lib/calendar/time-vote-token'

// FIND A TIME (LIVE-2531): the Plan drawer's poll. The Space's team answers each candidate date
// Yes, If need be or No, and the drawer lists the dates best first. Every read and write runs on the
// caller's own session, so the votes table's RLS is the lock; the gate below only decides whether to
// ask at all and gives a sentence instead of an empty poll.

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export interface FindATimeView {
  options: TimeOptionTally[]
  /** How many different people have answered. */
  voters: number
}

interface PlanSeat {
  spaceId: string
  slug: string
  profileId: string
  plan: SpacePlan
}

async function planSeat(slug: string, planId: string): Promise<PlanSeat | { error: string }> {
  if (typeof slug !== 'string' || typeof planId !== 'string' || !UUID_RE.test(planId)) return { error: 'That Plan no longer exists.' }
  const caller = await getCallerProfile()
  if (!caller?.id) return { error: 'Sign in to answer.' }
  const space = await getVisibleSpaceBySlug(slug, caller.id)
  if (!space) return { error: 'You do not have access to this calendar.' }
  const caps = await getSpaceCapabilities(space, caller.id)
  if (!caps.canEditProfile || !spaceFunctionAccess(space, 'events', caps.role)) return { error: 'You do not have access to this calendar.' }
  const plan = await getSpacePlan(space.id, planId)
  if (!plan) return { error: 'That Plan no longer exists.' }
  return { spaceId: space.id, slug: space.slug, profileId: caller.id, plan }
}

/** "Sat, Dec 6 · 7:00 PM", or the date alone for an all-day hold. */
function optionWhen(row: Pick<EntryRow, 'starts_at' | 'time_zone' | 'all_day'>): string {
  return formatEventWhen(row.starts_at, row.time_zone, { style: row.all_day ? 'date' : 'full' })
}

async function buildView(seat: PlanSeat): Promise<{ view: FindATimeView; rows: EntryRow[] }> {
  const rows = await listPlanTimeOptionRows(seat.spaceId, seat.plan.id)
  const votes = await listTimeVoteRows(rows.map((r) => r.id))
  const names = await resolveCommentAuthors(votes.map((v) => v.voter_profile_id).filter((id): id is string => !!id))
  // The person who runs the Plan must be there: their No sinks an option below the rest.
  const lead = seat.plan.ownerProfileId ?? seat.plan.createdBy
  const options = rankTimeOptions(
    rows.map((r) => ({ entryId: r.id, startsAt: r.starts_at, whenLabel: optionWhen(r) })),
    votes,
    {
      required: lead ? [voterKey({ voter_profile_id: lead, voter_email: null })] : [],
      me: voterKey({ voter_profile_id: seat.profileId, voter_email: null }),
      nameOf: (v) =>
        (v.voter_profile_id ? names.get(v.voter_profile_id) : null) ?? v.voter_name ?? v.voter_email ?? 'Someone on the team',
    },
  )
  return { view: { options, voters: countVoters(votes) }, rows }
}

/** The Plan's candidate dates, ranked best first, with the caller's own answers marked. */
export async function loadFindATime(slug: string, planId: string): Promise<ActionResult<FindATimeView>> {
  const seat = await planSeat(slug, planId)
  if ('error' in seat) return fail(seat.error)
  return ok((await buildView(seat)).view)
}

/** Answer one candidate date Yes, If need be or No (or take the answer back with null). The Plan's
 *  lead hears about a new answer in their notifications; nobody hears about their own. */
export async function castTimeVote(slug: string, planId: string, raw: unknown): Promise<ActionResult<FindATimeView>> {
  const seat = await planSeat(slug, planId)
  if ('error' in seat) return fail(seat.error)
  const vote = parseTimeVote(raw)
  if ('error' in vote) return fail(vote.error)
  const rows = await listPlanTimeOptionRows(seat.spaceId, seat.plan.id)
  const row = rows.find((r) => r.id === vote.entryId)
  if (!row) return fail('That date is no longer an option.')
  const res = await setMyTimeVoteRow(seat.spaceId, row.id, seat.profileId, vote.choice)
  if ('error' in res) return fail(res.error)
  if (vote.choice) {
    await notifyTimeVote({
      spaceSlug: seat.slug,
      planId: seat.plan.id,
      planTitle: seat.plan.title,
      leadProfileId: seat.plan.ownerProfileId ?? seat.plan.createdBy,
      voterProfileId: seat.profileId,
      voterName: null,
      choice: vote.choice,
      whenLabel: optionWhen(row),
    })
  }
  return ok((await buildView(seat)).view)
}

// ── VERA SUGGESTS TIMES (LIVE-2532) ─────────────────────────────────────────────────────────────
// Three dates and times for the people this Plan needs, each with one line of why. A proposal only
// (ADR-1386): "Add as an option" pencils one in beside the Plan's other candidate dates, where the
// team votes on it like any other. Nothing is booked and nobody is invited.

export interface TimeSuggestionView {
  /** The people Vera planned around, by name. */
  forNames: string[]
  options: { startsAt: string; durationMin: number; whenLabel: string; reason: string }[]
  /** How many more options the Plan can take before it holds three. */
  room: number
}

const pad = (n: number) => String(n).padStart(2, '0')

/** Who has to be there: the Plan's lead, everyone a to-do of the Plan is handed to, and everyone on
 *  the team who has answered its Find a time. */
async function planPeople(seat: PlanSeat, optionIds: readonly string[]): Promise<{ people: SuggestPerson[]; todos: Awaited<ReturnType<typeof listTasks>> }> {
  const [planTodos, votes, spaceTodos] = await Promise.all([
    listTasks({ spaceId: seat.spaceId, planId: seat.plan.id, limit: 200 }),
    listTimeVoteRows(optionIds),
    listTasks({ spaceId: seat.spaceId, limit: 500 }),
  ])
  const ids = new Set<string>()
  const lead = seat.plan.ownerProfileId ?? seat.plan.createdBy
  if (lead) ids.add(lead)
  for (const t of planTodos) if (t.assigneeProfileId) ids.add(t.assigneeProfileId)
  for (const v of votes) if (v.voter_profile_id) ids.add(v.voter_profile_id)
  const names = await resolveCommentAuthors([...ids])
  return {
    people: [...ids].slice(0, 12).map((id) => ({ id, name: names.get(id) ?? 'Someone on the team' })),
    todos: spaceTodos,
  }
}

export async function suggestPlanTimes(slug: string, planId: string): Promise<ActionResult<TimeSuggestionView>> {
  const seat = await planSeat(slug, planId)
  if ('error' in seat) return fail(seat.error)
  const [options, space] = await Promise.all([listPlanTimeOptionRows(seat.spaceId, seat.plan.id), getSpaceById(seat.spaceId)])
  const zone = options[0]?.time_zone ?? space?.timeZone ?? null
  const today = dayInZone(new Date(), zone)
  const window = availabilityWindow(today, 30)
  const [{ people, todos }, entries, events, pastYesRows] = await Promise.all([
    planPeople(seat, options.map((o) => o.id)),
    listSpaceCalendarEntries(seat.spaceId, window.fromDay, window.toDay),
    listSpaceEventSpans(seat.spaceId),
    listSpaceYesVotes(seat.spaceId),
  ])

  // The Space's calendar, the Plan's own candidate dates included, so Vera never offers one twice.
  const spaceBusy: WallSpan[] = [
    ...entries.filter((e) => e.status !== 'cancelled').map((e) => wallSpanOf(e.starts_at, e.ends_at)),
    ...events.filter((e) => !e.is_cancelled).map((e) => wallSpanOf(e.starts_at, e.ends_at)),
  ].filter((s): s is WallSpan => s !== null)

  // Each person's own time: a to-do with a start minute is a block of their day; any open to-do
  // due on a day makes that day a heavier one for them.
  const personBusy: Record<string, WallSpan[]> = {}
  const personDueDays: Record<string, string[]> = {}
  for (const t of todos) {
    if (t.status !== 'open' || !t.assigneeProfileId || !t.dueAt) continue
    const day = t.dueAt.slice(0, 10)
    ;(personDueDays[t.assigneeProfileId] ??= []).push(day)
    if (typeof t.startMinute === 'number') {
      const start = Date.parse(`${day}T00:00:00Z`) + t.startMinute * 60_000
      ;(personBusy[t.assigneeProfileId] ??= []).push({ startMs: start, endMs: start + (t.estMinutes || 30) * 60_000 })
    }
  }

  const pastYes: PastYes[] = pastYesRows
    .filter((v) => !v.allDay)
    .map((v) => {
      const d = new Date(Date.parse(v.startsAt))
      return { profileId: v.profileId, weekday: d.getUTCDay(), startMin: d.getUTCHours() * 60 + d.getUTCMinutes() }
    })

  // As long as the Plan's own date runs, else an hour.
  const first = options.find((o) => !o.all_day)
  const firstSpan = first ? wallSpanOf(first.starts_at, first.ends_at) : null
  const durationMin = firstSpan ? Math.round((firstSpan.endMs - firstSpan.startMs) / 60_000) : 60

  const picks = suggestTimes({ people, fromDayKey: today, durationMin, spaceBusy, personBusy, personDueDays, pastYes })
  return ok({
    forNames: people.map((p) => p.name),
    options: picks.map((p) => ({
      startsAt: p.startsAt,
      durationMin,
      whenLabel: formatEventWhen(p.startsAt, zone, { style: 'full' }),
      reason: p.reason,
    })),
    room: Math.max(0, MAX_CANDIDATE_DATES - options.length),
  })
}

/** Pencil one of Vera's suggested times in as another candidate date of the Plan. */
export async function addSuggestedTime(
  slug: string,
  planId: string,
  raw: { startsAt?: unknown; durationMin?: unknown },
): Promise<ActionResult<FindATimeView>> {
  const seat = await planSeat(slug, planId)
  if ('error' in seat) return fail(seat.error)
  const span = typeof raw?.startsAt === 'string' ? wallSpanOf(raw.startsAt, null) : null
  const duration = typeof raw?.durationMin === 'number' && Number.isInteger(raw.durationMin) ? raw.durationMin : 60
  if (!span || duration < 15 || duration > 8 * 60) return fail('That time is not one Vera offered.')
  const options = await listPlanTimeOptionRows(seat.spaceId, seat.plan.id)
  if (options.length >= MAX_CANDIDATE_DATES) return fail(`A Plan can hold ${MAX_CANDIDATE_DATES} dates at most. Remove one first.`)
  const start = new Date(span.startMs)
  const day = start.toISOString().slice(0, 10)
  const startMin = start.getUTCHours() * 60 + start.getUTCMinutes()
  const endMin = Math.min(startMin + duration, 1439)
  const space = await getSpaceById(seat.spaceId)
  const zone = options[0]?.time_zone ?? space?.timeZone ?? ''
  const parsed = parseEntryInput({
    kind: 'pencil',
    title: seat.plan.title,
    allDay: false,
    startDate: day,
    endDate: day,
    startTime: `${pad(Math.floor(startMin / 60))}:${pad(startMin % 60)}`,
    endTime: `${pad(Math.floor(endMin / 60))}:${pad(endMin % 60)}`,
    timeZone: zone,
    stage: 'pencil',
    blocksTime: false,
    showPublicly: false,
    planId: seat.plan.id,
  })
  if ('error' in parsed) return fail(parsed.error)
  const group = options.find((o) => o.option_group)?.option_group ?? crypto.randomUUID()
  const loose = options.filter((o) => o.option_group !== group).map((o) => o.id)
  if (!(await joinOptionGroupRows(seat.spaceId, loose, group))) return fail('The date could not be added.')
  const res = await insertCalendarEntries(seat.spaceId, [parsed.data], seat.profileId, group)
  if ('error' in res) return fail(res.error)
  await recordPlanActivity({
    planId: seat.plan.id,
    actorProfileId: seat.profileId,
    actorSpaceId: seat.spaceId,
    kind: 'date_added',
    summary: `Added a date Vera suggested: ${shortDateLabel(day)}.`,
  })
  return ok((await buildView(seat)).view)
}

// ── ASK SOMEONE OUTSIDE BY EMAIL (EMAIL-092) ────────────────────────────────────────────────────
// Email is the only outside channel for now (owner ruling 2026-11-24). The team names an address and
// that person gets a link, good for three weeks, that opens this Plan's candidate dates with no
// account. Their answers land beside the team's, under their email address.

export async function inviteTimeVoteByEmail(
  slug: string,
  planId: string,
  raw: { email?: unknown; name?: unknown },
): Promise<ActionResult<{ email: string }>> {
  const seat = await planSeat(slug, planId)
  if ('error' in seat) return fail(seat.error)
  const email = normalizeVoteEmail(raw?.email)
  if (!email) return fail('That is not an email address.')
  const name = typeof raw?.name === 'string' ? raw.name.replace(/\s+/g, ' ').trim().slice(0, 80) || null : null
  const rows = await listPlanTimeOptionRows(seat.spaceId, seat.plan.id)
  if (rows.length < 2) return fail('Hold at least two dates before you ask anyone to pick.')
  const token = signTimeVoteToken(seat.plan.id, email)
  if (!token) return fail('That is not an email address.')
  const [space, me] = await Promise.all([getSpaceById(seat.spaceId), resolveCommentAuthors([seat.profileId])])
  try {
    await enqueueEmail(
      buildTimeVoteInviteEmail({
        to: email,
        recipientName: name,
        spaceName: space?.name ?? 'A Space on Frequency',
        planTitle: seat.plan.title,
        whenLabels: rows.map(optionWhen),
        votePath: timeVotePath(token),
        askedBy: me.get(seat.profileId) ?? null,
      }),
      { dedupeKey: `time-vote-invite:${seat.plan.id}:${email}:${new Date().toISOString().slice(0, 13)}` },
    )
  } catch {
    return fail('The email could not be sent. Try again in a minute.')
  }
  await recordPlanActivity({
    planId: seat.plan.id,
    actorProfileId: seat.profileId,
    actorSpaceId: seat.spaceId,
    kind: 'field',
    summary: `Asked ${email} to pick a date.`,
  })
  return ok({ email })
}
