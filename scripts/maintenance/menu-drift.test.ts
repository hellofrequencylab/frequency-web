import { readFileSync } from 'node:fs'
import { describe, it, expect } from 'vitest'
import { codeLeaves, compare, formatReport, parseMenu, MENU_QUERY } from './menu-drift.mjs'

// Self-test for the public `header` menu drift check (LIVE-107).
//
// The defect it exists for is NOT a count mismatch, and that is the whole point: on 2026-08-24 the
// live header carried a row labelled "Spaces directory" that pointed at `/spaces`, the marketing
// page. The item was present, the href was a real page, and the totals agreed — every instrument
// the repo had said green while a visitor following the obvious label reached the wrong place.
// The first case below RECONSTRUCTS that exact row and asserts the check calls it, because a
// comparison that only counts would have shipped just as green as the ones that already had.
//
// No live database: every case drives the io seam (a parsed query payload).

type Leaf = { label: string; href: string }

const leaf = (label: string, href: string): Leaf => ({ label, href })

/** The code side, trimmed to the rows these cases are about. */
const CODE: Leaf[] = [
  leaf('Spaces', '/spaces'),
  leaf('Spaces directory', '/discover/spaces'),
  leaf('For studios', '/for/studios'),
  leaf('Business pricing', '/pricing'),
]

const live = (items: Leaf[], syncedDefaultKeys: string[] = []) => ({ items, syncedDefaultKeys })

describe('the mislabelled destination — the finding no count can make', () => {
  it('reports the row that says one thing and lands on another', () => {
    // The live 2026-08-24 shape: the directory label, the marketing href, and NO row for
    // /discover/spaces. Same number of rows as the code side, so a count check sees nothing.
    const r = compare(CODE, live([
      leaf('Spaces directory', '/spaces'),
      leaf('For studios', '/for/studios'),
      leaf('Business pricing', '/pricing'),
      leaf('An operator link', '/some/extra'),
    ]))
    expect(r.counts.code).toBe(r.counts.live)
    expect(r.mislabelled).toEqual([
      { label: 'Spaces directory', expected: '/discover/spaces', actual: '/spaces' },
    ])
    expect(r.ok).toBe(false)
    expect(formatReport(r)).toContain('should point at `/discover/spaces`')
  })

  it('says nothing when every destination is live, whatever else carries the label', () => {
    // The control for the case above: same labels, same hrefs, plus a duplicate label on a live
    // row. Every code href is present, so there is no lying link and nothing to report.
    const r = compare(CODE, live([...CODE, leaf('Spaces directory', '/discover/spaces?ref=x')]))
    expect(r.mislabelled).toEqual([])
    expect(r.ok).toBe(true)
  })
})

describe('the unreachable default — absent AND already in the baseline', () => {
  it('separates "the sync will never restore this" from "the next sync adds it"', () => {
    const r = compare(CODE, live(
      [leaf('Spaces', '/spaces'), leaf('For studios', '/for/studios')],
      ['/discover/spaces'], // synced once, then deleted: the engine can never bring it back
    ))
    expect(r.unreachable.map((l) => l.href)).toEqual(['/discover/spaces'])
    expect(r.pending.map((l) => l.href)).toEqual(['/pricing'])
    expect(r.ok).toBe(false)
    const report = formatReport(r)
    expect(report).toContain('the sync will never restore it')
    expect(report).toContain('pending injection')
  })
})

describe('what is deliberately NOT a failure', () => {
  it('an operator-added link is not drift', () => {
    const r = compare(CODE, live([...CODE, leaf('Our podcast', '/podcast')]))
    expect(r.ok).toBe(true)
  })

  it('a stale baseline key is advisory, never a red run', () => {
    // Five of these were live on 2026-08-24 (/for/coaches, /classifieds, …). They name defaults
    // that no longer exist, so they change nothing a renderer does. Failing on them would have
    // made this instrument red on the day it shipped, which is how a report stops being read.
    const r = compare(CODE, live(CODE, ['/for/coaches', '/classifieds', '/spaces']))
    expect(r.staleBaseline).toEqual(['/for/coaches', '/classifieds'])
    expect(r.ok).toBe(true)
    expect(formatReport(r)).toContain('Advisory')
  })
})

describe('the readers', () => {
  it('reads the real registry, and every leaf carries a label and a rooted href', () => {
    const leaves = codeLeaves(readFileSync('lib/nav/registry.ts', 'utf8'))
    expect(leaves.length).toBeGreaterThan(15)
    for (const l of leaves) {
      expect(l.label.length).toBeGreaterThan(0)
      expect(l.href.startsWith('/')).toBe(true)
    }
    // The two rows LIVE-107 turned on: a dropdown trigger's own landing must be a leaf, or it has
    // no path from the header at all, and the directory must point at the PUBLIC twin.
    const hrefs = leaves.map((l) => l.href)
    expect(hrefs).toContain('/spaces')
    expect(hrefs).toContain('/the-community')
    expect(hrefs).toContain('/discover/spaces')
    expect(hrefs).not.toContain('/spaces/directory')
  })

  it('parses the query payload, and refuses an unmaterialized surface loudly', () => {
    const parsed = parseMenu([{ menu: { items: [{ label: 'A', href: '/a' }], syncedDefaultKeys: ['/a'] } }])
    expect(parsed.items).toEqual([{ label: 'A', href: '/a' }])
    expect(parsed.syncedDefaultKeys).toEqual(['/a'])
    // A surface with no DB rows must throw rather than report a clean sweep of nothing (ADR-970).
    expect(() => parseMenu([])).toThrow(/not be materialized/)
  })

  it('reads the GLOBAL header only, and only reads', () => {
    expect(MENU_QUERY).toContain("surface_key = 'header'")
    expect(MENU_QUERY).toContain('space_id is null')
    expect(/\b(insert|update|delete|drop|alter)\b/i.test(MENU_QUERY)).toBe(false)
  })
})
