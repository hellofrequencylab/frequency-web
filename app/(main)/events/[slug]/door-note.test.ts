import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { sourceWithoutComments } from '@/test/source-shape'
import { doorNoteFor, DOOR_REASONS, type DoorReason } from './door-note'

// LIVE-157. The QR door has redirected to `/events/<slug>?door=<reason>` since SCAN-566, and the
// event page read `ticket` / `session_id` / `claimed` / `claim` and nothing else, so the reason a
// scan did not check someone in was carried to the page and shown to nobody.
//
// Two things are tested here, because either one alone would pass on a broken tree: that every
// reason the door can emit has a line (the COPY), and that the page actually reads the parameter
// and renders it (the WIRING). A map nobody mounts is the orphaned-action shape claim-wiring.test
// exists to catch.

const PAGE = 'app/(main)/events/[slug]/page.tsx'
const ROUTE = 'app/q/[slug]/route.ts'
const ACTIONS = 'app/(main)/events/actions.ts'

// Comment- and import-free (LIVE-167): the page's needles must hit the call and the render.
const page = sourceWithoutComments(PAGE, { imports: true })
const route = readFileSync(ROUTE, 'utf8')
const actions = readFileSync(ACTIONS, 'utf8')

describe('every reason the door can emit has a line', () => {
  it('covers all eight tokens', () => {
    for (const reason of DOOR_REASONS) {
      expect(doorNoteFor(reason), reason).toBeTruthy()
    }
    expect(DOOR_REASONS).toHaveLength(8)
  })

  it('matches the door route and the action, so a new reason cannot ship unspoken', () => {
    // The union the ACTION declares (CheckInFailReason) plus the two the ROUTE adds. Read from
    // source rather than restated, or this test pins a copy of the list instead of the list.
    const union = actions.slice(actions.indexOf('export type CheckInFailReason'))
    const checkInReasons = [...union.slice(0, union.indexOf('export interface')).matchAll(/'([a-z_]+)'/g)].map(
      (m) => m[1],
    )
    const doorExtras = [
      ...route
        .slice(route.indexOf('type DoorOutcome'))
        .slice(0, 120)
        .matchAll(/'([a-z_]+)'/g),
    ].map((m) => m[1])
    expect(checkInReasons.length).toBeGreaterThan(0)
    expect(doorExtras).toEqual(['rsvp_refused', 'failed'])
    expect([...DOOR_REASONS].sort()).toEqual([...checkInReasons, ...doorExtras].sort())
  })

  it('renders nothing for an absent or unrecognised value', () => {
    // `?door=` arrives in a URL anyone can type. Noise is silence, never a message.
    expect(doorNoteFor(undefined)).toBeNull()
    expect(doorNoteFor(null)).toBeNull()
    expect(doorNoteFor('')).toBeNull()
    expect(doorNoteFor('not_a_reason')).toBeNull()
    expect(doorNoteFor('constructor')).toBeNull()
    expect(doorNoteFor('__proto__')).toBeNull()
  })
})

describe('the copy holds the voice canon (docs/CONTENT-VOICE.md §10)', () => {
  const lines = DOOR_REASONS.map((r) => doorNoteFor(r)!)

  it('uses no em dashes', () => {
    for (const line of lines) expect(line, line).not.toContain('—')
  })

  it('stays to one short, plain line with at most one sentence of instruction', () => {
    for (const line of lines) {
      expect(line.length, line).toBeLessThanOrEqual(120)
      // Sentence case: never SHOUTING. `RSVP` is the product's own noun (docs/NAMING.md) and is
      // the only run of capitals allowed through.
      expect(line.replace(/\bRSVP\b/g, ''), line).not.toMatch(/\b[A-Z]{3,}\b/)
      expect(line, line).not.toContain('!')
      expect(line.endsWith('.'), line).toBe(true)
    }
  })

  it('never narrates the reader’s feelings and never apologises in hype', () => {
    const banned = /\b(sorry|oops|uh oh|whoops|unfortunately|sadly|frustrat|don'?t worry|no worries|awkward)\b/i
    for (const line of lines) expect(line, line).not.toMatch(banned)
  })

  it('tells the member what happened, in the product’s own words', () => {
    // Every line names the scan or the door, so the sentence stands on its own if it is the only
    // thing the person reads.
    for (const line of lines) expect(line, line).toMatch(/scan|door/i)
  })

  it('gives the two reasons the member can act on a next step', () => {
    expect(doorNoteFor('signed_out')).toContain('Sign in')
    // "Going" is the RSVP control's own label (components/events/rsvp-controls.tsx).
    expect(doorNoteFor('not_going')).toContain('Going')
  })
})

describe('the event page reads the parameter and renders the line', () => {
  it('declares door on the searchParams type', () => {
    expect(page, 'the page still ignores ?door=').toMatch(/door\?: string/)
  })

  it('resolves the note through the map rather than inlining copy', () => {
    expect(page).not.toMatch(/function doorNoteFor\b/)
    expect(page).toContain('doorNoteFor(sp.door)')
  })

  it('mounts the line in the RSVP box', () => {
    expect(page, 'doorNote is computed and never rendered').toContain('{doorNote}')
    // Near the RSVP control, which is the only place the sentence is actionable: the note must
    // appear inside the join box, ahead of the answer switch.
    const noteIdx = page.indexOf('{doorNote}')
    const controlIdx = page.indexOf('<RsvpControls')
    const boxIdx = page.indexOf('const joinActions = (')
    expect(noteIdx).toBeGreaterThan(boxIdx)
    expect(noteIdx).toBeLessThan(controlIdx)
  })
})

// A compile-time check that the exported union stays the shape the page consumes.
const _reason: DoorReason = 'window_closed'
void _reason
