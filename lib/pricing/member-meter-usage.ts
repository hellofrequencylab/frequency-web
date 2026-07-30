// MEMBER METER USAGE — the real counts behind the SIX personal (tier-axis) meters
// (docs/VALUE-LADDER.md Phase 4, Appendix A3: "all six tier-axis meters are total gaps").
//
// WHY THIS EXISTS. The Space plan-and-usage hub renders every plan-axis meter and feeds two of them a
// real count. The personal axis had nothing: the hub filters to `axis === 'plan'`, and the member
// upgrade page mounted no meter component at all. So a member could not see a single one of their own
// allowances anywhere in the product. A meter with no readout is a promise nobody can act on, and an
// upsell with no number is the kind of vague nag docs/CONTENT-VOICE.md exists to prevent.
//
// EVERY COUNT IS FAIL-SAFE 0 and every read is a head+exact count (no rows pulled). A count is used for
// two things only: an informational "X of N used" readout, and deciding whether the 80% prompt shows.
// Nothing here blocks, refuses, or charges. If a read fails, the member simply sees the allowance
// ladder without their own number, which is the correct failure direction for a display-only surface.
//
// THE NUMBERS MATCH THE CAPS THEY ARE COMPARED TO. Where a live cap already exists, this counts the
// same rows it counts, because a readout that measures something adjacent to the enforced thing is
// exactly the failure docs/VALUE-LADDER.md §6 Gate 5 question 4 warns about:
//   - journey_publish  counts visibility past 'private' (unlisted AND public), which is what
//     lib/journeys/publish-gate.ts counts.
//   - vera_unlimited   reuses veraMessagesToday, the same ai_usage read the live cap enforces against.

import { createAdminClient } from '@/lib/supabase/admin'
import { veraMessagesToday } from '@/lib/ai/vera/usage-gate'

/** The real usage behind each personal (tier-axis) meter, keyed by feature key. A key is absent when
 *  its count could not be resolved, so the surface shows the ladder without inventing a number. */
export type MemberMeterUsage = Partial<Record<string, number>>

/** A head+exact count, fail-safe to null (never 0, so "unknown" and "none" stay distinguishable). The
 *  tables involved are partly outside the generated types (ADR-246), so the builder is reached loosely
 *  the same way lib/ai/vera/usage-gate.ts does. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function headCount(build: (db: any) => Promise<{ count: number | null }>): Promise<number | null> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const res = await build(createAdminClient() as unknown as any)
    return typeof res?.count === 'number' ? res.count : null
  } catch {
    return null
  }
}

/** Published Journeys this member owns, counted the way the live publish cap counts them: anything
 *  past 'private' (unlisted is live to a space, public is live to the library). */
export async function memberPublishedJourneys(profileId: string): Promise<number | null> {
  return headCount((db) =>
    db
      .from('journey_plans')
      .select('id', { count: 'exact', head: true })
      .eq('author_id', profileId)
      .neq('visibility', 'private'),
  )
}

/** ACTIVE enrollees across every Journey this member authored (an enrollment with no completed_at).
 *  Two reads on purpose: the plan-id list is small and an embedded filter join on an untyped table is
 *  the kind of query that silently returns everything when it is wrong. Fail-safe null. */
export async function memberJourneyEnrollees(profileId: string): Promise<number | null> {
  try {
    const { data } = await createAdminClient()
      .from('journey_plans')
      .select('id')
      .eq('author_id', profileId)
    const planIds = ((data ?? []) as { id: string }[]).map((p) => p.id)
    if (planIds.length === 0) return 0
    return headCount((db) =>
      db
        .from('journey_enrollments')
        .select('id', { count: 'exact', head: true })
        .in('plan_id', planIds)
        .is('completed_at', null),
    )
  } catch {
    return null
  }
}

/** Circles this member hosts (host_id), excluding archived ones. */
export async function memberHostedCircles(profileId: string): Promise<number | null> {
  return headCount((db) =>
    db
      .from('circles')
      .select('id', { count: 'exact', head: true })
      .eq('host_id', profileId)
      .neq('status', 'archived'),
  )
}

/** Practices this member published (created by them and public, so others can adopt them). */
export async function memberPublishedPractices(profileId: string): Promise<number | null> {
  return headCount((db) =>
    db
      .from('practices')
      .select('id', { count: 'exact', head: true })
      .eq('created_by', profileId)
      .eq('is_public', true),
  )
}

/** ACTIVE events this member hosts: still upcoming, not cancelled, not removed. The event_create meter
 *  counts how many run AT ONCE, never whether they may charge (selling is free on every tier,
 *  ADR-914), so a past event never counts against it. */
export async function memberActiveEvents(profileId: string): Promise<number | null> {
  return headCount((db) =>
    db
      .from('events')
      .select('id', { count: 'exact', head: true })
      .eq('host_id', profileId)
      .is('removed_at', null)
      .neq('status', 'cancelled')
      .gte('starts_at', new Date().toISOString()),
  )
}

/**
 * Every personal meter's real usage for one member, resolved in parallel. Keys map 1:1 onto the
 * tier-axis rows of PLACEHOLDER_METER_LIMITS. A key is OMITTED (not zeroed) when its read failed, so a
 * surface renders the allowance ladder without a wrong number. Never throws.
 */
export async function memberMeterUsage(profileId: string | null | undefined): Promise<MemberMeterUsage> {
  if (!profileId) return {}
  const [vera, journeys, enrollees, circles, practices, events] = await Promise.all([
    veraMessagesToday(profileId).catch(() => null),
    memberPublishedJourneys(profileId),
    memberJourneyEnrollees(profileId),
    memberHostedCircles(profileId),
    memberPublishedPractices(profileId),
    memberActiveEvents(profileId),
  ])
  const usage: MemberMeterUsage = {}
  if (typeof vera === 'number') usage.vera_unlimited = vera
  if (typeof journeys === 'number') usage.journey_publish = journeys
  if (typeof enrollees === 'number') usage.journey_enrollees = enrollees
  if (typeof circles === 'number') usage.circle_host = circles
  if (typeof practices === 'number') usage.practice_publish = practices
  if (typeof events === 'number') usage.event_create = events
  return usage
}
