import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  run,
  roundOf,
  bundlePathsNamedIn,
  bundleIsCurrent,
  pendingMarkers,
  CHANGES_ROUND,
  BUNDLE_ROUND,
  ROUND_MARKERS,
  DECLARED_ABSENT,
} from './check-dawn-bundle.mjs'

// The enforcing arm for `check:dawn-bundle` (guard-wiring.test.ts → VITEST_ENFORCED). It calls
// run() rather than spawning the CLI: a probe that spawns a runner is the LIVE-034 defect, and the
// module exports its logic precisely so this file does not have to.
//
// Two halves, and the second is the one that matters. The first asserts the guard is green on the
// tree as committed. The second drives the PURE helpers against hostile input, because both of them
// are parsers, and a parser that quietly returns nothing turns this whole guard into a green over
// an empty scan — the ADR-962 failure the divergence test's own first assertion exists to catch.

const CHANGES = readFileSync(join(process.cwd(), 'design_handoff', 'CHANGES.md'), 'utf8')

describe('check:dawn-bundle', () => {
  it('passes on the tree as committed', () => {
    const { failures } = run()
    expect(failures).toEqual([])
  })

  it('knows the bundle is MIXED, and says which files are still behind', () => {
    // The state this guard was written for, now one round finer. tokens/colors.css was brought to
    // the 2026-08-25 round by TRANSCRIPTION from CHANGES.md §2; the other five markers are design
    // work that cannot be transcribed and still await a real DAWN export. A single BUNDLE_ROUND
    // was false in both directions once that split existed, so provenance lives on each marker.
    expect(BUNDLE_ROUND).toBe('mixed')
    expect(CHANGES_ROUND).toBe('2026-08-25')
    expect(bundleIsCurrent()).toBe(false)

    const pending = pendingMarkers().map((m) => m.file).sort()
    expect(pending).toEqual([
      'tokens/effects.css',
      'ui_kits/app/index.html',
      'ui_kits/app/nav-rail.jsx',
      'ui_kits/marketing/beta.jsx',
      'ui_kits/marketing/sections.jsx',
    ])

    // Exactly one marker has arrived, and it is the transcribable one. If a later change marks a
    // design file 'transcribed', this fails and forces the question of what it was copied FROM.
    const arrived = ROUND_MARKERS.filter((m) => m.state !== 'pending')
    expect(arrived.map((m) => m.file)).toEqual(['tokens/colors.css'])
    expect(arrived[0].state).toBe('transcribed')
  })

  it('accepts only the three provenance values, so a typo cannot read as arrived', () => {
    // `arrived` is computed as state === 'transcribed' || state === 'exported'. A misspelled state
    // would silently mean "pending", which is the quiet direction, but a NEW value invented later
    // deserves to fail loudly rather than be guessed at.
    for (const m of ROUND_MARKERS) {
      expect(['transcribed', 'exported', 'pending']).toContain(m.state)
    }
  })

  it('reads the round out of the real CHANGES.md', () => {
    expect(roundOf(CHANGES)).toBe(CHANGES_ROUND)
  })

  it('parses the round from an H1 and refuses to invent one', () => {
    expect(roundOf('# CHANGES.md — DAWN round of 2026-09-14 (reply to x)')).toBe('2026-09-14')
    // A date that is not in the H1 must not be picked up: the round is the heading's claim, and
    // reading a date out of the body would silently track whatever DAWN mentioned last.
    expect(roundOf('# CHANGES.md — DAWN round\n\nSee the 2026-08-03 export.')).toBeNull()
    expect(roundOf('')).toBeNull()
    expect(roundOf('## 2026-09-14')).toBeNull()
  })

  it('finds bundle paths in the real reply, and enough of them to be trusted', () => {
    const named = bundlePathsNamedIn(CHANGES)
    expect(named.length).toBeGreaterThanOrEqual(10)
    expect(named).toContain('tokens/colors.css')
    expect(named).toContain('ui_kits/marketing/the-community.html')
  })

  it('takes only bundle paths, not the repo paths in the same document', () => {
    // CHANGES.md quotes production files constantly (`app/globals.css`, `page-hero.tsx:156`,
    // `docs/DECISIONS.md`). Treating those as bundle paths would report every one as MISSING and
    // bury the one real absence in noise.
    const md = [
      'See `app/globals.css` and `docs/DECISIONS.md` and `lib/images/hero-contrast.ts`.',
      'Changed `tokens/effects.css` and `ui_kits/marketing/sections.jsx`.',
      'Also `components/kit/GateNotice.d.ts`.',
    ].join('\n')
    expect(bundlePathsNamedIn(md)).toEqual([
      'components/kit/GateNotice.d.ts',
      'tokens/effects.css',
      'ui_kits/marketing/sections.jsx',
    ])
  })

  it('deduplicates a path named many times', () => {
    const md = '`tokens/colors.css` … `tokens/colors.css` … `tokens/colors.css`'
    expect(bundlePathsNamedIn(md)).toEqual(['tokens/colors.css'])
  })

  it('returns nothing for prose with no backticked paths, without throwing', () => {
    expect(bundlePathsNamedIn('No paths here at all.')).toEqual([])
  })

  it('declares markers and absences that are real, not placeholders', () => {
    // A ledger that emptied out would make every assertion in run() vacuous while still exiting 0.
    expect(ROUND_MARKERS.length).toBeGreaterThanOrEqual(5)
    for (const m of ROUND_MARKERS) {
      expect(m.file, 'every marker names a bundle file').toMatch(/^[a-z_]+\//)
      expect(m.marker.length, 'every marker has a string to look for').toBeGreaterThan(2)
      expect(m.proves.length, 'every marker says what it proves').toBeGreaterThan(10)
      // Each marker must be quoted from something CHANGES.md actually says, otherwise the ledger
      // is our summary of the round rather than DAWN's claim about its own export.
      expect(CHANGES.includes(m.marker), `${m.marker} is not in CHANGES.md`).toBe(true)
    }
    expect(DECLARED_ABSENT).toEqual(['guidelines/on-media.card.html'])
  })
})
