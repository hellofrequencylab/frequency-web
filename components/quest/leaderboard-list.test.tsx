// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { LeaderboardList, EFFORT_BAND_CHIP, type LeaderboardListEntry } from './leaderboard-list'

// The row contract for a SELF-RELATIVE board (the owner's Circle-board ruling). These fail on the
// pre-change tree: LeaderboardList had two tracks, both absolute, and rendered a position number on
// every row unconditionally — there was no way to draw a row that is not in a ranking.
//
// The RANKED crew board's defaults are asserted here too, so the shared component cannot be
// changed for the Circle without someone noticing that /crew/leaderboard moved.

let container: HTMLDivElement | null = null
let root: Root | null = null

afterEach(() => {
  if (root) act(() => root!.unmount())
  if (container) container.remove()
  root = null
  container = null
})

function mount(ui: React.ReactElement) {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  act(() => root!.render(ui))
  return container
}

function entry(over: Partial<LeaderboardListEntry> & { id: string; displayName: string }): LeaderboardListEntry {
  return {
    handle: over.displayName.toLowerCase(),
    avatarUrl: null,
    seasonRank: 'ghost',
    seasonZaps: 0,
    streak: 0,
    ...over,
  }
}

const SIX = ['Ana', 'Bo', 'Cy', 'Dee', 'Eli', 'Fay'].map((n) =>
  entry({ id: n, displayName: n, effort: { band: 'steady', index: 100, daysThisWeek: 4 } }),
)

describe('LeaderboardList — the self-relative board', () => {
  it('renders NO position numbers when showPosition is false', () => {
    const el = mount(<LeaderboardList entries={SIX} track="effort" selfId="Ana" showPosition={false} />)
    // Six rows, and none of them opens with "1", "2", … The rank chips are the only pills.
    expect(el.querySelectorAll('li')).toHaveLength(6)
    for (const li of el.querySelectorAll('li')) {
      expect(li.textContent?.trimStart().startsWith('1')).toBe(false)
    }
    expect(el.textContent).not.toMatch(/\b6\b/)
  })

  it('shows each member percent of their OWN usual week, never a gap to anyone else', () => {
    const el = mount(
      <LeaderboardList
        entries={[entry({ id: 'a', displayName: 'Ana', effort: { band: 'climbing', index: 160, daysThisWeek: 5 } })]}
        track="effort"
        selfId="a"
        showPosition={false}
      />,
    )
    expect(el.textContent).toContain('160')
    expect(el.textContent).toContain('% of usual')
    expect(el.textContent).not.toMatch(/behind|ahead|of \d/i)
  })

  it('shows DAYS SHOWN UP for a member with no usual week yet, not a fabricated percentage', () => {
    const el = mount(
      <LeaderboardList
        entries={[entry({ id: 'r', displayName: 'Rookie', effort: { band: 'new', index: null, daysThisWeek: 2 } })]}
        track="effort"
        selfId="x"
        showPosition={false}
      />,
    )
    expect(el.textContent).toContain('2')
    expect(el.textContent).toContain('days this week')
    expect(el.textContent).not.toContain('% of usual')
    expect(el.textContent).toContain(EFFORT_BAND_CHIP.new.label)
  })

  it('singularises the day label at one', () => {
    const el = mount(
      <LeaderboardList
        entries={[entry({ id: 'r', displayName: 'Rookie', effort: { band: 'returning', index: null, daysThisWeek: 1 } })]}
        track="effort"
        selfId="x"
        showPosition={false}
      />,
    )
    expect(el.textContent).toContain('day this week')
    expect(el.textContent).not.toContain('days this week')
  })

  it('replaces the season-rank chip with the member own band, so no cross-member ladder survives', () => {
    const el = mount(
      <LeaderboardList
        entries={[entry({ id: 'a', displayName: 'Ana', seasonRank: 'master', effort: { band: 'easing', index: 40, daysThisWeek: 1 } })]}
        track="effort"
        selfId="a"
        showPosition={false}
      />,
    )
    expect(el.textContent).toContain(EFFORT_BAND_CHIP.easing.label)
    expect(el.textContent?.toLowerCase()).not.toContain('master')
  })

  it('never says a member is last, whatever the band', () => {
    const el = mount(<LeaderboardList entries={SIX} track="effort" selfId="Fay" showPosition={false} />)
    expect(el.textContent?.toLowerCase()).not.toMatch(/last|bottom|\d+(st|nd|rd|th) of/)
  })
})

describe('LeaderboardList — the ranked crew board is untouched', () => {
  const ranked = [
    entry({ id: 'a', displayName: 'Ana', seasonZaps: 900 }),
    entry({ id: 'b', displayName: 'Bo', seasonZaps: 300 }),
  ]

  it('still numbers rows by default', () => {
    const el = mount(<LeaderboardList entries={ranked} track="zaps" selfId="a" />)
    const positions = [...el.querySelectorAll('li')].map((li) => li.textContent?.trimStart()[0])
    expect(positions).toEqual(['1', '2'])
  })

  it('still shows the season-rank chip when a row carries no effort score', () => {
    const el = mount(<LeaderboardList entries={ranked} track="zaps" selfId="a" />)
    expect(el.textContent).toContain('900')
    expect(el.textContent).toContain('Zaps')
  })
})
