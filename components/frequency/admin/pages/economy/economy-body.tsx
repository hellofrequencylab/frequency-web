import { Suspense } from 'react'
import { FqIcon } from '@/components/frequency/icon'
import { SpacePayoutSetupPrompt } from '@/components/billing/payout-setup-prompt'
import { StaffPreviewBanner } from '@/components/spaces/staff-preview-banner'
import { PATHS, RateBand, loadMoneyPaths, type MoneyPathState } from '@/app/(main)/spaces/[slug]/settings/payments/payments-body'
import { spaceEarningsSummary } from '@/lib/commerce/orders'
import type { Space } from '@/lib/spaces/types'
import { AdminHead, AdminPageBody, EMPTY, Kpi, WeekBars, n, trendOf, usd } from '../shared'
import { loadEarnRates } from '../earn-rates'
import { DAY_MS, percentChange } from '../checkin-stats'
import { StatementButton } from './statement-button'
import { HOME_TZ } from '@/lib/time/zone'
import { loadSpaceRevenueSeries } from '../space-reads'

// ECONOMY, FREQUENCY (design_handoff/frequency/templates/admin/Economy.html). The Space's Get paid page
// (/spaces/[slug]/settings/payments) under SITE_DESIGN=frequency; DAWN keeps its FocusTemplate bands. The
// page's manage gate ran before this renders. Reads: the Space's 30-day earnings (spaceEarningsSummary, the
// read the console Home makes), the money paths and their provable state (loadMoneyPaths, the DAWN band's
// read), and the platform earn rates from zap_config / gem_config (loadEarnRates, read-only; only real rules,
// never the design's placeholder bonuses). The payout setup card and the rate statement follow unchanged.
//
// Revenue by week and the revenue change are loadSpaceRevenueSeries (space-reads.ts): differences of the same
// spaceEarningsSummary windows, so the bars and the KPI can never disagree with the console Home.
//
// NO READING, SO THE DESIGN'S EMPTY VALUE ("—"): Next payout, Zaps issued and Gems spent here (Zaps and Gems
// are not recorded per Space), and the trends on those. There is no payout ledger in the app (Stripe pays out on its own schedule), so
// the design's Payouts table is the money-paths table instead. Statement (statement-button.tsx) downloads the
// weekly revenue the bars draw, the one statement the app can stand behind.

const PATH_STATUS: Record<MoneyPathState, { label: string; tone: 'ok' | 'warn' | 'n' }> = {
  live: { label: 'Live', tone: 'ok' },
  needs_payouts: { label: 'Ready once payouts are on', tone: 'warn' },
  turned_off: { label: 'Turned off in your settings', tone: 'n' },
  not_live: { label: 'Waiting on payments going live', tone: 'n' },
}

export async function FqEconomyBody({
  space,
  viewerProfileId,
  staffViewing,
}: {
  space: Space
  viewerProfileId: string | null
  staffViewing: boolean
}) {
  const [earnings, paths, rates, series] = await Promise.all([
    spaceEarningsSummary(space.id, 30),
    loadMoneyPaths(space, viewerProfileId, staffViewing),
    loadEarnRates(),
    loadSpaceRevenueSeries(space.id),
  ])
  const now = new Date().getTime()
  const month = new Intl.DateTimeFormat('en-US', { month: 'long', timeZone: HOME_TZ }).format(now)
  const weekEnd = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: HOME_TZ })
  const statement = series
    ? series.weeks.map((cents, i) => ({
        week: weekEnd.format(now - (series.weeks.length - 1 - i) * 7 * DAY_MS),
        net: usd(cents),
      }))
    : null

  return (
    <AdminPageBody>
      {staffViewing && <StaffPreviewBanner spaceName={space.brandName ?? space.name} />}
      <AdminHead
        kicker="Zaps, Gems and payouts"
        title="Economy"
        meta={`${month} · next payout ${EMPTY}`}
        actions={<StatementButton rows={statement} filename={`${space.slug}-revenue-by-week.csv`} />}
      />

      <div className="g4">
        <Kpi
          label="Revenue, 30 days"
          value={usd(earnings.netCents)}
          trend={series ? trendOf(percentChange(series.last30, series.prior30)) : undefined}
          note={earnings.orderCount > 0 ? `${earnings.orderCount} paid ${earnings.orderCount === 1 ? 'order' : 'orders'}` : 'No sales yet'}
        />
        <Kpi label="Next payout" value={EMPTY} />
        <Kpi
          label="Zaps issued"
          value={
            <>
              <FqIcon name="zap" /> {EMPTY}
            </>
          }
        />
        <Kpi
          label="Gems spent here"
          value={
            <>
              <FqIcon name="gem" /> {EMPTY}
            </>
          }
        />
      </div>

      <div className="ap-cols adp-split sec">
        <div>
          <div className="panel">
            <div className="sec-h">
              <span className="h3">Revenue by week</span>
              <span className="t2">Last 12 weeks</span>
            </div>
            <WeekBars values={series?.weeks ?? null} label="Revenue by week" format={usd} />
          </div>

          <div className="sec-h sec adp-gap">
            <span className="h2">Money paths</span>
          </div>
          <div className="panel tbl-wrap" tabIndex={0} role="region" aria-label="Money paths">
            <table className="tbl">
              <thead>
                <tr>
                  <th>Path</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {paths.map((p) => {
                  const st = PATH_STATUS[p.state]
                  return (
                    <tr key={p.channel}>
                      <td className="t1">{p.word.charAt(0).toUpperCase() + p.word.slice(1)}</td>
                      <td>
                        <span className={`st ${st.tone}`}>{st.label}</span>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>

        <aside className="side">
          <div className="panel stack">
            <span className="k">What your members earn here</span>
            <div className="list">
              {rates.map((r) => (
                <div key={r.key}>
                  <span className="t1 grow">{r.label}</span>
                  <span className="t1">
                    <FqIcon name={r.kind} size={14} /> {r.amount === null ? EMPTY : n(r.amount)}
                  </span>
                </div>
              ))}
            </div>
            <span className="t2">Platform rates, the same for every Space.</span>
          </div>
        </aside>
      </div>

      {/* The page's own action and statement, kept: where the money lands (payout setup) and the rate. */}
      <div className="adp-legacy">
        <Suspense fallback={null}>
          <SpacePayoutSetupPrompt
            space={space}
            viewerProfileId={viewerProfileId}
            channels={PATHS.map((p) => p.channel)}
            whenReady="status"
          />
        </Suspense>
        <Suspense fallback={null}>
          <RateBand space={space} />
        </Suspense>
      </div>
    </AdminPageBody>
  )
}
