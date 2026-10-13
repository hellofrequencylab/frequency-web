import { Suspense } from 'react'
import { FqIcon } from '@/components/frequency/icon'
import { SpacePayoutSetupPrompt } from '@/components/billing/payout-setup-prompt'
import { StaffPreviewBanner } from '@/components/spaces/staff-preview-banner'
import { PATHS, RateBand, loadMoneyPaths, type MoneyPathState } from '@/app/(main)/spaces/[slug]/settings/payments/payments-body'
import { spaceEarningsSummary } from '@/lib/commerce/orders'
import type { Space } from '@/lib/spaces/types'
import { AdminHead, AdminPageBody, EMPTY, Kpi, n, usd } from '../shared'
import { loadEarnRates } from '../earn-rates'

// ECONOMY, FREQUENCY (design_handoff/frequency/templates/admin/Economy.html). The Space's Get paid page
// (/spaces/[slug]/settings/payments) under SITE_DESIGN=frequency; DAWN keeps its FocusTemplate bands. The
// page's manage gate ran before this renders. Reads: the Space's 30-day earnings (spaceEarningsSummary, the
// read the console Home makes), the money paths and their provable state (loadMoneyPaths, the DAWN band's
// read), and the platform earn rates from zap_config / gem_config (loadEarnRates, read-only; only real rules,
// never the design's placeholder bonuses). The payout setup card and the rate statement follow unchanged.
//
// NO READING, SO THE DESIGN'S EMPTY VALUE ("—"): Next payout, Zaps issued, Gems spent here, every trend, and
// the Revenue by week chart. There is no payout ledger in the app (Stripe pays out on its own schedule), so
// the design's Payouts table is the money-paths table instead, and there is no Statement action to draw.

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
  const [earnings, paths, rates] = await Promise.all([
    spaceEarningsSummary(space.id, 30),
    loadMoneyPaths(space, viewerProfileId, staffViewing),
    loadEarnRates(),
  ])
  const month = new Intl.DateTimeFormat('en-US', { month: 'long' }).format(new Date())

  return (
    <AdminPageBody>
      {staffViewing && <StaffPreviewBanner spaceName={space.brandName ?? space.name} />}
      <AdminHead kicker="Zaps, Gems and payouts" title="Economy" meta={`${month} · next payout ${EMPTY}`} />

      <div className="g4">
        <Kpi
          label="Revenue, 30 days"
          value={usd(earnings.netCents)}
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
            <div className="bars adp-empty" role="img" aria-label="No weekly revenue series yet">
              {EMPTY}
            </div>
          </div>

          <div className="sec-h sec adp-gap">
            <span className="h2">Money paths</span>
          </div>
          <div className="panel tbl-wrap">
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
