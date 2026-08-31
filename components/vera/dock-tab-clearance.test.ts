import { describe, it, expect } from 'vitest'
import { existsSync, readFileSync } from 'node:fs'

// ── SLOT 0b MUST BE IN THE LANE'S CLEARANCE, NOT IN ITS OWN FILE ───────────────────────────
//
// 🔴 THE BUG (owner, 2026-08-16, off a phone capture of /feed). The Capture composer's send
// button — a CONTROL, and the entire point of that box — was painted over by the round amber
// chat launcher. Measured at a 390px viewport: the launcher is `right-3 w-14`, so it occupies
// the rightmost 72.25px of the screen; the send button's right edge sits 34px in (the page's
// px-4 gutter plus the card's p-4), so 38.25px of an ~83px button is under it, and its
// invisible hit band takes taps 17px beyond the pixels you can see.
//
// The cause is the failure this repo has now had three times, and the mobile stacking contract
// (components/sidebar/game-stats-dock.tsx) records the first two by name: A NUMBER THAT DECIDES
// WHERE THE BOTTOM LANE ENDS WAS WRITTEN AS A LITERAL IN ONE FILE. The launcher took its BOTTOM
// from var(--tab-bar-h) — correctly — and then peeled itself up by 26px, 36px and a
// `before:-top-4`, none of which any other file could read. So --tab-bar-clearance, which the
// shell's scrolling content column pads by and which every fixed action bar pins to, still
// described the Zap catch's 22px while the tab reached 53px.
//
// THIS FILE EXISTS BECAUSE TWO LITERALS THAT HAPPEN TO AGREE IS HOW THAT BUG SHIPS AGAIN. It is
// the sibling of components/layout/dock-bar.test.ts and works the same way: it reads the source,
// so it fails on the shape of the code, not on a rendered pixel it would have to boot a browser
// to see. Every assertion below was watched go red with the defect put back.

const globals = readFileSync('app/globals.css', 'utf8')
const launcher = readFileSync('components/vera/vera-launcher.tsx', 'utf8')
const shell = readFileSync('components/layout/app-shell.tsx', 'utf8')
const toastLane = readFileSync('components/toast-lane.tsx', 'utf8')
const questCta = readFileSync('app/(main)/crew/hub-primary-cta.tsx', 'utf8')
const contract = readFileSync('components/sidebar/game-stats-dock.tsx', 'utf8')

/** The value side of a custom property declared in globals.css, verbatim. */
function token(name: string): string {
  const m = globals.match(new RegExp(`^\\s*${name}:\\s*([^;]+);`, 'm'))
  if (!m) throw new Error(`globals.css declares no ${name}`)
  return m[1].trim()
}

/**
 * A token's value in CSS px AT THIS APP'S ROOT, which is the only place these numbers are
 * comparable. --density-root is 106.25%, so a `rem` is 17px and every `rem`-named Tailwind class
 * in this area renders 6.25% larger than its name — the arithmetic error the contract's own
 * comments were corrected for on 2026-08-11. Read from the token rather than typed as 17.
 */
const ROOT_PX = 16 * (parseFloat(token('--density-root')) / 100)
function px(value: string): number {
  const n = parseFloat(value)
  if (value.endsWith('rem')) return n * ROOT_PX
  if (value.endsWith('px')) return n
  throw new Error(`not a bare length: ${value}`)
}

describe('the lane names slot 0b, so the clearance can count it', () => {
  it('the peel is three tokens in globals.css, not three literals in the launcher', () => {
    expect(px(token('--dock-tab-peek'))).toBe(26)
    expect(px(token('--dock-tab-peek-alert'))).toBe(36)
    // The invisible hit band. 1rem = 17px here, which is why it is written as a rem and read
    // through ROOT_PX rather than asserted as 16.
    expect(px(token('--dock-tab-reach'))).toBe(ROOT_PX)
  })

  it('--dock-tab-rise is DERIVED from the two that matter, never re-typed as 53px', () => {
    // 🔴 The whole defect in one assertion. A literal `53px` here would be a fourth independent
    // number: change the peek and the clearance silently stops matching the tab again.
    const rise = token('--dock-tab-rise')
    expect(rise).toContain('var(--dock-tab-peek-alert)')
    expect(rise).toContain('var(--dock-tab-reach)')
    expect(rise).not.toMatch(/\d+px/)
  })

  it('takes the ALERT peek, because clearance cannot track an unread count', () => {
    // The tab rides 10px higher whenever something is waiting. A clearance computed off the
    // resting peek would be correct until a message arrived — and re-padding the column on an
    // unread would REFLOW the page under the reader. The lane is furniture: one height.
    expect(px(token('--dock-tab-peek-alert'))).toBeGreaterThan(px(token('--dock-tab-peek')))
    expect(token('--dock-tab-rise')).not.toContain('var(--dock-tab-peek)')
  })
})

describe('--tab-bar-clearance is the top of the LANE, not of one occupant', () => {
  it('is a max() over both things that break upward out of the bottom edge', () => {
    // The max() moved into --lane-rise on 2026-08-31 so a full-bleed bar could read it as
    // PADDING (rule 7 / slot 0c). It is still ONE expression with two readers — asserted here as
    // the derivation chain rather than as one string, because the whole point of the extraction
    // is that the clearance and the action bar's padding cannot drift apart.
    const clearance = token('--tab-bar-clearance')
    const rise = token('--lane-rise')
    expect(clearance).toContain('var(--tab-bar-h)')
    expect(clearance).toContain('var(--lane-rise)')
    // `max()`, not `+`: slot 0a (the centred Zap catch) and slot 0b (the corner chat tab) rise
    // out of the same edge in different columns, so the lane's top is the TALLER of them. A sum
    // would pad 75px for a lane that is 53px tall.
    expect(rise).toMatch(/max\(\s*var\(--tab-bar-lift\)\s*,\s*var\(--dock-tab-rise\)\s*\)/)
    expect(rise).not.toMatch(/var\(--tab-bar-lift\)\s*\+\s*var\(--dock-tab-rise\)/)
    // 🔴 And the max() lives in exactly ONE of them. Restating it inside the clearance would be
    // the two-literals-that-agree failure this whole file exists to stop, performed on the very
    // token that records it.
    expect(clearance).not.toContain('max(')
  })

  it('🔴 and the tallest occupant is the CHAT TAB, which is what the old value missed', () => {
    // THE REGRESSION, as arithmetic. The clearance used to be the lift alone, so the shell's
    // content pad ended 22px above the bar while the tab took taps up to 53px above it: the last
    // 31px of every mobile column, in its rightmost 72.25px, was under a control and could not
    // be scrolled clear of it. This is the measurement that says the fix is real.
    const lift = px(token('--tab-bar-lift'))
    const rise = px(token('--dock-tab-peek-alert')) + px(token('--dock-tab-reach'))
    expect(rise).toBe(53)
    expect(rise - lift).toBe(31)
    expect(rise).toBeGreaterThan(lift)
  })
})

describe('the launcher reads the tokens instead of restating them', () => {
  it('peels by the token in both states', () => {
    expect(launcher).toContain('translate-y-[calc(100%_-_var(--dock-tab-peek-alert))]')
    expect(launcher).toContain('translate-y-[calc(100%_-_var(--dock-tab-peek))]')
    // 🔴 The exact literals that shipped the bug. Matched against the CODE, not the file: the
    // comments above deliberately quote the old numbers so a reader knows what was wrong.
    const code = launcher.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')
    expect(code).not.toContain('calc(100%-26px)')
    expect(code).not.toContain('calc(100%-36px)')
  })

  it('extends its hit area by the token too — the invisible half is the half that steals taps', () => {
    expect(launcher).toContain('before:-top-[var(--dock-tab-reach)] before:h-[var(--dock-tab-reach)]')
    const code = launcher.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')
    expect(code).not.toContain('before:-top-4')
  })

  it('still measures its BOTTOM from the bar, not from the clearance', () => {
    // Slot 0b sits IN the lane; it does not clear it. Pinning this tab to --tab-bar-clearance
    // would define the clearance in terms of itself and float the tab off the bar it peels from.
    expect(launcher).toContain("style={{ bottom: 'var(--tab-bar-h)' }}")
    expect(launcher).not.toContain('var(--tab-bar-clearance)')
  })
})

describe('everything that must clear the lane reads the one token', () => {
  it('the shell pads its scrolling content column by the clearance', () => {
    // The load-bearing consumer, and the reason the fix is a token edit rather than a shell edit:
    // widening the clearance moves this pad without touching app-shell.tsx at all.
    expect(shell).toContain('pb-[var(--tab-bar-clearance)] md:pb-0')
    expect(shell).not.toContain('pb-[var(--tab-bar-h)]')
  })

  it('the toast lane (slot 1) sits --space-3 above it, and is no longer a bottom-32 literal', () => {
    // 🔴 136px was measured against the Zap catch alone and was 10.5px INSIDE slot 0b's waiting
    // hit band by the time the tab arrived. A literal cannot notice a new neighbour.
    expect(toastLane).toContain('bottom-[calc(var(--tab-bar-clearance)+0.75rem)]')
    // Against the CODE: the top of that file quotes the two byte-identical `fixed bottom-32 …`
    // declarations it was extracted from, because that history is why the lane exists at all.
    const laneCode = toastLane.replace(/\/\/.*$/gm, '')
    expect(laneCode).not.toContain('bottom-32')
  })

  it('🔴 SLOT 0c IS UNOCCUPIED, and the rule it was written for still stands', () => {
    // The event RSVP bar was the only full-bleed action bar in the app, and it is GONE (owner,
    // 2026-08-31): it duplicated the Join box the interior already renders, and cost the lane plus
    // a pb-24 reservation on every event page to say the same thing twice.
    //
    // WHY THE RULE STAYS ANYWAY. It was written because the bar shipped at
    // `bottom: var(--tab-bar-clearance)` — the lane's TOP, correct for a narrow floating pill and
    // wrong for an opaque `inset-x-0` bar, which it hung 53px in the air with the page scrolling
    // through underneath. Deleting rule 7 along with its only occupant would leave the NEXT
    // full-bleed bar to rediscover that from a phone capture, which is exactly how this file's
    // three earlier entries were each learned.
    expect(existsSync('app/(main)/events/[slug]/rsvp-bottom-bar.tsx')).toBe(false)
    expect(contract).toContain('//     SLOT 0c -')
    expect(contract).toContain('7. A FULL-BLEED OPAQUE BAR TAKES THE LANE AS PADDING')
  })

  it('the Quest hub CTA, which used to guess the bar at 4rem', () => {
    // 🔴 `calc(4rem + env(safe-area-inset-bottom) + 0.5rem)`: a height the tab bar has never had
    // (it is 3.5rem), cleared against the BAR rather than the lane. The catch overlapped its
    // bottom 5px and the chat tab sat on the right-hand end of the page's one primary action.
    expect(questCta).toContain('bottom-[calc(var(--tab-bar-clearance)+0.5rem)]')
    expect(questCta).not.toContain("bottom: 'calc(4rem + env(safe-area-inset-bottom) + 0.5rem)'")
  })
})

describe('the mobile stacking contract records slot 0b', () => {
  it('names the slot, so the next fixed element has one to be measured against', () => {
    // Rule 1 of the contract is "name your slot before you pick a number". Slot 0b existed on
    // every phone for weeks with no slot and no number, which is exactly how it ended up 31px
    // inside the content column.
    expect(contract).toContain('//     SLOT 0b -')
    expect(contract).toContain('var(--dock-tab-rise)')
  })

  it('and rule 3 now points at the lane rather than at the catch', () => {
    expect(contract).toContain('max(var(--tab-bar-lift), var(--dock-tab-rise))')
    expect(contract).not.toContain('3. Clear 115.5px, not 93.5px')
  })

  it('names slot 0c and rule 7, so a full-bleed bar is not written as a floating pill again', () => {
    // Rule 1 is "name your slot before you pick a number", and the RSVP bar had been at this
    // edge for weeks with no slot of its own — it was borrowing slot 1's number, which is how it
    // got the lane's top instead of the lane. Both halves of the fix are named here so the next
    // full-bleed bar inherits the distinction instead of rediscovering it.
    expect(contract).toContain('//     SLOT 0c -')
    expect(contract).toContain('7. A FULL-BLEED OPAQUE BAR TAKES THE LANE AS PADDING')
    expect(contract).toContain('var(--lane-rise)')
  })
})
