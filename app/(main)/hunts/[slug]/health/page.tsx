import type { Metadata } from 'next'
import { notFound, redirect } from 'next/navigation'
import { getMyProfileId } from '@/lib/auth'
import { FocusTemplate } from '@/components/templates'
import { EmptyState } from '@/components/ui/empty-state'
import { StatCard } from '@/components/ui/stat-card'
import { huntSwitchOn } from '@/lib/hunts/flags'
import { huntBySlug } from '@/lib/hunts/merchant-report-store'
import { STALL_HOURS, buildRouteHealth } from '@/lib/hunts/route-health'
import { loadRouteFacts } from '@/lib/hunts/route-health-store'
import { authorizeHuntAction } from '@/lib/hunts/store'
import { formatEventDate } from '@/lib/utils'

export const dynamic = 'force-dynamic'

// ROUTE HEALTH (FH-032): the organiser's aggregate view of one Trail. Dark until HUNTS_CLAIMS_ENABLED
// (and HUNTS_ENABLED) is on, then it 404s like a page that does not exist. Only a member who holds a
// role on the Trail may read it (decide 'read_aggregate', asked fresh through authorizeHuntAction); a
// venue's staff use the venue report instead, which shows far less. Counts only: no player, no run.
export const metadata: Metadata = { title: 'Route health', robots: { index: false } }

const STATUS_LABEL: Record<string, string> = { draft: 'Draft', scheduled: 'Scheduled', live: 'Running', paused: 'Paused', ended: 'Ended', cancelled: 'Cancelled', archived: 'Archived' }
const MEDIUM_LABEL: Record<string, string> = { qr: 'Printed code', nfc: 'Tap tag', staff: 'Staff check', event: 'Event door' }
const cell = 'px-3 py-2'
const TERMS_LABEL = { current: 'Current terms', earlier: 'Earlier terms', unknown: 'Not recorded' } as const
const ENDED_LABEL = { withdrawn: 'Withdrew', suspended: 'Suspended by you', ended: 'Partnership ended' } as const
const dateLabel = (iso: string | null) => (iso ? formatEventDate(iso) : 'date to be set')

export default async function HuntRouteHealthPage({ params }: { params: Promise<{ slug: string }> }) {
  if (!huntSwitchOn('claims')) notFound()
  const { slug } = await params
  const profileId = await getMyProfileId()
  if (!profileId) redirect(`/sign-in?next=/hunts/${encodeURIComponent(slug)}/health`)
  const hunt = await huntBySlug(slug)
  if (!hunt || !(await authorizeHuntAction(hunt.id, { profileId }, 'read_aggregate'))) notFound()

  const facts = await loadRouteFacts(hunt.id).catch(() => null)
  const health = facts ? buildRouteHealth(facts, new Date().toISOString()) : null
  const standing = new Map((health?.partnerStanding ?? []).map((p) => [p.spaceId, p]))

  return (
    <FocusTemplate
      eyebrow="Frequency Hunts"
      title="Route health"
      description="Where players are, which stops slow them down, and whether every placement is working. Counts only, never a player."
      width="xl"
      adminBar={false}
    >
      {!health ? (
        <EmptyState variant="error" title="Route health is unavailable" description="Try again in a moment." />
      ) : (
        <div className="space-y-8">
          <section aria-labelledby="route-health-runs" className="space-y-3">
            <h2 id="route-health-runs" className="text-body font-semibold text-text">Players</h2>
            <div className="grid gap-3 sm:grid-cols-4">
              <StatCard label="Trail" value={STATUS_LABEL[health.status] ?? 'Unknown'} size="sm" />
              <StatCard label="Started" value={health.runs.started} detail={`${health.runs.notStarted} yet to confirm a stop`} />
              <StatCard label="Playing" value={health.runs.playing} />
              <StatCard label="Finished" value={health.runs.finished} detail={`${health.runs.stopped} stopped`} />
            </div>
          </section>

          <section aria-labelledby="route-health-stops" className="space-y-3">
            <h2 id="route-health-stops" className="text-body font-semibold text-text">Stops</h2>
            {health.stops.length === 0 ? (
              <EmptyState variant="no-results" title="No stops yet" description="Publish the Trail to see its stops here." />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-body-sm">
                  <caption className="sr-only">Each stop, how many players reached it and how many are waiting after it</caption>
                  <thead className="border-b border-border text-muted">
                    <tr>
                      <th scope="col" className={cell}>Stop</th>
                      <th scope="col" className={cell}>Reached</th>
                      <th scope="col" className={cell}>Waiting after it</th>
                      <th scope="col" className={cell}>Stalled {STALL_HOURS} hours or more</th>
                      <th scope="col" className={cell}>Placements and use</th>
                    </tr>
                  </thead>
                  <tbody>
                    {health.stops.map((s, index) => (
                      <tr key={index} className="border-b border-border align-top">
                        <th scope="row" className={`${cell} font-medium`}>{s.title}</th>
                        <td className={cell}>{s.reached}</td>
                        <td className={cell}>{s.waiting}</td>
                        <td className={cell}>{s.stalled}</td>
                        <td className={cell}>
                          {s.placements.length === 0 ? 'No placement' : (
                            <ul className="space-y-1">
                              {s.placements.map((p, i) => (
                                <li key={i}>{MEDIUM_LABEL[p.medium] ?? 'Placement'}: {p.uses} {p.open ? '' : '(closed)'}</li>
                              ))}
                            </ul>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <section aria-labelledby="route-health-placements" className="space-y-3">
            <h2 id="route-health-placements" className="text-body font-semibold text-text">Placements</h2>
            <div className="grid gap-3 sm:grid-cols-4">
              <StatCard label="Open" value={health.placements.open} />
              <StatCard label="Closed" value={health.placements.closed} />
              <StatCard label="Damaged or missing" value={health.placements.damaged + health.placements.missing} detail="Open placements that need a visit" />
              <StatCard label="Not checked yet" value={health.placements.unchecked} />
            </div>
          </section>

          <section aria-labelledby="route-health-venues" className="space-y-3">
            <h2 id="route-health-venues" className="text-body font-semibold text-text">Venues</h2>
            {health.venues.length === 0 ? (
              <p className="text-body-sm text-muted">This Trail has no venue Space yet.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-body-sm">
                  <caption className="sr-only">Each active venue and its own counts</caption>
                  <thead className="border-b border-border text-muted">
                    <tr>
                      <th scope="col" className={cell}>Venue</th>
                      <th scope="col" className={cell}>Confirmed stops</th>
                      <th scope="col" className={cell}>Players</th>
                      <th scope="col" className={cell}>Waiting for review</th>
                      <th scope="col" className={cell}>Rewards handed over</th>
                      <th scope="col" className={cell}>Steward</th>
                      <th scope="col" className={cell}>Terms</th>
                    </tr>
                  </thead>
                  <tbody>
                    {health.venues.map((v) => {
                      const partner = standing.get(v.spaceId)
                      return (
                        <tr key={v.spaceId} className="border-b border-border">
                          <th scope="row" className={`${cell} font-medium`}>{v.name}</th>
                          <td className={cell}>{v.confirmedStops}</td>
                          <td className={cell}>{v.players}</td>
                          <td className={cell}>{v.awaitingReview}</td>
                          <td className={cell}>{v.handedOver}</td>
                          <td className={cell}>{partner ? partner.steward ?? 'Not named' : 'Your Space'}</td>
                          <td className={cell}>{partner ? TERMS_LABEL[partner.terms] : 'Not needed'}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
            {health.formerVenues.length > 0 && (
              <div className="space-y-2">
                <p className="text-body-sm text-muted">No longer partners. Their past counts stay, so the totals still add up, and they take no new stops.</p>
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-body-sm">
                    <caption className="sr-only">Venues that were partners and their counts from that time</caption>
                    <thead className="border-b border-border text-muted">
                      <tr>
                        <th scope="col" className={cell}>Venue</th>
                        <th scope="col" className={cell}>Why</th>
                        <th scope="col" className={cell}>Confirmed stops</th>
                        <th scope="col" className={cell}>Players</th>
                        <th scope="col" className={cell}>Rewards handed over</th>
                      </tr>
                    </thead>
                    <tbody>
                      {health.formerVenues.map((v) => (
                        <tr key={v.spaceId} className="border-b border-border">
                          <th scope="row" className={`${cell} font-medium`}>{v.name}</th>
                          <td className={cell}>{ENDED_LABEL[v.ended]}</td>
                          <td className={cell}>{v.confirmedStops}</td>
                          <td className={cell}>{v.players}</td>
                          <td className={cell}>{v.handedOver}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </section>

          <section aria-labelledby="route-health-finale" className="space-y-3">
            <h2 id="route-health-finale" className="text-body font-semibold text-text">Finale</h2>
            {health.finale.state === 'none' ? (
              <p className="text-body-sm text-muted">This Trail does not end at an event.</p>
            ) : health.finale.state === 'unavailable' ? (
              <p className="text-body-sm text-muted">
                Players see the finale as not available. The event was cancelled or unpublished, or its host Space is no longer a partner.
              </p>
            ) : (
              <>
                <p className="text-body-sm text-muted">
                  Every player&apos;s Trail shows {health.finale.event.title}, {dateLabel(health.finale.event.startsAt)}. Finishing never holds a place.
                </p>
                <div className="grid gap-3 sm:grid-cols-3">
                  <StatCard label="Going" value={health.finale.going} />
                  <StatCard label="Places left" value={health.finale.spotsLeft ?? 'No limit'} />
                  <StatCard label="Status" value={health.finale.isFull ? 'Full' : 'Open'} />
                </div>
              </>
            )}
          </section>

          <section aria-labelledby="route-health-messages" className="space-y-3">
            <h2 id="route-health-messages" className="text-body font-semibold text-text">Messages</h2>
            <div className="grid gap-3 sm:grid-cols-4">
              <StatCard label="Sent" value={health.messages.sent} />
              <StatCard label="Waiting" value={health.messages.waiting} />
              <StatCard label="Sending now" value={health.messages.sending} />
              <StatCard label="Failed" value={health.messages.failed} detail="Needs a replay" />
            </div>
          </section>
        </div>
      )}
    </FocusTemplate>
  )
}
