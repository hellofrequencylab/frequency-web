import { Suspense } from 'react'
import Link from 'next/link'
import { FqIcon, type FqIconName } from '@/components/frequency/icon'
import { SpaceDispatchBand } from '@/components/spaces/dashboard/space-dispatch-band'
import { spaceEarningsSummary } from '@/lib/commerce/orders'
import { getSpaceHealth, getWorklist } from '@/lib/dashboard/scores'
import { listActiveSpaceMemberIds } from '@/lib/spaces/resonance-roster'
import { listWorkspaceConversations } from '@/lib/comms/workspace'
import { listEventsForSpace, type SpaceEvent } from '@/lib/events/store'
import { goingCountsByEvent } from '@/lib/events/going-counts'
import { getProfileSummaries } from '@/lib/connections/matching'
import { listSpaceMemberships } from '@/lib/spaces/memberships'
import { isPastDueSpaceMembership } from '@/lib/spaces/membership-dunning'
import { dayInZone, HOME_TZ } from '@/lib/time/zone'
import { AdminHead, AdminPageBody, Av, EMPTY, Kpi, WeekBars, n, trendOf, usd } from '../shared'
import { countBetween, firstTimers, percentChange, returnRate, weeklyCounts } from '../checkin-stats'
import { loadSpaceCheckins } from '../space-reads'

// THE SPACE OVERVIEW, FREQUENCY (design_handoff/frequency/templates/admin/Overview.html). The console's
// Home tab under SITE_DESIGN=frequency; DAWN keeps components/spaces/dashboard/space-dashboard.tsx. The
// reads are the ones the DAWN Home already makes (earnings, Space health, the active-member ids, the
// worklist, the conversations queue, the Space's events), plus the shared going-count helper for the
// RSVP column. The console's manage gate authorized the caller before this renders.
//
// CHECK-INS (space-reads.ts loadSpaceCheckins): the verified check-in ledger on this Space's events feeds
// Check-ins, 30 days (with its change on the 30 days before), Came back within 2 weeks, the Check-ins by
// week chart and the first-timers line in Needs you. Revenue's change compares the last 30 days with the 30
// before, both from spaceEarningsSummary. Past-due memberships are listSpaceMemberships' payment status.
//
// NO READING, SO THE DESIGN'S EMPTY VALUE ("—"), never a sample number: a check-in read that failed, and
// a return rate with nobody in its window. Active members has no prior-period reader, so it carries the
// weekly-active note instead of a trend.

const WEEK_DAYS = 7

function addDays(isoDay: string, days: number): string {
  const d = new Date(`${isoDay}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

function greeting(at: Date): string {
  const hour = Number(new Intl.DateTimeFormat('en-US', { hour: 'numeric', hourCycle: 'h23', timeZone: HOME_TZ }).format(at))
  if (hour < 12) return 'Good morning'
  if (hour < 18) return 'Good afternoon'
  return 'Good evening'
}

function whenLabel(e: SpaceEvent): string {
  const ms = Date.parse(e.starts_at)
  if (!Number.isFinite(ms)) return EMPTY
  const tz = e.time_zone || HOME_TZ
  const day = new Intl.DateTimeFormat('en-US', { weekday: 'short', timeZone: tz }).format(ms)
  const time = new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit', timeZone: tz })
    .format(ms)
    .replace(' ', '')
    .toLowerCase()
  return `${day} ${time}`
}

export async function FqOverviewBody({
  spaceId,
  slug,
  spaceName,
  viewerProfileId,
}: {
  spaceId: string
  slug: string
  spaceName: string
  viewerProfileId: string | null
}) {
  const now = new Date()
  const today = dayInZone(now, HOME_TZ)
  const [earnings, earnings60, health, memberIds, worklist, conversations, weekEvents, viewer, checkins, memberships] = await Promise.all([
    spaceEarningsSummary(spaceId, 30),
    spaceEarningsSummary(spaceId, 60),
    getSpaceHealth(spaceId),
    listActiveSpaceMemberIds(spaceId),
    getWorklist({ spaceId }),
    listWorkspaceConversations({ scope: 'all', viewerProfileId: '', spaceId, limit: 100 }),
    listEventsForSpace(spaceId, { fromDay: today, toDay: addDays(today, WEEK_DAYS), limit: 50 }),
    viewerProfileId ? getProfileSummaries([viewerProfileId]) : Promise.resolve(null),
    // All time, not a 90-day window: "first timers" must see a regular's older visits. Every other stat windows itself.
    loadSpaceCheckins(spaceId),
    listSpaceMemberships(spaceId),
  ])
  const nowMs = now.getTime()
  const checkins30 = checkins ? countBetween(checkins, nowMs, 30) : null
  const checkinsTrend = checkins ? trendOf(percentChange(checkins30 ?? 0, countBetween(checkins, nowMs, 60, 30))) : undefined
  const returned = checkins ? returnRate(checkins, nowMs) : null
  const weekly = checkins ? weeklyCounts(checkins, nowMs, 12) : null
  const newFaces = checkins ? firstTimers(checkins, nowMs, 7) : 0
  const pastDue = memberships.filter((m) => isPastDueSpaceMembership(m.paymentStatus)).length
  const revenueTrend = trendOf(percentChange(earnings.netCents, earnings60.netCents - earnings.netCents))

  const events = weekEvents.filter((e) => !e.is_cancelled)
  const [going, hosts] = await Promise.all([
    goingCountsByEvent(events.map((e) => e.id)),
    getProfileSummaries(events.map((e) => e.host_id).filter((id): id is string => !!id)),
  ])
  const noHost = events.filter((e) => !e.host_id).length
  const unanswered = conversations.filter((r) => r.awaitingReply).length
  const firstName = viewer?.get(viewerProfileId ?? '')?.displayName?.trim().split(/\s+/)[0] ?? null

  const dateLine = new Intl.DateTimeFormat('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: HOME_TZ }).format(now)
  const meta = [
    dateLine,
    `${events.length} ${events.length === 1 ? 'event' : 'events'} this week`,
    ...(noHost > 0 ? [`${noHost} ${noHost === 1 ? 'needs' : 'need'} a host`] : []),
  ].join(' · ')

  const needs: {
    icon: 'tip' | 'membership' | 'contacts'
    title: string
    sub: string
    href: string
    cta: string
    ctaIcon: FqIconName
  }[] = []
  if (unanswered > 0) {
    needs.push({
      icon: 'tip',
      title: `${unanswered} ${unanswered === 1 ? 'conversation' : 'conversations'} to answer`,
      sub: 'Waiting on your reply',
      href: `/spaces/${slug}/crm/conversations`,
      cta: 'Review',
      ctaIcon: 'message',
    })
  }
  if (pastDue > 0) {
    needs.push({
      icon: 'membership',
      title: `${pastDue} ${pastDue === 1 ? 'membership needs' : 'memberships need'} a new card`,
      sub: 'The last payment did not go through',
      href: `/spaces/${slug}/settings/offerings#memberships`,
      cta: 'View',
      ctaIcon: 'membership',
    })
  }
  if (newFaces > 0) {
    needs.push({
      icon: 'contacts',
      title: `${newFaces} first ${newFaces === 1 ? 'timer' : 'timers'} this week`,
      sub: 'Send a welcome',
      href: `/spaces/${slug}/manage?section=resonance`,
      cta: 'See who',
      ctaIcon: 'send',
    })
  }
  if (worklist.rows.length > 0) {
    needs.push({
      icon: 'contacts',
      title: `${worklist.rows.length} ${worklist.rows.length === 1 ? 'person needs' : 'people need'} you`,
      sub: worklist.laterCount > 0 ? `${worklist.laterCount} more later` : 'From your Resonance worklist',
      href: `/spaces/${slug}/crm`,
      cta: 'View',
      ctaIcon: 'contacts',
    })
  }

  return (
    <AdminPageBody>
      <AdminHead
        kicker={`${spaceName} · this week`}
        title={
          firstName ? (
            <>
              {greeting(now)}, <span className="serif">{firstName}.</span>
            </>
          ) : (
            `${greeting(now)}.`
          )
        }
        meta={meta}
        actions={
          <>
            <Link className="btn" href={`/spaces/${slug}/edit-page`}>
              <FqIcon name="edit" />
              Edit page
            </Link>
            <Link className="btn pa" href={`/events/new?space=${encodeURIComponent(spaceId)}`}>
              <FqIcon name="event" />
              New event
            </Link>
          </>
        }
      />

      <div className="g4">
        <Kpi label="Check-ins, 30 days" value={checkins30 === null ? EMPTY : n(checkins30)} trend={checkinsTrend} />
        <Kpi
          label="Came back within 2 weeks"
          value={returned ? `${returned.rate}%` : EMPTY}
          note={returned ? `Of ${n(returned.people)} ${returned.people === 1 ? 'person' : 'people'} who checked in` : undefined}
        />
        <Kpi label="Active members" value={n(memberIds.length)} note={`${n(health.weeklyActive)} active this week`} />
        <Kpi
          label="Revenue, 30 days"
          value={usd(earnings.netCents)}
          trend={revenueTrend}
          note={earnings.orderCount > 0 ? `${earnings.orderCount} paid ${earnings.orderCount === 1 ? 'order' : 'orders'}` : 'No sales yet'}
        />
      </div>

      <div className="ap-cols adp-split sec adp-gap">
        <div className="stack adp-wide">
          <div className="panel">
            <div className="sec-h">
              <span className="h3">Check-ins by week</span>
              <span className="t2">Last 12 weeks</span>
            </div>
            <WeekBars values={weekly} label="Check-ins by week" />
          </div>

          <div>
            <div className="sec-h">
              <span className="h3">This week</span>
              <Link className="t2" href={`/spaces/${slug}/settings/calendar`}>
                All events
              </Link>
            </div>
            <div className="tbl-wrap">
              <table className="tbl">
                <thead>
                  <tr>
                    <th>Event</th>
                    <th>When</th>
                    <th>Host</th>
                    <th>RSVPs</th>
                    <th>
                      <span className="sr-only">Status</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {events.length === 0 ? (
                    <tr>
                      <td className="t1" colSpan={5}>
                        Nothing on the calendar this week.
                      </td>
                    </tr>
                  ) : (
                    events.map((e) => {
                      const host = e.host_id ? hosts.get(e.host_id) : null
                      const count = going[e.id] ?? 0
                      const full = e.capacity && e.capacity > 0 ? count / e.capacity : 0
                      return (
                        <tr key={e.id}>
                          <td className="t1">
                            <Link href={`/events/${e.slug}`}>{e.title || 'Event'}</Link>
                          </td>
                          <td>{whenLabel(e)}</td>
                          <td>
                            {host ? (
                              <span className="row">
                                <Av url={host.avatarUrl} />
                                <span>
                                  <span className="t1 adp-block">{host.displayName ?? host.handle ?? 'Host'}</span>
                                </span>
                              </span>
                            ) : (
                              <span className="t2">No host</span>
                            )}
                          </td>
                          <td>{e.capacity ? `${n(count)} / ${n(e.capacity)}` : n(count)}</td>
                          <td>
                            {!e.host_id ? (
                              <Link className="btn sm pa" href={`/events/${e.slug}/manage`} aria-label={`Find a host for ${e.title || 'this event'}`}>
                                <FqIcon name="host" />
                                Find a host
                              </Link>
                            ) : full >= 0.9 ? (
                              <span className="st warn">Almost full</span>
                            ) : (
                              <span className="st ok">On track</span>
                            )}
                          </td>
                        </tr>
                      )
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        <aside className="side">
          <div className="panel stack">
            <span className="k">Needs you</span>
            <div className="list">
              {needs.length === 0 ? (
                <div>
                  <span className="ic">
                    <FqIcon name="check" />
                  </span>
                  <span className="grow">
                    <span className="t1 adp-block">All clear</span>
                    <span className="t2">No one is waiting on you right now.</span>
                  </span>
                </div>
              ) : (
                needs.map((item) => (
                  <div key={item.title}>
                    <span className="ic">
                      <FqIcon name={item.icon} />
                    </span>
                    <span className="grow">
                      <span className="t1 adp-block">{item.title}</span>
                      <span className="t2">{item.sub}</span>
                    </span>
                    <Link className="btn sm" href={item.href}>
                      <FqIcon name={item.ctaIcon} />
                      {item.cta}
                    </Link>
                  </div>
                ))
              )}
            </div>
          </div>
          {health.atRisk > 0 && (
            <div className="soft stack">
              <span className="k">Bring them back</span>
              <span className="h3">
                {n(health.atRisk)} {health.atRisk === 1 ? 'person is' : 'people are'} slipping.
              </span>
              <span className="t2">They are in the red tier on Resonance.</span>
              <Link className="btn sm pa self-start" href={`/spaces/${slug}/manage?section=resonance`}>
                <FqIcon name="contacts" />
                See who
              </Link>
            </div>
          )}
        </aside>
      </div>

      {/* The post box (LIVE-295), kept: announcing sits beside the numbers. Self-gates on space-manage. */}
      <div className="adp-legacy">
        <Suspense fallback={null}>
          <SpaceDispatchBand slug={slug} />
        </Suspense>
      </div>
    </AdminPageBody>
  )
}
