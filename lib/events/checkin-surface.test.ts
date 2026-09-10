import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { checkInSurfaceState, formatCountdown, type CheckInSurfaceInput } from './checkin-surface'

const HOUR = 3_600_000
const NOW = Date.UTC(2026, 8, 10, 18, 0, 0)

/** A member who is going to an event that starts in one hour, with check-in on. */
const base: CheckInSurfaceInput = {
  cancelled: false,
  checkInEnabled: true,
  startsAtMs: NOW + HOUR,
  windowOpen: false,
  signedIn: true,
  isGoing: true,
  alreadyCheckedIn: false,
  zaps: 25,
  nowMs: NOW,
}

const at = (over: Partial<CheckInSurfaceInput>) => checkInSurfaceState({ ...base, ...over })

describe('the header check-in surface resolves one state', () => {
  it('counts down to a start that has not arrived', () => {
    expect(at({})).toEqual({ kind: 'countdown', startsAtMs: NOW + HOUR, zaps: 25 })
  })

  it('becomes the control the moment the door opens for a going member', () => {
    expect(at({ windowOpen: true })).toEqual({ kind: 'open', zaps: 25 })
  })

  it('reports the check-in that already happened', () => {
    expect(at({ windowOpen: true, alreadyCheckedIn: true })).toEqual({ kind: 'done', zaps: 25 })
  })

  it('says the door is open without offering it to a viewer who cannot walk through', () => {
    // A guest seat cannot become a counted attendance: check-in needs a profile, because WAM counts
    // DISTINCT actor_profile_id. The sign-in door for them stays in the Join box.
    expect(at({ windowOpen: true, signedIn: false, isGoing: false })).toEqual({ kind: 'waiting', zaps: 25 })
    expect(at({ windowOpen: true, isGoing: false })).toEqual({ kind: 'waiting', zaps: 25 })
  })

  it('goes quiet on a cancelled event', () => {
    expect(at({ cancelled: true })).toEqual({ kind: 'hidden' })
    expect(at({ cancelled: true, windowOpen: true })).toEqual({ kind: 'hidden' })
  })

  // ── THE TWO ORDERING RULES, EACH WITH THE FAILURE IT PREVENTS ──────────────────────────────────

  it("says nothing at all when the host switched check-in off, reward line included", () => {
    // 🔴 THE DEFECT THIS CLOSES. EventRewardStrip printed "Check in at the door to earn +25 Zaps" on
    // every event that was not cancelled, and never read the host's switch. An event with check-in
    // deliberately off still advertised a reward the action would refuse.
    expect(at({ checkInEnabled: false })).toEqual({ kind: 'hidden' })
    expect(at({ checkInEnabled: false, windowOpen: true })).toEqual({ kind: 'hidden' })
    expect(at({ checkInEnabled: false, windowOpen: true, alreadyCheckedIn: true })).toEqual({ kind: 'hidden' })
  })

  it('keeps a completed check-in even after the RSVP is withdrawn', () => {
    // Attendance is a thing that happened; an RSVP is an intention. Ordering alreadyCheckedIn ahead
    // of isGoing is what stops the surface re-offering a door this member already walked through.
    expect(at({ windowOpen: true, isGoing: false, alreadyCheckedIn: true })).toEqual({ kind: 'done', zaps: 25 })
  })

  // ── THE EDGES OF THE WINDOW ────────────────────────────────────────────────────────────────────

  it('goes quiet once the four-hour grace has run out rather than carrying a closed notice', () => {
    // windowOpen false with the start behind us is the CLOSED side of ADR-1175's window. The header
    // is prime real estate; a permanent "check-in has closed" line would occupy it forever.
    expect(at({ windowOpen: false, startsAtMs: NOW - 9 * HOUR })).toEqual({ kind: 'hidden' })
  })

  it('draws no countdown for a start it cannot place in time', () => {
    expect(at({ startsAtMs: null })).toEqual({ kind: 'hidden' })
    expect(at({ startsAtMs: Number.NaN })).toEqual({ kind: 'hidden' })
  })

  it('treats the start instant itself as open rather than a zero countdown', () => {
    // At exactly the start, checkInWindowOpen is already true, so the page passes windowOpen. The
    // countdown branch requires nowMs < startsAtMs, so the two can never both claim the instant.
    expect(at({ startsAtMs: NOW, windowOpen: true })).toEqual({ kind: 'open', zaps: 25 })
    expect(at({ startsAtMs: NOW, windowOpen: false })).toEqual({ kind: 'hidden' })
  })

  it('drops the reward clause rather than promising zero Zaps', () => {
    expect(at({ zaps: 0 })).toEqual({ kind: 'countdown', startsAtMs: NOW + HOUR, zaps: 0 })
    expect(at({ zaps: Number.NaN, windowOpen: true })).toEqual({ kind: 'open', zaps: 0 })
  })
})

describe('the countdown clock', () => {
  it('is the owner-asked 00:00:00 under a day', () => {
    expect(formatCountdown(0)).toBe('00:00:00')
    expect(formatCountdown(1000)).toBe('00:00:01')
    expect(formatCountdown(HOUR + 11 * 60_000 + 9000)).toBe('01:11:09')
    expect(formatCountdown(23 * HOUR + 59 * 60_000 + 59_000)).toBe('23:59:59')
  })

  it('leads with days past 24 hours, because a 172-hour clock is a number and not a time', () => {
    expect(formatCountdown(24 * HOUR)).toBe('1d 00:00')
    expect(formatCountdown(2 * 24 * HOUR + 4 * HOUR + 11 * 60_000)).toBe('2d 04:11')
  })

  it('never renders a negative clock', () => {
    expect(formatCountdown(-5000)).toBe('00:00:00')
  })

  it('stays fixed width so a live clock does not make the header jitter', () => {
    const widths = new Set([formatCountdown(1000), formatCountdown(HOUR), formatCountdown(10 * HOUR)].map((s) => s.length))
    expect(widths.size).toBe(1)
  })
})

// ── THE THREE SURFACES ARE NOW ONE, AND THAT IS A SOURCE FACT ────────────────────────────────────
//
// A source-shape guard, deliberately: what must not regress is that the reward promise, the door
// notice and the control render in ONE place. A render test would pass just as happily with the old
// copies still sitting in their old homes, which is the state this change exists to end.
describe('the header carries the whole feature, and the old homes are empty', () => {
  const read = (rel: string) => readFileSync(join(process.cwd(), rel), 'utf8')

  // 🔴 ASSERT THE IMPORT, THE TAG AND THE FILE — NEVER THE BARE NAME. The first version of this
  // guard failed on its own documentation: page.tsx now EXPLAINS, in prose directly above the
  // empty slot, that `EventRewardStrip` used to render there and why it does not. That sentence is
  // the note saying the strip is gone, and matching the bare name read it as the strip being
  // present. Comment-stripping is the wrong fix here — this file interleaves `/* */` and JSX
  // `{/* */}` blocks, and a non-greedy strip pairs one opener with a later closer and eats real
  // code (layout-editor.scope.test.ts records what that cost). An import line and a `<Tag` cannot
  // appear in prose; a deleted file cannot be a matter of opinion at all.
  const gone = (rel: string) => expect(existsSync(join(process.cwd(), rel)), `${rel} still exists`).toBe(false)

  it('the event page renders the surface and no longer renders the standalone reward strip', () => {
    const page = read('app/(main)/events/[slug]/page.tsx')
    expect(page).toContain('<EventCheckInSurface')
    expect(page).not.toContain('<EventRewardStrip')
    expect(page).not.toContain("from '@/components/events/event-reward-strip'")
    // Deleted, not merely unimported: a reward strip still sitting in the tree is how the second
    // promise comes back the next time someone wants a line under the title.
    gone('components/events/event-reward-strip.tsx')
  })

  it('the Join box no longer carries a second live check-in control', () => {
    // Two buttons for one idempotent action is not a bug, it is the scatter this change removes.
    const page = read('app/(main)/events/[slug]/page.tsx')
    expect(page).not.toContain('<EventCheckInButton')
    expect(page).not.toContain("from './check-in-button'")
    gone('app/(main)/events/[slug]/check-in-button.tsx')
  })

  it('the movable check-in block is no longer offered on the event page', () => {
    // The definition STAYS in LAYOUT_MODULES (so a future surface can adopt it) but leaves the
    // route set, which is the only thing that stops a block rendering and also strips it from
    // every saved layout, since the resolver filters a saved slot's order by the set.
    const modules = read('lib/widgets/modules.ts')
    const setBody = modules.slice(modules.indexOf('const EVENT_DETAIL_MODULE_IDS'), modules.indexOf('export const ROUTE_MODULE_IDS'))
    expect(setBody).not.toContain("'event-checkin'")
    expect(modules).toContain("id: 'event-checkin'")
  })

  it("the host's door note survived the move rather than being dropped with the block", () => {
    // `events.details.specialInstructions` was collected by the create form for the whole life of
    // the feature and read back by nothing until ADR-1309 put it on the block. Retiring the block
    // without carrying the note would have un-read it again.
    expect(read('components/events/event-checkin-surface.tsx')).toContain('SPECIAL_INSTRUCTIONS_LABEL')
  })
})
