import { describe, it, expect } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { member } from './member-profile-modules.fixture'
import { toMemberEntity, resolveMemberBlockData } from '@/lib/entity-blocks/member-adapter'
import { MemberProgramsBlock } from './programs'
import type { SpotlightPrograms } from '@/lib/spotlight/programs.shared'

const PROGRAMS: SpotlightPrograms = {
  circles: [{ id: 'c1', name: 'Dawn Walkers', href: '/circles/dawn-walkers' }],
  journeys: [
    { id: 'j1', name: 'Thirty Days of Sitting', href: '/journeys/thirty-days', finished: false },
    { id: 'j2', name: 'Cold Water Month', href: '/journeys/cold-water', finished: true },
  ],
  spaces: [{ id: 's1', name: 'Harbor Studio', href: '/spaces/harbor-studio' }],
}

function html(content?: Record<string, unknown>, programs: SpotlightPrograms = PROGRAMS) {
  const m = { ...member(), programs }
  return renderToStaticMarkup(
    <MemberProgramsBlock member={toMemberEntity(m)} data={resolveMemberBlockData(m)} content={content} />,
  )
}

describe('MemberProgramsBlock', () => {
  it('renders nothing by default, even when public programs exist (opt-in)', () => {
    expect(html(undefined)).toBe('')
    expect(html({})).toBe('')
    expect(html({ showCircles: false, showJourneys: false, showSpaces: false })).toBe('')
  })

  it('shows only the kinds the member switched on', () => {
    const out = html({ showCircles: true })
    expect(out).toContain('href="/circles/dawn-walkers"')
    expect(out).not.toContain('Thirty Days of Sitting')
    expect(out).not.toContain('Harbor Studio')
  })

  it('shows Journey status and links for each kind when all are on', () => {
    const out = html({ showCircles: true, showJourneys: true, showSpaces: true })
    expect(out).toContain("What I&#x27;m part of")
    expect(out).toContain('On it now')
    expect(out).toContain('Finished')
    expect(out).toContain('href="/journeys/cold-water"')
    expect(out).toContain('href="/spaces/harbor-studio"')
  })

  it('collapses when a kind is on but there is nothing public to show', () => {
    expect(html({ showCircles: true }, { circles: [], journeys: [], spaces: [] })).toBe('')
  })
})
