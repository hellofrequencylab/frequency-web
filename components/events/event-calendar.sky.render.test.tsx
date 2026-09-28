// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { EventCalendar } from './event-calendar'
import type { AstroMarker } from '@/lib/calendar/astro-markers'

// THE SKY REACHES THE MEMBER'S GRID (LIVE-526), which is the one thing a source-reading probe
// cannot tell you. LIVE-478's lesson, quoted in calendar-workspace.tsx: "The marker has to be on
// markup that actually renders for the audience that needs the control, not merely present in this
// file: the LIVE-478 probe reads the source, so an `adminAllowed` wrapper around it satisfied the
// gate while shipping a member a grid with no way out of it."
//
// So this mounts the grid in the GUEST shape: no `dayNotes`, no `onCreateAt`, no staff chrome, and
// `audience` left at its default. If a future change gates the marker behind staff-only markup,
// every case below fails.

let container: HTMLDivElement | null = null
let root: Root | null = null

afterEach(() => {
  act(() => root?.unmount())
  container?.remove()
  container = null
  root = null
})

function mount(node: React.ReactNode) {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  act(() => root!.render(node))
  return container!
}

const FULL_MOON: AstroMarker = {
  day: '2026-10-25',
  kind: 'full-moon',
  at: '2026-10-26T04:11:49.432Z',
  label: 'Full moon',
  symbol: '🌕',
}

const LIBRA: AstroMarker = {
  day: '2026-09-23',
  kind: 'sign-ingress',
  at: '2026-09-23T00:05:38.617Z',
  label: 'Sun enters Libra, September equinox',
  symbol: '♎',
  sign: 'libra',
  solarPoint: 'september-equinox',
}

const guestGrid = (markers: readonly AstroMarker[], month1 = 10) => (
  <EventCalendar events={[]} initialYear={2026} initialMonth1={month1} skyMarkers={markers} />
)

describe('the sky on a member grid', () => {
  it('draws the marker in the day cell a MEMBER sees, with no staff chrome mounted', () => {
    const el = mount(guestGrid([FULL_MOON]))
    const cell = el.querySelector('[data-day-cell="2026-10-25"]')
    expect(cell, 'the 25th should be in an October 2026 grid').not.toBeNull()
    const marker = cell!.querySelector('[data-sky-marker]')
    expect(marker, 'no sky marker in the member day cell').not.toBeNull()
    expect(marker!.getAttribute('data-sky-marker')).toBe('full-moon')
    expect(marker!.textContent).toContain('🌕')
  })

  it('gives a screen reader the sentence, not the emoji', () => {
    const el = mount(guestGrid([FULL_MOON]))
    const marker = el.querySelector('[data-day-cell="2026-10-25"] [data-sky-marker]')!
    // The glyph is decorative; the words are the accessible name.
    expect(marker.querySelector('[aria-hidden]')?.textContent).toBe('🌕')
    expect(marker.querySelector('.sr-only')?.textContent).toBe('Full moon')
    expect(marker.getAttribute('title')).toBe('Full moon')
  })

  it('carries both facts on a cardinal day', () => {
    const el = mount(guestGrid([LIBRA], 9))
    const marker = el.querySelector('[data-day-cell="2026-09-23"] [data-sky-marker]')
    expect(marker, 'the September equinox should draw on the 23rd').not.toBeNull()
    expect(marker!.getAttribute('data-sky-marker')).toBe('sign-ingress')
    expect(marker!.querySelector('.sr-only')?.textContent).toBe('Sun enters Libra, September equinox')
    // docs/NAMING.md locks "season" for the Quest.
    expect(marker!.textContent?.toLowerCase()).not.toContain('season')
  })

  it('marks only the day it belongs to', () => {
    const el = mount(guestGrid([FULL_MOON]))
    expect(el.querySelectorAll('[data-sky-marker]')).toHaveLength(1)
    expect(el.querySelector('[data-day-cell="2026-10-26"] [data-sky-marker]')).toBeNull()
    expect(el.querySelector('[data-day-cell="2026-10-24"] [data-sky-marker]')).toBeNull()
  })

  // A Space that has not opted in passes an empty array, and the square must look exactly as it
  // did before this feature existed: no empty span, no stray gap in the header row.
  it('draws nothing at all when the Space has not opted in', () => {
    const el = mount(guestGrid([]))
    expect(el.querySelectorAll('[data-sky-marker]')).toHaveLength(0)
  })

  it('draws nothing when the prop is absent entirely', () => {
    const el = mount(<EventCalendar events={[]} initialYear={2026} initialMonth1={10} />)
    expect(el.querySelectorAll('[data-sky-marker]')).toHaveLength(0)
  })

  it('stacks two markers that fall on one day', () => {
    const twoOnOneDay: AstroMarker[] = [
      FULL_MOON,
      { ...FULL_MOON, kind: 'sign-ingress', label: 'Sun enters Scorpio', symbol: '♏', sign: 'scorpio' },
    ]
    const el = mount(guestGrid(twoOnOneDay))
    const marker = el.querySelector('[data-day-cell="2026-10-25"] [data-sky-marker]')!
    expect(marker.querySelector('[aria-hidden]')?.textContent).toBe('🌕♏')
    expect(marker.querySelector('.sr-only')?.textContent).toBe('Full moon, Sun enters Scorpio')
  })
})
