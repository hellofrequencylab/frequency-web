import { describe, it, expect } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { member } from './member-profile-modules.fixture'
import { toMemberEntity, resolveMemberBlockData } from '@/lib/entity-blocks/member-adapter'
import { MemberContributionsBlock } from './contributions'

function html(over: { tier?: string; zaps?: number; events?: number; journeys?: number }, content?: Record<string, unknown>) {
  const base = member()
  const m = {
    ...base,
    profile: { ...base.profile, membership_tier: over.tier ?? 'free' },
    totalZaps: over.zaps ?? 0,
    contributionCounts: { eventsHosted: over.events ?? 0, journeysFinished: over.journeys ?? 0 },
  }
  return renderToStaticMarkup(
    <MemberContributionsBlock member={toMemberEntity(m)} data={resolveMemberBlockData(m)} content={content} />,
  )
}

describe('MemberContributionsBlock', () => {
  it('collapses to nothing when there is nothing to show', () => {
    expect(html({})).toBe('')
  })

  it('shows Crew from the real tier, never from a member-supplied value', () => {
    expect(html({ tier: 'crew' })).toContain('Crew')
    expect(html({ tier: 'free' }, { showCrew: true })).toBe('')
  })

  it('defaults to Crew and Zaps, with events and Journeys off', () => {
    const out = html({ tier: 'crew', zaps: 1200, events: 4, journeys: 2 })
    expect(out).toContain('Crew')
    expect(out).toContain('1,200 Zaps')
    expect(out).not.toContain('hosted')
    expect(out).not.toContain('finished')
  })

  it('honours each per-stat switch', () => {
    const out = html(
      { tier: 'crew', zaps: 5, events: 4, journeys: 1 },
      { showCrew: false, showEvents: true, showJourneys: true, showZaps: false },
    )
    expect(out).toContain('4 events hosted')
    expect(out).toContain('1 Journey finished')
    expect(out).not.toContain('>Crew<')
    expect(out).not.toContain('Zaps')
  })

  it('never renders a zero', () => {
    const out = html({ tier: 'crew' }, { showEvents: true, showJourneys: true, showZaps: true })
    expect(out).not.toContain('0 ')
    expect(out).toContain('Crew')
  })
})
