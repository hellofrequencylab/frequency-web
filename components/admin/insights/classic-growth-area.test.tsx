import { expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
const io = vi.hoisted(() => ({ read: vi.fn() }))
vi.mock('@/lib/analytics/growth-read', () => ({ getGrowthReading: io.read }))
vi.mock('./growth-tools', () => ({ GrowthTools: () => null }))
vi.mock('./live-refresh', () => ({ LiveRefresh: () => null }))
import { GrowthContent } from './growth-tab'
import { growthDashboardFixture } from '@/test/fixtures/growth-dashboard'

it('shows classic growth and the Frequency journey without inventing a linked conversion funnel', async () => {
  io.read.mockResolvedValue({ state: 'available', data: growthDashboardFixture() })
  const html = renderToStaticMarkup(await GrowthContent())
  expect(html).toContain('Classic growth')
  expect(html).toContain('Acquisition')
  expect(html).toContain('Activation')
  expect(html).toContain('Retention')
  expect(html).toContain('Referrals')
  expect(html).toContain('Revenue')
  expect(html).toContain('Growth journey')
  expect(html).toContain('independent populations')
  expect(html).toContain('Space creation is not measured')
  expect(html).not.toContain('Visitor-to-Member conversion')
})
it('uses only mature signup and first-attendance cohorts for activation and retention', async () => {
  const data = growthDashboardFixture()
  data.campaigns = [data.campaigns[0]]
  data.newMembers = data.campaigns[0].signups
  io.read.mockResolvedValue({ state: 'available', data })
  const html = renderToStaticMarkup(await GrowthContent())
  expect(html).toContain('12 of 30 eligible new Members')
  expect(html).toContain('10 new Members are still inside their seven-day follow-up')
  expect(html).toContain('Return within 28 days')
  expect(html).toContain('Referral outcomes are not measured')
  expect(html).toContain('Revenue is not linked to these cohorts')
})
it('withholds empty-cohort rates and never represents missing referral or revenue evidence as zero', async () => {
  const data = growthDashboardFixture({ newMembers: 0, campaigns: [], repeatEligible: 0, repeatReturned: 0 })
  io.read.mockResolvedValue({ state: 'available', data })
  const html = renderToStaticMarkup(await GrowthContent())
  expect(html).toContain('No signup cohort has complete seven-day follow-up')
  expect(html).toContain('No first-attendance cohort has complete 28-day follow-up')
  const classic = html.slice(html.indexOf('Classic growth'), html.indexOf('Growth journey'))
  expect(classic).not.toContain('$0')
  expect(classic).not.toContain('NaN')
  expect(classic).not.toContain('href="/admin/insights?tab=financials"')
})
