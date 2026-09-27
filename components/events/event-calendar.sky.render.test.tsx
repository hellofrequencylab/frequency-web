// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { EventCalendar } from './event-calendar'

// THE SKY ON THE GRID (owner directive 2026-09-27): every new moon, full moon, equinox and solstice
// marked on the day it falls on, on every calendar. This reads the real DOM rather than the module
// that computes the days (lib/calendar/sky.test.ts covers the arithmetic), because the two ways this
// feature fails are both here: a marker that never reaches a cell, and a marker on the wrong cell
// because the grid read the day in the wrong zone.

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

/** The marker element on a day, by the accessible name the cell's own square carries. */
function markers(el: HTMLElement): { label: string; emoji: string }[] {
  return [...el.querySelectorAll('[role="img"]')].map((n) => ({
    label: n.getAttribute('aria-label') ?? '',
    emoji: n.textContent ?? '',
  }))
}

describe('the calendar marks the sky', () => {
  it('marks September 2026: the new moon, the full moon and the equinox', () => {
    const el = mount(
      <EventCalendar events={[]} initialYear={2026} initialMonth1={9} timeZone="America/Los_Angeles" />,
    )
    const found = markers(el)
    const labels = found.map((m) => m.label)
    expect(labels).toContain('New moon')
    expect(labels).toContain('Full moon')
    expect(labels).toContain('Autumn equinox')
    // One character each, and the words are what a screen reader gets.
    for (const m of found) expect(m.emoji.length).toBeGreaterThan(0)
    // A six-week grid holds one of each phase, sometimes two; never a wall of them.
    expect(found.length).toBeGreaterThanOrEqual(3)
    expect(found.length).toBeLessThanOrEqual(8)
  })

  it('reads the day in the zone it is given', () => {
    // The 2026 autumn equinox is 00:05 UTC on Sep 23, so Vista sees it on the 22nd and UTC on the
    // 23rd. The marker rides in the same cell as the day number, so the cell's text says which day.
    const inVista = mount(
      <EventCalendar events={[]} initialYear={2026} initialMonth1={9} timeZone="America/Los_Angeles" />,
    )
    const vistaCell = [...inVista.querySelectorAll('[role="img"][aria-label="Autumn equinox"]')]
      .map((n) => n.parentElement?.textContent ?? '')
    expect(vistaCell.join('|')).toContain('22')
    act(() => root?.unmount())
    container?.remove()

    const inUtc = mount(<EventCalendar events={[]} initialYear={2026} initialMonth1={9} />)
    const utcCell = [...inUtc.querySelectorAll('[role="img"][aria-label="Autumn equinox"]')]
      .map((n) => n.parentElement?.textContent ?? '')
    expect(utcCell.join('|')).toContain('23')
  })

  it('draws the marker beside the day number, taking no row from the cell', () => {
    const el = mount(
      <EventCalendar events={[]} initialYear={2026} initialMonth1={12} timeZone="America/Los_Angeles" />,
    )
    const solstice = el.querySelector('[role="img"][aria-label="Winter solstice"]')
    expect(solstice, 'December 2026 shows the solstice').not.toBeNull()
    // Its sibling is the day pill, so the two read as one corner rather than the marker becoming a
    // chip that pushes an event out of a busy square.
    const pill = solstice?.nextElementSibling
    expect(pill?.textContent).toBe('21')
  })
})
