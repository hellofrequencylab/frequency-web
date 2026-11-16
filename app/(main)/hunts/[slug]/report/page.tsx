import type { Metadata } from 'next'
import { notFound, redirect } from 'next/navigation'
import { getMyProfileId } from '@/lib/auth'
import { FocusTemplate } from '@/components/templates'
import { buttonClasses } from '@/components/ui/button'
import { StatCard } from '@/components/ui/stat-card'
import { huntSwitchOn } from '@/lib/hunts/flags'
import { readMerchantReport, shown, SMALL_CELL } from '@/lib/hunts/merchant-report'
import { huntBySlug, merchantReportDeps } from '@/lib/hunts/merchant-report-store'
import { loadStationFacts } from '@/lib/hunts/redemption-store'

export const dynamic = 'force-dynamic'

// THE VENUE REPORT (FH-026): what one venue's staff may read about one Trail. Dark until
// HUNTS_CLAIMS_ENABLED (and HUNTS_ENABLED) is on, then it 404s like a page that does not exist. Who may
// read is decided on the server for each request (lib/hunts/merchant-report.ts readMerchantReport): a
// member who is not current staff of the venue, or who asks for another Space, gets the same 404 as a
// Trail that does not exist. The page shows counts only, never a player.
export const metadata: Metadata = { title: 'Venue report', robots: { index: false } }

const PROOF_LABEL = { none: 'No proof', signed_node: 'Scan or tap', staff: 'Checked by staff', event_door: 'Checked at the door' } as const

export default async function HuntVenueReportPage({ params, searchParams }: {
  params: Promise<{ slug: string }>
  searchParams: Promise<{ space?: string | string[] }>
}) {
  if (!huntSwitchOn('claims')) notFound()
  const { slug } = await params
  const profileId = await getMyProfileId()
  if (!profileId) redirect(`/sign-in?next=/hunts/${encodeURIComponent(slug)}/report`)
  const hunt = await huntBySlug(slug)
  if (!hunt) notFound()

  // With no Space named, the report is for the first venue this member staffs on the Trail. A named
  // Space is never trusted: readMerchantReport checks the caller's standing there before any read.
  const { space } = await searchParams
  const venueSpaceId = typeof space === 'string' ? space : (await loadStationFacts(profileId, hunt.id))?.staffVenueSpaceIds[0]
  if (!venueSpaceId) notFound()
  const out = await readMerchantReport(merchantReportDeps, { profileId, huntId: hunt.id, venueSpaceId })
  if (!out.ok) notFound()
  const r = out.report
  const exportHref = (kind: 'report' | 'contacts') => `/hunts/${encodeURIComponent(hunt.slug)}/report/export?kind=${kind}&space=${encodeURIComponent(venueSpaceId)}`

  return (
    <FocusTemplate
      eyebrow="Frequency Hunts"
      title="Venue report"
      description="Stops, rewards and opted-in contacts for your venue on this Trail. Counts only, never a player."
      width="xl"
      adminBar={false}
      actions={
        <div className="flex flex-wrap gap-2">
          <a href={exportHref('report')} className={buttonClasses('secondary', 'sm')}>Download report</a>
          <a href={exportHref('contacts')} className={buttonClasses('secondary', 'sm')}>Download contacts</a>
        </div>
      }
    >
      <div className="space-y-8">
        <section aria-labelledby="venue-report-stops" className="space-y-3">
          <h2 id="venue-report-stops" className="text-body font-semibold text-text">Stops at your venue</h2>
          <div className="grid gap-3 sm:grid-cols-3">
            <StatCard label="Confirmed stops" value={r.visits.total} detail="Every stop confirmed here" />
            <StatCard label="Players" value={r.visits.visitors} detail="People who stopped here" />
            <StatCard label="Waiting for review" value={r.visits.awaitingReview} detail="Held for your staff" />
          </div>
          <table className="w-full text-left text-body-sm">
            <caption className="sr-only">Confirmed stops by how they were proved</caption>
            <thead className="border-b border-border text-muted">
              <tr><th scope="col" className="px-3 py-2">How it was proved</th><th scope="col" className="px-3 py-2">Stops</th></tr>
            </thead>
            <tbody>
              {(Object.keys(PROOF_LABEL) as (keyof typeof PROOF_LABEL)[]).map((a) => (
                <tr key={a} className="border-b border-border">
                  <th scope="row" className="px-3 py-2 font-medium">{PROOF_LABEL[a]}</th>
                  <td className="px-3 py-2">{r.visits.byAssurance[a]}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        <section aria-labelledby="venue-report-rewards" className="space-y-3">
          <h2 id="venue-report-rewards" className="text-body font-semibold text-text">Rewards</h2>
          <div className="grid gap-3 sm:grid-cols-3">
            <StatCard label="Handed over here" value={r.redeemedHere} detail="At your counter" />
            <StatCard label="Issued on this Trail" value={shown(r.grants.issued, r.standing)} detail="Across every venue" />
            <StatCard label="Not yet used" value={shown(r.grants.open, r.standing)} detail="Across every venue" />
          </div>
          {r.offers.length > 0 && (
            <table className="w-full text-left text-body-sm">
              <caption className="sr-only">Rewards on this Trail</caption>
              <thead className="border-b border-border text-muted">
                <tr>
                  <th scope="col" className="px-3 py-2">Reward</th>
                  <th scope="col" className="px-3 py-2">Issued</th>
                  <th scope="col" className="px-3 py-2">Handed over here</th>
                </tr>
              </thead>
              <tbody>
                {r.offers.map((o, index) => (
                  <tr key={index} className="border-b border-border">
                    <th scope="row" className="px-3 py-2 font-medium">{o.title}</th>
                    <td className="px-3 py-2">{shown(o.issued, r.standing)}</td>
                    <td className="px-3 py-2">{o.redeemedHere}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>

        <section aria-labelledby="venue-report-next" className="space-y-3">
          <h2 id="venue-report-next" className="text-body font-semibold text-text">What your players did next</h2>
          {r.onward ? (
            <div className="grid gap-3 sm:grid-cols-3">
              <StatCard label="Finished the Trail" value={r.onward.finished} />
              <StatCard label="Still playing" value={r.onward.still_playing} />
              <StatCard label="Stopped" value={r.onward.stopped} />
            </div>
          ) : (
            <p className="text-body-sm text-muted">
              Not enough players yet. We show this once every group has at least {SMALL_CELL} people, so no one can be picked out.
            </p>
          )}
        </section>

        <section aria-labelledby="venue-report-contacts" className="space-y-3">
          <h2 id="venue-report-contacts" className="text-body font-semibold text-text">Contacts</h2>
          <div className="grid gap-3 sm:grid-cols-3">
            <StatCard label="Opted in to hear from you" value={r.contacts} detail="Each one chose your venue by name" />
          </div>
        </section>
      </div>
    </FocusTemplate>
  )
}
