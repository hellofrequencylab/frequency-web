// NON-VACUITY, in both directions, for the accessibility ratchet's JUDGEMENT.
//
// The failure LIVE-023 named is a baseline that records a CEILING ("no worse than N") while
// reading like a MEASUREMENT ("the value is N"). A ceiling prints a tick over every regression
// that fits underneath it, and until 2026-08-17 the a11y gate compared every one of its 49
// numbers that way (`total <= allowed`) — so all 49 carried that headroom. The three shell
// contexts merely carried the most of it.
//
// A gate is only worth the confidence it buys, so this asserts the one thing that cannot be
// established by reading the source: that moving a number in EITHER direction fails. It runs
// under vitest with no browser, no deployment and no axe, which is why the judgement was pulled
// out of `a11y.spec.ts` into `a11y-ratchet.ts` in the first place.
//
// The FILE-shape half — provenance, written reasons, the hand-edit guard — is
// `scripts/check-a11y-baselines.test.ts`, which is also where the two gates' shared notion of
// "ceiling" is pinned together.

import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  type A11yBaselinesDoc,
  type CeilingEntry,
  contextKey,
  judge,
  resolveBaseline,
} from './a11y-ratchet'
import { DEFAULT_STATE, SHELL_RENDER_STATES, operatorSurfaces } from './surfaces'

const seedChange = (value: number, reason: string) => ({
  at: '2026-08-11',
  value,
  from: null,
  direction: 'seed' as const,
  reason,
})

/** A well-formed declared ceiling. Its shape is validated in the static gate's own test. */
export function ceilingFixture(value: number): CeilingEntry {
  const reason =
    'Seeded from a raw pre-waiver total because the run log truncated the node list at five.'
  return {
    ceiling: value,
    why:
      'Not a reading. Nothing has measured this surface with waivers subtracted, so the number is ' +
      'what it is allowed to carry rather than what it carries. Retire it with a real capture.',
    retiredBy: 'PW_A11Y_UPDATE=1 pnpm test:e2e:a11y && pnpm a11y:baselines',
    frozen: seedChange(value, reason),
    history: [seedChange(value, reason)],
  }
}

const CONTEXT = '/feed [dawn-light, desktop]'
const docWith = (entry: number | CeilingEntry): A11yBaselinesDoc => ({
  $defaultMax: 0,
  surfaces: { [CONTEXT]: entry },
})

describe('a reading fails in BOTH directions', () => {
  const baseline = resolveBaseline(docWith(7), CONTEXT)

  it('is a reading, not a ceiling', () => {
    expect(baseline.kind).toBe('reading')
  })

  it('holds when the measurement matches', () => {
    expect(judge(7, baseline)).toMatchObject({ ok: true, verdict: 'held' })
  })

  it('FAILS when the measurement rises — a regression', () => {
    expect(judge(8, baseline)).toMatchObject({ ok: false, verdict: 'regressed' })
    expect(judge(99, baseline).ok).toBe(false)
  })

  // The half a ceiling cannot do, and the reason this whole change exists. An improvement that
  // passes silently is how a recorded number drifts away from the product it describes — which
  // is exactly what the file's own header records happening to /spaces at a stale 44.
  it('FAILS when the measurement falls — the file has stopped being true', () => {
    expect(judge(6, baseline)).toMatchObject({ ok: false, verdict: 'improved-unrecorded' })
    expect(judge(0, baseline)).toMatchObject({ ok: false, verdict: 'improved-unrecorded' })
  })

  it('a context with no entry is a reading of $defaultMax, so any debt at all fails', () => {
    const missing = resolveBaseline(docWith(7), '/never-frozen [dawn-light, desktop]')
    expect(missing).toEqual({ kind: 'reading', value: 0 })
    expect(judge(1, missing).ok).toBe(false)
    expect(judge(0, missing).ok).toBe(true)
  })
})

describe('a declared ceiling keeps the weaker comparison, and only it', () => {
  const baseline = resolveBaseline(docWith(ceilingFixture(12)), CONTEXT)

  it('is a ceiling, and carries the reason it is one', () => {
    expect(baseline).toMatchObject({ kind: 'ceiling', value: 12 })
    expect(baseline.kind === 'ceiling' && baseline.why).toContain('Not a reading')
  })

  it('still FAILS on a rise', () => {
    expect(judge(13, baseline)).toMatchObject({ ok: false, verdict: 'regressed' })
  })

  it('passes on a fall, and says so, so the ceiling gets retired', () => {
    expect(judge(3, baseline)).toMatchObject({ ok: true, verdict: 'improved' })
    expect(judge(0, baseline)).toMatchObject({ ok: true, verdict: 'improved' })
  })

  // The cost of a ceiling, stated as a test rather than as prose: eleven of the twelve counts
  // /feed is allowed to carry can be an unrelated, never-examined serious violation.
  it('is exactly as much headroom as its number says', () => {
    const passing = Array.from({ length: 13 }, (_, n) => n).filter((n) => judge(n, baseline).ok)
    expect(passing).toHaveLength(13)
    expect(resolveBaseline(docWith(12), CONTEXT)).toEqual({ kind: 'reading', value: 12 })
    const asReading = Array.from({ length: 13 }, (_, n) => n).filter(
      (n) => judge(n, resolveBaseline(docWith(12), CONTEXT)).ok,
    )
    expect(asReading).toEqual([12])
  })
})

// ── THE OPERATOR CONSOLE HAS A ROW FOR EVERY CONTEXT IT AUDITS (HYG-027, ADR-1239) ─────────────
//
// Nothing but a browser run could prove that a row written into a11y-baselines.json is the row the
// spec will look up, and no browser here can reach an /admin route (the e2e account bounces off
// requireAdminFloor). So the two halves that CAN be pinned without one are pinned: the spec and the
// file build the key through ONE function, and every (operator surface x shell context) the spec
// enumerates has an entry under that key, so the set of contexts the console is held to is
// enumerable in the file rather than implied by a fallback.
describe('the operator console has a ratchet row for every context the spec audits', () => {
  const doc = JSON.parse(
    readFileSync(join('test', 'e2e', 'a11y-baselines.json'), 'utf8'),
  ) as A11yBaselinesDoc

  /** The three contexts a11y.spec.ts's operator describe produces per surface: full pass in the
   *  canonical state on both projects, contrast-only in the other shell state on desktop. */
  function contextsFor(path: string): string[] {
    const full = ['desktop', 'mobile'].map((project) => contextKey(path, DEFAULT_STATE.id, project))
    const contrast = SHELL_RENDER_STATES.filter((s) => s.id !== DEFAULT_STATE.id).map((state) =>
      contextKey(path, state.id, 'desktop', true),
    )
    return [...full, ...contrast]
  }

  it('builds the same key strings the file has always used', () => {
    // The two shapes the file has carried since 2026-08-04, byte for byte.
    expect(contextKey('/feed', 'dawn-light', 'desktop')).toBe('/feed [dawn-light, desktop]')
    expect(contextKey('/feed', 'dawn-dark', 'desktop', true)).toBe(
      '/feed [dawn-dark, contrast only, desktop]',
    )
    expect(doc.surfaces).toHaveProperty(contextKey('/feed', 'dawn-light', 'desktop'))
  })

  it('has an entry for every operator context, so none of them falls to $defaultMax', () => {
    const surfaces = operatorSurfaces()
    expect(surfaces.length).toBeGreaterThanOrEqual(7)
    for (const surface of surfaces) {
      for (const context of contextsFor(surface.path)) {
        expect(doc.surfaces, context).toHaveProperty(context)
      }
    }
  })

  // 🔴 EVERY OPERATOR ROW IS A READING, held with equality, and that is a constraint rather than a
  // choice. The first draft seeded these as declared ceilings (the ADR-1058 instrument for "nobody
  // has measured this yet"); LIVE-023, a DONE backlog row, probes that the file holds ZERO ceiling
  // objects, and its probe is the stronger claim. So the console joins at zero tolerance, the
  // merge script's own rule for a new context, and debt found after the grant is fixed or waived,
  // never raised. A ceiling appearing here would fail LIVE-023 before it failed this.
  it('every operator row is a bare READING, so the console is held to equality from day one', () => {
    for (const surface of operatorSurfaces()) {
      for (const context of contextsFor(surface.path)) {
        const entry = doc.surfaces?.[context]
        expect(typeof entry, context).toBe('number')
        expect(resolveBaseline(doc, context)).toEqual({ kind: 'reading', value: entry })
        expect(judge(1, resolveBaseline(doc, context)).ok, `${context} tolerates debt`).toBe(false)
      }
    }
  })

  it('NEGATIVE CONTROL: an /admin route the spec does not audit has no row and falls to 0', () => {
    const stray = contextKey('/admin/business-seeder', DEFAULT_STATE.id, 'desktop')
    expect(doc.surfaces).not.toHaveProperty(stray)
    expect(resolveBaseline(doc, stray)).toEqual({ kind: 'reading', value: doc.$defaultMax ?? 0 })
  })
})
