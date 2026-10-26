import { describe, it, expect } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { readFileSync } from 'node:fs'
import { ReachReceipt, type ReachSummary } from './reach-receipt'
import { standingLevers, standingScore } from '@/lib/spaces/standing'

function receipt(profileViews: ReachSummary['profileViews'], attendance: number | null) {
  return renderToStaticMarkup(<ReachReceipt spaceSlug="test" reach={{ windowDays: 30, profileViews, ctaClicks: null, followers: 4, members: 2, upcoming: 1 }} levers={standingLevers(standingScore({ attendance }))} placement={null} listed={false} computedAt={null} />)
}

describe('Reach measurement explanations', () => {
  it('labels page counts as coarse daily buckets without inventing people or attribution', () => {
    const html = receipt(3, 2)
    expect(html).toContain('Daily page views')
    expect(html).toContain('One per signed-in account per UTC day. Anonymous views share one daily count.')
    expect(html).toContain('not unique visitors or proof that the network brought someone here')
    expect(html).toContain('current totals, not new joins in this window')
    expect(html).not.toContain('Counted once per person per day')
  })
  it('explains the actual measured attendance signal and its limits', () => {
    const html = receipt(0, 2)
    expect(html).toContain('Attendance records')
    expect(html).toContain('Repeat attendance counts again')
    expect(html).toContain('Paid tickets count while succeeded and unrefunded')
    expect(html).not.toContain('Attendance is not counted')
    expect(standingScore({ attendance: 2 }).present).toContain('attendance')
    expect(standingScore({ attendance: null }).present).not.toContain('attendance')
    expect(receipt(null, null)).toContain('Not counted yet')
  })
  it('preserves unknown reads through the route and renders a dash rather than zero', () => {
    const html = receipt(null, null)
    expect(html).toContain('A dash means the count is unavailable')
    expect(html).toContain('--')
    const route = readFileSync('app/(main)/spaces/[slug]/settings/reach/page.tsx', 'utf8')
    expect(route).toContain('getSpaceProfileEvidence(space.id, 30)')
    expect(route).not.toContain('getSpaceProfileStats')
    expect(route).toContain('profileViews: stats.profileViews')
  })
})
