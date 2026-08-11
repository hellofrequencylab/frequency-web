import { describe, it, expect } from 'vitest'
// @ts-expect-error — .mjs guard module, no type declarations (same shape as the other guard tests)
import {
  evaluate,
  report,
  anchorFailures,
  classify,
  ageInDays,
  parseIsoDate,
  missingSections,
  tripRowCount,
  CADENCE_DAYS,
  FINDINGS_DIR,
  ANCHORS,
  REQUIRED_SECTIONS,
} from './check-research-freshness.mjs'

// This gate reports on a corpus that is legitimately EMPTY today, which is the whole reason it is
// awkward: "no round has ever run" and "the scan broke" are the same silence unless something
// separates them. These tests pin that separation, and pin that a human scheduling problem never
// turns the build red (ADR-970's reasoning, applied to a 🔴 owner cadence).

/** A findings file that satisfies findings/README.md §Required shape. */
const wellFormed = (date: string) => `# Findings, round of ${date}

> One paragraph.

## The round
P1-P5, preview, moderator.

## What users tripped on

| Severity | Journey | Where | What happened | Who |
|---|---|---|---|---|
| 🔴 | J2 | Feed to Circles | 4 of 5 hunted the rail before using search | P1 P2 P4 P5 |

## Journey outcomes
| Journey | Completed | Timed out | Notes |

## Quotes
P1: "it was fine".

## What we are changing
One line per trip.

## Open questions for the design round
One.
`

/** The io seam: a synthetic corpus plus a fixed clock. Anchors resolve unless a test drops one. */
const io = (files: Record<string, string>, today: string) => ({
  read: (f: string) => files[f] ?? '',
  exists: (f: string) => f in files || f === FINDINGS_DIR,
  readdir: (d: string) =>
    d === FINDINGS_DIR
      ? Object.keys(files)
          .filter((f) => f.startsWith(`${FINDINGS_DIR}/`))
          .map((f) => f.slice(FINDINGS_DIR.length + 1))
      : [],
  now: new Date(`${today}T12:00:00Z`),
})

const withReadme = (extra: Record<string, string> = {}) => ({
  'docs/research/PROTOCOL.md': '# Research protocol',
  [`${FINDINGS_DIR}/README.md`]: '# Findings files, the convention',
  ...extra,
})

describe('zero findings is the current state, and it reports honestly', () => {
  const r = evaluate(io(withReadme(), '2026-08-11'))

  it('says no round has ever run rather than printing a vacuous pass', () => {
    expect(r.status).toBe('never')
    expect(r.rounds).toBe(0)
    expect(r.ageDays).toBeNull()
    expect(report(r)).toContain('no moderated round has ever run')
  })

  it('emits the exact line SYNC.md standing rule 1 requires when there has never been a round', () => {
    // SYNC.md: 'If there has never been a round, write "No moderated round has run yet" and link
    // docs/research/PROTOCOL.md. Never omit the heading.'
    expect(r.handoff).toContain('No moderated round has run yet')
    expect(r.handoff).toContain('docs/research/PROTOCOL.md')
  })

  it('never counts the README as a round', () => {
    expect(classify(['README.md']).rounds).toEqual([])
  })
})

describe('a recent round reads fresh, a stale one reads stale, and neither fails the build', () => {
  const fresh = evaluate(
    io(withReadme({ [`${FINDINGS_DIR}/2026-07-01.md`]: wellFormed('2026-07-01') }), '2026-08-11'),
  )
  const stale = evaluate(
    io(withReadme({ [`${FINDINGS_DIR}/2026-01-01.md`]: wellFormed('2026-01-01') }), '2026-08-11'),
  )

  it('inside the cadence is fresh', () => {
    expect(fresh.status).toBe('fresh')
    expect(fresh.ageDays).toBe(41)
    expect(fresh.ageDays).toBeLessThanOrEqual(CADENCE_DAYS)
    expect(report(fresh)).toContain('✅')
  })

  it('past the cadence is stale, and says so in the handoff line', () => {
    expect(stale.status).toBe('stale')
    expect(stale.ageDays).toBe(222)
    expect(stale.handoff).toContain(`past the ${CADENCE_DAYS}-day cadence`)
    expect(stale.handoff).toContain('Sending it anyway')
    expect(report(stale)).toContain('⚠️')
  })

  it('the boundary is "more than 100 days", so day 100 is still fresh', () => {
    const at = (d: string) =>
      evaluate(io(withReadme({ [`${FINDINGS_DIR}/2026-01-01.md`]: wellFormed('2026-01-01') }), d))
    expect(at('2026-04-11').ageDays).toBe(100)
    expect(at('2026-04-11').status).toBe('fresh')
    expect(at('2026-04-12').status).toBe('stale')
  })

  it('picks the NEWEST round, not the last one listed', () => {
    const files = withReadme({
      [`${FINDINGS_DIR}/2026-08-01.md`]: wellFormed('2026-08-01'),
      [`${FINDINGS_DIR}/2025-02-02.md`]: wellFormed('2025-02-02'),
    })
    const r = evaluate(io(files, '2026-08-11'))
    expect(r.newest.name).toBe('2026-08-01.md')
    expect(r.rounds).toBe(2)
  })

  it('advisory means advisory: nothing about staleness throws', () => {
    // The gate's exit code is main()'s; what a caller can observe here is that evaluate() returns a
    // verdict instead of throwing. The only throw in this file is the anchor floor, below.
    expect(() => evaluate(io(withReadme({ [`${FINDINGS_DIR}/2019-01-01.md`]: wellFormed('2019-01-01') }), '2026-08-11'))).not.toThrow()
  })
})

describe('the floor is the anchors, not a findings count', () => {
  // A "fail under N findings" floor would fire on the correct state forever, since the corpus is
  // legitimately zero. What is floored instead is the gate's ability to tell "zero rounds" apart
  // from "the directory moved" — both of which otherwise print the same sentence.

  it('fires when the findings directory is gone', () => {
    const gone = {
      read: () => '',
      exists: (f: string) => f === 'docs/research/PROTOCOL.md',
      readdir: () => [],
      now: new Date('2026-08-11T12:00:00Z'),
    }
    expect(anchorFailures(gone)).toEqual([
      expect.stringContaining(FINDINGS_DIR),
      expect.stringContaining('README.md'),
    ])
    expect(() => evaluate(gone)).toThrow(/cannot measure anything/)
  })

  it('fires when the protocol it reports on is gone', () => {
    const noProtocol = {
      ...io(
        { [`${FINDINGS_DIR}/README.md`]: '# convention', [`${FINDINGS_DIR}/2026-08-01.md`]: wellFormed('2026-08-01') },
        '2026-08-11',
      ),
    }
    expect(anchorFailures(noProtocol)).toEqual([expect.stringContaining('PROTOCOL.md')])
    expect(() => evaluate(noProtocol)).toThrow(/PROTOCOL\.md is missing/)
  })

  it('fires when the listing resolves to zero entries, the MIN_ROWS hazard', () => {
    const empty = {
      read: () => '',
      exists: () => true,
      readdir: () => [],
      now: new Date('2026-08-11T12:00:00Z'),
    }
    expect(anchorFailures(empty)).toEqual([expect.stringContaining('listed zero entries')])
  })

  it('does NOT fire on the honest empty corpus', () => {
    expect(anchorFailures(io(withReadme(), '2026-08-11'))).toEqual([])
  })

  it('the real repo clears every anchor', () => {
    expect(anchorFailures()).toEqual([])
    expect(ANCHORS).toHaveLength(3)
  })
})

describe('shape is not truth: the filename claims a round, the file has to carry one', () => {
  it('names the missing required sections', () => {
    const stub = `# Findings, round of 2026-08-01\n\n## The round\nP1-P5.\n`
    const r = evaluate(io(withReadme({ [`${FINDINGS_DIR}/2026-08-01.md`]: stub }), '2026-08-11'))
    expect(r.status).toBe('fresh')
    expect(r.missing).toHaveLength(REQUIRED_SECTIONS.length - 1)
    expect(r.missing).toContain('## What users tripped on')
    expect(report(r)).toContain('required')
  })

  it('a well-formed file is missing nothing and has trip rows', () => {
    expect(missingSections(wellFormed('2026-08-01'))).toEqual([])
    expect(tripRowCount(wellFormed('2026-08-01'))).toBe(1)
  })

  it('an empty trip table counts zero rows, header and separator included', () => {
    const empty = wellFormed('2026-08-01').replace(
      '| 🔴 | J2 | Feed to Circles | 4 of 5 hunted the rail before using search | P1 P2 P4 P5 |\n',
      '',
    )
    expect(tripRowCount(empty)).toBe(0)
    const r = evaluate(io(withReadme({ [`${FINDINGS_DIR}/2026-08-01.md`]: empty }), '2026-08-11'))
    expect(report(r)).toContain('has no rows')
  })
})

describe('the naming convention, and everything it tells the gate to skip', () => {
  it('only \\d{4}-\\d{2}-\\d{2}.md counts', () => {
    const { rounds, stray } = classify([
      'README.md',
      '2026-08-01.md',
      'notes-2026-08-01.md',
      '2026-08-01.txt',
      'draft.md',
    ])
    expect(rounds.map((r: { name: string }) => r.name)).toEqual(['2026-08-01.md'])
    expect(stray).toEqual(['2026-08-01.txt', 'draft.md', 'notes-2026-08-01.md'])
  })

  it('a date-shaped name that is not a date is reported, not silently rolled forward', () => {
    expect(parseIsoDate('2026', '13', '45')).toBeNull()
    expect(parseIsoDate('2026', '02', '30')).toBeNull()
    expect(parseIsoDate('2026', '08', '01')).not.toBeNull()
    const { rounds, malformed } = classify(['2026-13-45.md', '2026-08-01.md'])
    expect(malformed).toEqual(['2026-13-45.md'])
    expect(rounds).toHaveLength(1)
  })

  it('a future-dated file is called out rather than read as zero days old', () => {
    const r = evaluate(io(withReadme({ [`${FINDINGS_DIR}/2027-01-01.md`]: wellFormed('2027-01-01') }), '2026-08-11'))
    expect(r.status).toBe('future')
    expect(r.ageDays).toBeLessThan(0)
    expect(report(r)).toContain('FUTURE')
  })

  it('age is whole days at UTC midnight, so a time of day cannot move it', () => {
    const d = parseIsoDate('2026', '08', '01')
    expect(ageInDays(d, new Date('2026-08-11T00:00:01Z'))).toBe(10)
    expect(ageInDays(d, new Date('2026-08-11T23:59:59Z'))).toBe(10)
  })
})

describe('what the report hands to SYNC.md', () => {
  it('every status prints a quotable handoff line under the required heading name', () => {
    const cases = [
      evaluate(io(withReadme(), '2026-08-11')),
      evaluate(io(withReadme({ [`${FINDINGS_DIR}/2026-08-01.md`]: wellFormed('2026-08-01') }), '2026-08-11')),
      evaluate(io(withReadme({ [`${FINDINGS_DIR}/2025-08-01.md`]: wellFormed('2025-08-01') }), '2026-08-11')),
    ]
    for (const r of cases) {
      const text = report(r)
      expect(text).toContain('What users tripped on')
      expect(text).toContain(r.handoff)
      expect(r.handoff.length).toBeGreaterThan(0)
    }
  })

  it('prints no em dashes, in any status (CONTENT-VOICE)', () => {
    const files = withReadme({ [`${FINDINGS_DIR}/2025-08-01.md`]: wellFormed('2025-08-01') })
    expect(report(evaluate(io(files, '2026-08-11')))).not.toContain('—')
    expect(report(evaluate(io(withReadme(), '2026-08-11')))).not.toContain('—')
  })
})
