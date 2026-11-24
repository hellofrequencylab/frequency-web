'use server'

import { getCallerProfile } from '@/lib/auth'
import { getVisibleSpaceBySlug } from '@/lib/spaces/store'
import { getSpaceCapabilities } from '@/lib/spaces/entitlements'
import { spaceFunctionAccess } from '@/lib/spaces/functions'
import { fail, ok, type ActionResult } from '@/lib/action-result'
import { getSpacePlan } from '@/lib/calendar/plans-store'
import { resolveCommentAuthors } from '@/lib/calendar/plan-comments-store'
import { listPlanTimeOptionRows, listTimeVoteRows, setMyTimeVoteRow } from '@/lib/calendar/time-votes-store'
import { notifyTimeVote } from '@/lib/calendar/time-vote-notify'
import { countVoters, parseTimeVote, rankTimeOptions, voterKey, type TimeOptionTally } from '@/lib/calendar/time-votes'
import type { EntryRow } from '@/lib/calendar/entries'
import type { SpacePlan } from '@/lib/calendar/plans'
import { formatEventWhen } from '@/lib/time/zone'

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
