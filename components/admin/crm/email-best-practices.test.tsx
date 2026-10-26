// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import type { MarketingEmailOverview } from '@/lib/email-studio/analytics'
import { EmailBestPractices } from './email-best-practices'

const empty: MarketingEmailOverview = {
  sent: 0, delivered: 0, opened: 0, clicked: 0, bounced: 0, complained: 0,
  unsubscribed: 0, openRate: 0, clickRate: 0, bounceRate: 0, complaintRate: 0,
  unsubscribeRate: 0, deliveryRate: 0, lastEventAt: null, campaignsSent: 0,
}
function cards(patch: Partial<MarketingEmailOverview> = {}) {
  const document = new DOMParser().parseFromString(renderToStaticMarkup(<EmailBestPractices overview={{ ...empty, ...patch }} />), 'text/html')
  return [...document.querySelectorAll('div.grid')[0].children].map(card => card.textContent ?? '')
}
describe('email health advice requires its measurement denominator', () => {
  it('renders unknown guidance for every health card with no recorded sends or deliveries', () => {
    const rows = cards()
    expect(rows.every(row => row.includes('No data') && row.includes('No data yet'))).toBe(true)
    expect(rows[0]).toContain('Bounce rate needs recorded sends.')
    expect(rows.slice(1).every(row => row.includes('needs recorded deliveries.'))).toBe(true)
    expect(rows.join(' ')).not.toMatch(/On track|Needs a look|list is clean|not marking you as spam|below target|spike in opt-outs/)
  })
  it('uses recorded sends for bounce advice while delivery-dependent cards remain unknown', () => {
    const rows = cards({ sent: 10, bounced: 10, bounceRate: 1 })
    expect(rows[0]).toContain('100.0%')
    expect(rows[0]).toContain('High bounces hurt')
    expect(rows.slice(1).every(row => row.includes('No data yet') && row.includes('needs recorded deliveries.'))).toBe(true)
  })
  it.each([
    [0.019, 0.0009, 0.02, 0.0049, ['On track', 'On track', 'On track', 'On track']],
    [0.02, 0.001, 0.019, 0.005, ['Needs a look', 'Needs a look', 'Needs a look', 'Needs a look']],
  ] as const)('retains measured threshold grades (%s/%s/%s/%s)', (bounceRate, complaintRate, clickRate, unsubscribeRate, grades) => {
    const rows = cards({ sent: 10000, delivered: 10000, bounceRate, complaintRate, clickRate, unsubscribeRate })
    rows.forEach((row, i) => { expect(row).toContain(grades[i]); expect(row).not.toContain('No data') })
  })
  it('describes a low nonzero complaint rate as below target rather than claiming no complaints', () => {
    const rows = cards({ sent: 10000, delivered: 10000, complained: 1, complaintRate: 0.0001 })
    expect(rows[1]).toContain('0.01%')
    expect(rows[1]).toContain('Recorded complaints are below target.')
    expect(rows[1]).not.toContain('not marking you as spam')
  })
})
