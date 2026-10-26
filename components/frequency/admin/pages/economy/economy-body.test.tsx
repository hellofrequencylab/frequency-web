import { describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import type { ReactNode } from 'react'
import type { Space } from '@/lib/spaces/types'
const m = vi.hoisted(() => ({ report: vi.fn(), legacy: vi.fn() }))
vi.mock('@/lib/commerce/orders', () => ({ spaceEarningsSummary: m.legacy }))
vi.mock('../space-reads', () => ({ loadSpaceRevenueSeries: m.report }))
vi.mock('../earn-rates', () => ({ loadEarnRates: async () => [] }))
vi.mock('@/app/(main)/spaces/[slug]/settings/payments/payments-body', () => ({ PATHS: [], loadMoneyPaths: async () => [], RateBand: () => null }))
vi.mock('@/components/billing/payout-setup-prompt', () => ({ SpacePayoutSetupPrompt: () => null }))
vi.mock('@/components/spaces/staff-preview-banner', () => ({ StaffPreviewBanner: () => null }))
vi.mock('@/components/frequency/icon', () => ({ FqIcon: () => null }))
vi.mock('./statement-button', () => ({ StatementButton: () => null }))
vi.mock('../shared', () => ({
  AdminPageBody: ({ children }: { children: ReactNode }) => <div>{children}</div>, AdminHead: () => null,
  EMPTY: 'Unavailable', Kpi: ({ label, value, note }: { label: string; value: ReactNode; note?: string }) => <div>{label}: {value} {note}</div>,
  WeekBars: () => null, n: String, trendOf: () => undefined, usd: (value: number) => `$${(value / 100).toFixed(2)}`,
}))
import { FqEconomyBody } from './economy-body'
const props = { space: { id: 'A', slug: 'walks', name: 'Walks' } as Space, viewerProfileId: 'owner', staffViewing: false }

describe('one complete revenue reading for the Economy screen', () => {
  it('uses the same complete source as the chart, not a separate truncated headline', async () => {
    m.report.mockResolvedValue({ weeks: [104500], last30: 104500, prior30: 0, summary30: { netCents: 104500, orderCount: 1100 } })
    m.legacy.mockResolvedValue({ netCents: 95000, orderCount: 1000 })
    const html = renderToStaticMarkup(await FqEconomyBody(props))
    expect(html).toContain('$1045.00')
    expect(html).not.toContain('$950.00')
    expect(m.legacy).not.toHaveBeenCalled()
  })
  it('shows unavailable rather than zero money when the complete report fails', async () => {
    m.report.mockResolvedValue(null)
    const html = renderToStaticMarkup(await FqEconomyBody(props))
    expect(html).toContain('Revenue is unavailable or incomplete')
    expect(html).not.toContain('$0.00')
    expect(html).not.toContain('No sales yet')
  })
})
