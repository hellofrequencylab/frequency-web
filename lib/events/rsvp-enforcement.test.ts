import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'

// SOURCE-SHAPE tests for where the two windows are ENFORCED (ADR-1174, ADR-1175).
//
// Why source-shape: every one of these call sites is inside a `'use server'` action that reaches
// straight for a service-role Supabase handle, so exercising them here would mean mocking the whole
// client and asserting against the mock. The RULES are pure and behaviourally tested next door
// (rsvp-window.test.ts, checkin-window.test.ts). What is left to pin is that the actions actually
// CALL them, because the defect both ADRs describe is precisely a rule that existed and was never
// consulted: the booking window was written and printed for months while every RSVP path ignored
// it, and check-in had an opening bound and no closing one.

const read = (p: string) => readFileSync(path.join(process.cwd(), p), 'utf8')
const ACTIONS = read('app/(main)/events/actions.ts')
const PAGE = read('app/(main)/events/[slug]/page.tsx')
const SQL = read('supabase/migrations/20270343000000_guest_rsvp_honours_the_booking_window.sql')

describe('the booking window gates the MEMBER paths', () => {
  it('the shared gate consults the window and the end of the event', () => {
    const fn = ACTIONS.slice(
      ACTIONS.indexOf('async function eventOpenForRsvp('),
      ACTIONS.indexOf('// Drop / update / remove the "<Name> RSVP'),
    )
    expect(fn).toContain('rsvpWindowStateFromDetails(')
    // A finished event takes no RSVP either; the page has hidden the controls since #2319 and the
    // action never enforced it, so a stale tab still minted a seat.
    expect(fn).toMatch(/isEventPast\(ev\.starts_at, ev\.ends_at, zone\)/)
  })

  it('every path that TAKES a seat checks windowOpen', () => {
    // toggleRSVP's re-join and first-RSVP branches, setRsvpStatus's 'going', and a plus-one
    // increase. Four, and the count is the assertion: a fifth join path added without the check is
    // the regression this pins.
    expect(ACTIONS.match(/gate\.windowOpen/g)?.length ?? 0).toBeGreaterThanOrEqual(4)
  })

  it('LEAVING is never gated on the window — closing RSVPs must not lock people in', () => {
    // The rule is stated as `intent === 'going'`, not `intent !== 'not_going'`: moving to 'maybe'
    // gives a seat up too, so it stays available after the window shuts.
    expect(ACTIONS).toMatch(/if \(!gate\.windowOpen && intent === 'going'\) return/)
    expect(ACTIONS).not.toMatch(/intent !== 'not_going'/)
  })

  it('a plus-one INCREASE is gated but a decrease is not', () => {
    expect(ACTIONS).toMatch(/if \(n > current && \(!gate\.open \|\| !gate\.windowOpen\)\) return/)
  })
})

describe('the booking window gates the GUEST door, in the SQL', () => {
  it('the anon-reachable capture function reads the window and refuses outside it', () => {
    // This function is granted to anon and reachable over PostgREST directly, so a guard that
    // lived only in the server action would be a guard a caller can decline to use.
    expect(SQL).toContain("-> 'rsvpWindow'")
    expect(SQL).toMatch(/or \(v_opens is not null and now\(\) < v_opens\)/)
    expect(SQL).toMatch(/or \(v_closes is not null and now\(\) >= v_closes\)/)
  })

  it('resolves both bounds in the EVENT’s zone, never as raw UTC', () => {
    // Comparing the stored wall clock to now() is the seven-hours-early bug 20270328000000 fixed.
    expect(SQL.match(/at time zone v_tz/g)?.length ?? 0).toBeGreaterThanOrEqual(3)
  })

  it('FAILS OPEN: a backwards window is no window', () => {
    expect(SQL).toMatch(/if v_opens is not null and v_closes is not null and v_closes <= v_opens then/)
  })

  it('keeps the anti-oracle property — a window rejection returns the same receipt', () => {
    // The window branches sit inside the one `return v_receipt` block with every other rejection,
    // so a caller still cannot tell a closed event from a private one from one that never existed.
    const rejectBlock = SQL.slice(SQL.indexOf('if v_event.id is null'), SQL.indexOf('insert into public.event_rsvps'))
    expect(rejectBlock).toContain('v_opens')
    expect(rejectBlock).toContain('v_closes')
    expect(rejectBlock.match(/return v_receipt;/g)?.length ?? 0).toBe(1)
  })
})

describe('check-in has an upper bound now', () => {
  it('checkInEvent asks the window, not merely whether the event started', () => {
    const fn = ACTIONS.slice(ACTIONS.indexOf('export async function checkInEvent('))
    expect(fn).toMatch(/checkInWindowOpen\(ev\.starts_at, ev\.ends_at, evCheckInTz\)/)
    // The old guard is gone: `isEventPast(ev.starts_at, null, ...)` had no closing side at all.
    expect(fn).not.toMatch(/isEventPast\(ev\.starts_at, null/)
  })

  it('it reads ends_at, which the old query never selected', () => {
    expect(ACTIONS).toMatch(/\.select\('starts_at, ends_at, is_cancelled, time_zone, theme'\)/)
  })

  it('the host switch still gates it too — the window did not replace the switch', () => {
    expect(ACTIONS).toContain('readEventCheckInEnabled(ev.theme)')
  })
})

describe('the page hides controls the actions would refuse', () => {
  it('derives both windows from the same pure rules the actions use', () => {
    expect(PAGE).toContain("from '@/lib/events/rsvp-window'")
    expect(PAGE).toContain("from '@/lib/events/checkin-window'")
    expect(PAGE).toMatch(/const checkInWindow = checkInEnabled && checkInWindowOpen\(/)
  })

  it('a member who ALREADY holds a seat still gets their controls when the window shuts', () => {
    // Otherwise "close RSVPs" silently becomes "lock the guest list".
    expect(PAGE).toMatch(/!rsvpWindowOpen && !isGoing && !isWaitlisted \?/)
  })

  it('the guest form is replaced by the reason, not left to fail silently', () => {
    expect(PAGE).toMatch(/rsvpWindowOpen \? \(\s*<GuestRsvpForm/)
    expect(PAGE).toContain('{rsvpWindowLine}')
  })

  it('the movable check-in block reads ONE flag carrying switch AND clock', () => {
    const block = read('components/widgets/events/event-checkin.tsx')
    expect(block).toContain('if (!ctx.checkInOpen) return null')
    expect(PAGE).toContain('checkInOpen: checkInWindow,')
  })
})
