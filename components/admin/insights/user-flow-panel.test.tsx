import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { growthDashboardFixture } from '@/test/fixtures/growth-dashboard'
import { UserFlowPanel } from './user-flow-panel'

describe('aggregate people and flow readout', () => {
  it('separates measured populations from unmeasured arrival and online counts', async () => {
    const html = renderToStaticMarkup(await UserFlowPanel({ snapshot: growthDashboardFixture() }))
    expect(html).toContain('People, actions and flow blockers')
    expect(html).toContain('Measurement gaps')
    expect(html).toContain('People and actions')
    expect(html).not.toContain('NaN')
    expect(html).toContain('not a count of people online')
  })
  it('separates mature builder friction from pending follow-up and labels the evidence limit', async () => {
    const html = renderToStaticMarkup(await UserFlowPanel({ snapshot: growthDashboardFixture() }))
    expect(html).toContain('Measured flow friction')
    expect(html).toContain('Completed follow-up')
    expect(html).toContain('Still observing')
    expect(html).toContain('No identities or individual browsing histories')
    expect(html).toContain('same measured cohort')
    expect(html).toContain('role="progressbar"')
    const friction = html.slice(html.indexOf('Measured flow friction'), html.indexOf('Measurement gaps'))
    expect(friction).toContain('35 of 60 visits with a full seven-day follow-up')
  })
  it('prioritizes a known marker coverage gap instead of declaring it measured abandonment', () => {
    const snapshot = growthDashboardFixture()
    snapshot.measurement.signupEventsObserved = 0
    const html = renderToStaticMarkup(UserFlowPanel({ snapshot }))
    const friction = html.slice(html.indexOf('Measured flow friction'), html.indexOf('Measurement gaps'))
    expect(friction).toContain('No measured step loss meets the investigation threshold')
    expect(friction).not.toContain('35 of 60 visits')
    expect(html).toContain('Reconcile new-member tracking')
    expect(html).toContain('coverage gap, not user abandonment')
  })
  it('does not display an unmeasured returning population as zero people', () => {
    const html = renderToStaticMarkup(UserFlowPanel({ snapshot: growthDashboardFixture({ repeatEligible: 0, repeatReturned: 0 }) }))
    const returningCard = html.slice(html.indexOf('Members returning'), html.indexOf('Complete 28-day follow-up'))
    expect(returningCard).toContain('Not measured')
  })
  it('does not describe an invalid cohort as absent traffic or mature abandonment', () => {
    const snapshot = growthDashboardFixture()
    snapshot.builder[1].matureVisits = snapshot.builder[0].matureVisits + 1
    const html = renderToStaticMarkup(UserFlowPanel({ snapshot }))
    expect(html).toContain('Ordered builder measurement is unavailable')
    expect(html).toContain('Repair the ordered builder reading')
    expect(html).not.toContain('There is no mature opening cohort yet')
  })
})
