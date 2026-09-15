import { join } from 'node:path'
import { describe, it, expect } from 'vitest'
import { runCheck, findPlaceholders, countTbd, scanPlaceholders } from './check-adr.mjs'

// ── WHY THIS FILE EXISTS ──────────────────────────────────────────────────────────────────────
//
// `check-adr.mjs` shipped with a GRANDFATHERED map that allowed ADR-088…094 to appear twice and
// ADR-090 three times. It therefore printed ✓ on a ledger holding eight live duplicate numbers —
// the guard measured "no worse than the day it shipped" while the tick read as "no duplicates".
// HYG-003 renumbered the nine later claimants (ADR-1044…1052) and deleted the allowance, so the
// rule is now flat: a number declared twice fails.
//
// A guard whose rule was just loosened-then-tightened needs its non-vacuity pinned, because the
// green run on the live ledger is indistinguishable from a guard that stopped counting. These
// fixtures make the failing case explicit and permanent.

const ENTRY = (id: string, title: string) => `## ADR-${id}: ${title}\n\n**Status:** Accepted.\n\n`

describe('runCheck fires on a duplicate ADR number', () => {
  it('reports no collision when every number is declared once', () => {
    const ledger = ENTRY('001', 'One') + ENTRY('002', 'Two') + ENTRY('1044', 'QR Studio')
    const { collisions, total } = runCheck(ledger)
    expect(total).toBe(3)
    expect(collisions).toEqual([])
  })

  it('FAILS a number declared twice, and names both lines', () => {
    const ledger = ENTRY('001', 'One') + ENTRY('002', 'Two') + ENTRY('001', 'One again')
    const { collisions } = runCheck(ledger)
    expect(collisions).toHaveLength(1)
    expect(collisions[0].id).toBe('001')
    expect(collisions[0].count).toBe(2)
    // Both claimants, so the failure tells a reader which entry to renumber.
    expect(collisions[0].lines).toHaveLength(2)
    expect(collisions[0].lines[0]).toBeLessThan(collisions[0].lines[1])
  })

  it('FAILS a number declared three times — the ADR-090 shape that started this', () => {
    const ledger = ENTRY('090', 'Beautiful codes') + ENTRY('090', 'Page kit') + ENTRY('090', 'Demo v2')
    const { collisions } = runCheck(ledger)
    expect(collisions).toHaveLength(1)
    expect(collisions[0].count).toBe(3)
  })

  it('sees `###` entries too, so a duplicate cannot hide behind a deeper heading', () => {
    // Six real entries (ADR-052…057, ADR-156a) use `###`. A `^## ` regex does not see them, and a
    // duplicate declared at that depth would have been invisible to the collision map.
    const { collisions } = runCheck(`## ADR-052: Two hashes\n\n### ADR-052: Three hashes\n`)
    expect(collisions).toHaveLength(1)
  })

  it('treats a letter suffix as its own id (ADR-544b is not a second ADR-544)', () => {
    const { collisions, total } = runCheck(ENTRY('544', 'Base') + ENTRY('544b', 'Variant'))
    expect(total).toBe(2)
    expect(collisions).toEqual([])
  })
})

describe('the live ledger', () => {
  it('declares every ADR number exactly once', () => {
    // The consequence HYG-003 bought, probed directly rather than through the CLI's exit code.
    const { collisions, total } = runCheck()
    expect(collisions).toEqual([])
    // Non-vacuity floor: measured 887 on 2026-08-17. A parse that silently matched nothing would
    // report zero collisions just as happily.
    expect(total).toBeGreaterThanOrEqual(880)
  })
})

// ── THE PLACEHOLDER HALF (HYG-093, ADR-1354) ──────────────────────────────────────────────────
//
// A lane never mints an ADR number; it writes a placeholder and the coordinator substitutes the
// real one at push time. Both scans above are NUMERIC, so that fail-safe had no gate, and one
// placeholder reached main inside a CLOSED backlog row with every contract guard green.
//
// This file CANNOT write the token literally, for exactly the reason the guard is hard to write: a
// fixture sitting in `scripts/` is itself scanned, and a bare placeholder here would be
// indistinguishable from a real unsubstituted citation. It builds the token instead, which is the
// same move the row's probe makes.
const PH = `ADR-${'N'.repeat(4)}`
const FENCE = '`'.repeat(3)

describe('findPlaceholders refuses a placeholder in CITATION position', () => {
  it('FAILS an ADR heading whose number was never substituted', () => {
    const hits = findPlaceholders(`## ${PH}: The decision nobody numbered (2026-09-15)\n`, 'f.md')
    expect(hits).toHaveLength(1)
    expect(hits[0]).toMatchObject({ file: 'f.md', line: 1, token: PH })
  })

  it('FAILS the parenthetical form a closed backlog row uses — the shape that actually shipped', () => {
    // #2612: docs/BUILD-BACKLOG.json reached main with "CLOSED 2026-09-15 (<placeholder>)" in a
    // done row, while docs/DECISIONS.md carried the real number for the same decision.
    const hits = findPlaceholders(`  "detail": "CLOSED 2026-09-15 (${PH}) and nothing fired"\n`, 'b.json')
    expect(hits).toHaveLength(1)
    expect(hits[0].line).toBe(1)
  })

  it('FAILS the other unfilled-slot spellings, and reports every line', () => {
    // Assembled, not typed — for the same reason as `PH` above. Written out, these three fixtures
    // are bare citations sitting in a scanned file, and the guard correctly refuses its own test.
    const text = [
      `see ADR-${'X'.repeat(3)} for why`,
      'nothing here',
      `and also ADR-${'TODO'}`,
      `plus ADR-${'?'}`,
    ].join('\n')
    expect(findPlaceholders(text, 'f.md').map((h) => h.line)).toEqual([1, 3, 4])
  })
})

describe('findPlaceholders leaves prose about the convention alone — the negative control', () => {
  // ⚠️ THE LOAD-BEARING HALF. A refusal scoped to the bare SUBSTRING fails on HYG-093's own row,
  // on this file, on docs/PRESENTATION.md and on docs/BASELINE-TODO-2026-08-12.md, all of which
  // have to write the token down to describe the convention. A gate that cannot fire honestly gets
  // routed around (ADR-970), so the line is POSITIONAL: bare is a citation, quoted is a mention.
  // Delete this block and someone will "tighten" the rule into unusability.
  it('PASSES a sentence that quotes the token in a code span', () => {
    const text = `a lane writes \`${PH}\` and the coordinator substitutes the real number\n`
    expect(findPlaceholders(text, 'AGENTS.md')).toEqual([])
  })

  it('PASSES an example heading inside a fenced block', () => {
    const text = [FENCE, `## ${PH}: how a lane writes it`, FENCE, ''].join('\n')
    expect(findPlaceholders(text, 'docs/x.md')).toEqual([])
  })

  it('PASSES a real number, and a letter-suffixed variant', () => {
    expect(findPlaceholders('see ADR-1346 and ADR-544b and ADR-088\n', 'f.md')).toEqual([])
  })
})

describe('the undecided marker is counted, not folded in', () => {
  // The `ADR-TBD` form says "no decision record exists yet" — a different claim with a different
  // remedy, so it sits outside the placeholder token set and carries its own shrink-only ratchet.
  // Folding it in would make the placeholder failure message false for most of what it fired on.
  const TBD = `ADR-${'TBD'}`

  it('is NOT reported as an unsubstituted placeholder', () => {
    expect(findPlaceholders(`enforced on two tables (${TBD}, B3-3)\n`, 'f.ts')).toEqual([])
  })

  it('IS counted in bare position, and not when quoted', () => {
    expect(countTbd(`a capacity guard (${TBD}, L6-07)\n`)).toBe(1)
    expect(countTbd(`the \`${TBD}\` form means no ADR exists\n`)).toBe(0)
  })
})

describe('the live tree', () => {
  // NOTE, deliberately: there is NO assertion here that the tree carries zero placeholders. On a
  // lane branch it carries them by design — the ADR heading, the closed row, this guard's own
  // citation — and that set IS the coordinator's substitution list. `pnpm check:adr` is the live
  // assertion, and it is meant to FAIL until the substitution runs. Pinning it here as well would
  // only fail `pnpm test` for the same reason, twice, and invite someone to weaken both.
  it('walks a non-vacuous file set that includes the backlog the defect shipped in', () => {
    const { files, tbd } = scanPlaceholders()
    // Measured 5,775 on 2026-09-15. A walk that silently matched nothing would report zero
    // placeholders just as happily — the failure mode this whole file exists to pin.
    expect(files.length).toBeGreaterThanOrEqual(5000)
    expect(files).toContain(join('docs', 'BUILD-BACKLOG.json'))
    expect(files.some((f: string) => f.endsWith('.mjs'))).toBe(true)
    // Shrink-only: 17 measured 2026-09-15. Growth fails the guard; a shrink does not.
    expect(tbd).toBeLessThanOrEqual(17)
  })
})
