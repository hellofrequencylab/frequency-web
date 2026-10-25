// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'

const mocks = vi.hoisted(() => ({ metrics: vi.fn(), timeline: vi.fn(), coach: vi.fn() }))
vi.mock('@/app/(main)/admin/email-studio/panel-actions', () => ({ campaignMetricsAction: mocks.metrics, campaignTimelineAction: mocks.timeline, campaignCoachAction: mocks.coach }))
vi.mock('@/components/admin/spark-charts', () => ({ TrendArea: () => <div data-testid="spark" /> }))
import { CampaignAnalyticsExpansion } from './campaign-analytics-expansion'
;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

let container: HTMLDivElement
let root: Root
beforeEach(() => {
  vi.resetAllMocks()
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  mocks.metrics.mockResolvedValue({ hasSent: true, attributionMode: 'exact', sent: 4, delivered: 4, opened: 8, clicked: 6, bounced: 0, complained: 0, unsubscribed: 0, openRate: 2, clickRate: 1.5, bounceRate: 0 })
  mocks.timeline.mockResolvedValue({ opens: [8, 0], clicks: [6, 0] })
  mocks.coach.mockResolvedValue({ ok: true, source: 'checklist', analysis: 'How will you record attendance?', limitations: ['Outcomes are unknown, not zero.'] })
})
afterEach(async () => { await act(async () => root.unmount()); container.remove() })

describe('campaign outcome coaching panel', () => {
  it('lets an operator choose their outcome and clearly separates it from email events', async () => {
    await act(async () => root.render(<CampaignAnalyticsExpansion campaignId="campaign" />))
    expect(container.textContent).toContain('Outcome attribution is not available')
    expect(container.textContent).toContain('not verified people')
    expect(container.textContent).toContain('Recorded clicks per day')
    expect(mocks.coach).not.toHaveBeenCalled()
    const select = container.querySelector('select')!
    await act(async () => { select.value = 'bookings'; select.dispatchEvent(new Event('change', { bubbles: true })) })
    await act(async () => container.querySelector('button')!.click())
    expect(mocks.coach).toHaveBeenCalledWith('campaign', 'bookings')
    expect(container.textContent).toContain('you write the message')
    expect(container.textContent).toContain('Guided checklist')
    expect(container.textContent).toContain('unknown, not zero')
    await act(async () => { select.value = 'replies'; select.dispatchEvent(new Event('change', { bubbles: true })) })
    expect(container.textContent).not.toContain('How will you record attendance?')
    expect(container.querySelector('button')!.textContent).toContain('Review my next step')
  })

  it('keeps the checklist reachable for a send without tagged engagement', async () => {
    mocks.metrics.mockResolvedValue({ hasSent: true, attributionMode: 'legacy', attributedRecipients: 4 })
    await act(async () => root.render(<CampaignAnalyticsExpansion campaignId="legacy" />))
    expect(container.textContent).toContain('Campaign-tagged engagement is unavailable')
    expect(container.querySelector('button')!.disabled).toBe(false)
  })
})
