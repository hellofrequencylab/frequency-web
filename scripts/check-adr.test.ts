import { describe, it, expect } from 'vitest'
import { runCheck } from './check-adr.mjs'

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
