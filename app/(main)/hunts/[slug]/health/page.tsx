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

export const dynamic = 'force-dynamic'

// ROUTE HEALTH (FH-032): the organiser's aggregate view of one Trail. Dark until HUNTS_CLAIMS_ENABLED
// (and HUNTS_ENABLED) is on, then it 404s like a page that does not exist. Only a member who holds a
// role on the Trail may read it (decide 'read_aggregate', asked fresh through authorizeHuntAction); a
// venue's staff use the venue report instead, which shows far less. Counts only: no player, no run.
export const metadata: Metadata = { title: 'Route health', robots: { index: false } }

const STATUS_LABEL: Record<string, string> = { draft: 'Draft', scheduled: 'Scheduled', live: 'Running', paused: 'Paused', ended: 'Ended', cancelled: 'Cancelled', archived: 'Archived' }
const MEDIUM_LABEL: Record<string, string> = { qr: 'Printed code', nfc: 'Tap tag', staff: 'Staff check', event: 'Event door' }
const cell = 'px-3 py-2'

export default async function HuntRouteHealthPage({ params }: { params: Promise<{ slug: string }> }) {
  if (!huntSwitchOn('claims')) notFound()
  const { slug } = await params
  const profileId = await getMyProfileId()
  if (!profileId) redirect(`/sign-in?next=/hunts/${encodeURIComponent(slug)}/health`)
  const hunt = await huntBySlug(slug)
  if (!hunt || !(await authorizeHuntAction(hunt.id, { profileId }, 'read_aggregate'))) notFound()

  const facts = await loadRouteFacts(hunt.id).catch(() => null)
  const health = facts ? buildRouteHealth(facts, new Date().toISOString()) : null

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
                    </tr>
                  </thead>
                  <tbody>
                    {health.venues.map((v) => (
                      <tr key={v.spaceId} className="border-b border-border">
                        <th scope="row" className={`${cell} font-medium`}>{v.name}</th>
                        <td className={cell}>{v.confirmedStops}</td>
                        <td className={cell}>{v.players}</td>
                        <td className={cell}>{v.awaitingReview}</td>
                        <td className={cell}>{v.handedOver}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          {health.formerVenues.length > 0 && (
            <section aria-labelledby="route-health-former" className="space-y-3">
              <h2 id="route-health-former" className="text-body font-semibold text-text">Venues that left</h2>
              <p className="text-body-sm text-muted">No longer part of the Trail. What players earned there still counts.</p>
              <ul className="space-y-1 text-body-sm">
                {health.formerVenues.map((v) => (
                  <li key={v.spaceId}>
                    <span className="font-medium text-text">{v.name}</span>: {v.confirmedStops} confirmed stops, {v.handedOver} rewards handed over
                    {v.awaitingReview > 0 ? `, ${v.awaitingReview} waiting for review` : ''}
                  </li>
                ))}
              </ul>
            </section>
          )}

          <section aria-labelledby="route-health-messages" className="space-y-3">
            <h2 id="route-health-messages" className="text-body font-semibold text-text">Messages</h2>
            <div className="grid gap-3 sm:grid-cols-4">
              <StatCard label="Sent" value={health.messages.sent} />
              <StatCard label="Waiting" value={health.messages.waiting} />
              <StatCard label="Sending now" value={health.messages.sending} />
              <StatCard label="Failed" value={health.messages.failed} detail="Needs a replay" />
            </div>
          </section>

          {health.finale && (
            <section aria-labelledby="route-health-finale" className="space-y-3">
              <h2 id="route-health-finale" className="text-body font-semibold text-text">Finale</h2>
              <p className="text-body-sm text-muted">
                {health.finale.title ? `The Trail ends at ${health.finale.title}.` : 'The Trail ends at an event that could not be read.'}
                {health.finale.eventOn ? '' : ' That event is not on right now, so players see the finale as unavailable.'}
              </p>
              <div className="grid gap-3 sm:grid-cols-4">
                <StatCard label="Finale notices sent" value={health.finale.sent} />
                <StatCard label="Waiting" value={health.finale.waiting} />
                <StatCard label="Sending now" value={health.finale.sending} />
                <StatCard label="Failed" value={health.finale.failed} detail="Needs a replay" />
              </div>
            </section>
          )}
        </div>
      )}
    </FocusTemplate>
  )
}
