import { describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
vi.mock('@/components/frequency/admin/pages/space-reads', () => ({ loadSpaceCheckins: vi.fn() }))
vi.mock('@/lib/spaces/analytics', () => ({ getSpaceProfileEvidence: vi.fn() }))
import { getSpaceProfileEvidence } from '@/lib/spaces/analytics'
import { loadSpaceCheckins } from '@/components/frequency/admin/pages/space-reads'
import { SpaceCoachingCard, SpaceCoachingCardView } from './space-coaching-card'

describe('Space coaching evidence card', () => {
  it('renders one human-authored next step with evidence, confidence, limits and an encoded owner route', () => {
    const html = renderToStaticMarkup(<SpaceCoachingCardView slug="Thursday / walks" identity={{ name: 'Thursday', tagline: '', about: 'Walks' }} observed={{ windowDays: 30, observedFrom: '2026-09-25T00:00:00.000Z', observedThrough: '2026-10-25T00:00:00.000Z', profileViews: 7, ctaClicks: null }} />)
    expect(html).toContain('confirmed gap')
    expect(html).toContain('7 recorded profile-view buckets')
    expect(html).toContain('Primary-button measurement is unavailable')
    expect(html).toContain('/spaces/Thursday%20%2F%20walks/manage?section=settings')
    expect(html).toContain('No click-to-person conversion rate')
    expect(html).toContain('Nothing is sent automatically')
    expect(html).toContain('In your own words')
    expect(html.match(/<h3/g)).toHaveLength(1)
  })
})


it('loads only the requested Space and reduces attendance to aggregate evidence', async () => {
  const profile = { windowDays: 30, observedFrom: '2026-09-25T00:00:00.000Z', observedThrough: '2026-10-25T00:00:00.000Z', profileViews: 7, ctaClicks: 1 }
  vi.mocked(getSpaceProfileEvidence).mockResolvedValue(profile)
  vi.mocked(loadSpaceCheckins).mockResolvedValue([{ profileId: 'private-member-id', at: Date.parse('2026-10-20T00:00:00.000Z'), eventId: 'private-event-id' }])
  const html = renderToStaticMarkup(await SpaceCoachingCard({ spaceId: 'one-space', slug: 'walks', identity: { name: 'Walks', tagline: 'Weekly', about: 'A walk' } }))
  expect(getSpaceProfileEvidence).toHaveBeenCalledWith('one-space', 30)
  expect(loadSpaceCheckins).toHaveBeenCalledWith('one-space')
  expect(html).toContain('1 distinct attendee')
  expect(html).not.toContain('private-member-id')
  expect(html).not.toContain('private-event-id')
  expect(profile).not.toHaveProperty('attendance')
})
