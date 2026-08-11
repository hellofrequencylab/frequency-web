import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import {
  catalogRows,
  pageGate,
  evaluate,
  tabRows,
  pageReadsSearchParams,
  FROZEN_GATE_DEBT,
  FROZEN_TAB_DEBT,
  MIN_ROWS,
  MIN_TAB_ROWS,
} from './check-gate-parity.mjs'

// The menu catalog and the page must agree about who gets in. `check:menu` cannot see this:
// it validates the catalog's shape and has no way to read a guard inside a page body.

const CATALOG = readFileSync('lib/nav/studio.ts', 'utf8')
const io = (files: Record<string, string>) => ({
  read: (f: string) => files[f] ?? '',
  exists: (f: string) => f in files,
})

describe('catalogRows', () => {
  it('parses the real catalog well past the floor', () => {
    // The floor exists because the FIRST version of this gate printed "0 of 0 ✓" and exited 0:
    // `[^{}]` stopped at the nested `adminGroups: [{ … }]`, so nothing matched and everything
    // passed. A gate that scans nothing is worse than no gate.
    expect(catalogRows(CATALOG).length).toBeGreaterThanOrEqual(MIN_ROWS)
  })

  it('skips ?tab= rows, which are tabs on a shared page with no page-level call of their own', () => {
    const rows = catalogRows(CATALOG)
    expect(rows.some((r) => r.href.includes('?'))).toBe(false)
    expect(rows.some((r) => r.id === 'vera-studio')).toBe(false)
  })

  it('reads both axes off a row', () => {
    const row = catalogRows(CATALOG).find((r) => r.id === 'qr')
    expect(row).toBeTruthy()
    expect(row!.min).toBe('admin')
    expect(row!.domain).toBe('qr')
  })
})

describe('pageGate', () => {
  it('reads min and staff domain out of requireAdmin', () => {
    const g = pageGate('/admin/x', ...Object.values(io({
      'app/(main)/admin/x/page.tsx': "await requireAdmin('janitor', { staff: 'marketing' })",
    })) as [never, never])
    expect(g.min).toBe('janitor')
    expect(g.domain).toBe('marketing')
  })

  it('reports a bare requireAdmin as no domain, not as a mismatch', () => {
    const files = io({ 'app/(main)/admin/x/page.tsx': "await requireAdmin('admin')" })
    const g = pageGate('/admin/x', files.read, files.exists)
    expect(g.min).toBe('admin')
    expect(g.domain).toBeNull()
  })
})

describe('evaluate', () => {
  const catalogOf = (id: string, min: string, domain?: string) =>
    `{ id: '${id}', href: '/admin/${id}', label: 'X', min: '${min}'` +
    (domain ? `, staffDomain: '${domain}'` : '') + ` },\n`.padEnd(60, ' ')

  // MIN_ROWS makes a tiny synthetic catalog throw, which is the point of it — so the
  // behavioural tests below pad to the floor with rows that agree. The padding also carries
  // MIN_TAB_ROWS `?tab=` rows, because evaluate() floors BOTH corpora: a fixture with no tab
  // rows is indistinguishable from a broken tab parser, and evaluate cannot tell them apart.
  // The pad tab rows point at pages the stub io does not define, so they read as missing and
  // are skipped rather than counted as inert.
  const tabOf = (i: number) => `{ synthetic: { href: '/admin/padtab${i}?tab=t', label: 'X' } },\n`
  const padding =
    Array.from({ length: MIN_ROWS }, (_, i) => catalogOf(`pad${i}`, 'janitor')).join('') +
    Array.from({ length: MIN_TAB_ROWS }, (_, i) => tabOf(i)).join('')
  const padFiles = Object.fromEntries(
    Array.from({ length: MIN_ROWS }, (_, i) => [`app/(main)/admin/pad${i}/page.tsx`, "requireAdmin('janitor')"]),
  )

  it('throws rather than passing when the parser under-scans', () => {
    expect(() => evaluate(catalogOf('solo', 'janitor'), io({}))).toThrow(/parsed only/)
  })

  it('flags a NEW disagreement', () => {
    const files = io({ ...padFiles, 'app/(main)/admin/fresh/page.tsx': "requireAdmin('admin')" })
    const r = evaluate(padding + catalogOf('fresh', 'janitor'), files)
    expect(r.fresh.map((f: { id: string }) => f.id)).toEqual(['fresh'])
  })

  it('stays quiet for a row that agrees', () => {
    const files = io({ ...padFiles, 'app/(main)/admin/agree/page.tsx': "requireAdmin('janitor')" })
    const r = evaluate(padding + catalogOf('agree', 'janitor'), files)
    expect(r.fresh).toEqual([])
  })

  it('reports a frozen row as HEALED once both sides agree, so the list shrinks', () => {
    const id = FROZEN_GATE_DEBT[0].id
    const files = io({ ...padFiles, [`app/(main)/admin/${id}/page.tsx`]: "requireAdmin('janitor')" })
    const r = evaluate(padding + catalogOf(id, 'janitor'), files)
    expect(r.healed.map((h: { id: string }) => h.id)).toContain(id)
    expect(r.fresh).toEqual([])
  })

  it('flags a frozen row whose numbers MOVED without being fixed', () => {
    const id = FROZEN_GATE_DEBT[0].id // frozen at janitor+members vs admin+none
    const files = io({ ...padFiles, [`app/(main)/admin/${id}/page.tsx`]: "requireAdmin('host')" })
    const r = evaluate(padding + catalogOf(id, 'janitor', 'members'), files)
    expect(r.drifted.map((d: { id: string }) => d.id)).toContain(id)
  })
})

describe('the frozen list is a record, not a waiver', () => {
  it('every frozen row still names both sides and a reason', () => {
    for (const d of FROZEN_GATE_DEBT) {
      expect(d.catalog, d.id).toMatch(/\S\+\S/)
      expect(d.page, d.id).toMatch(/\S\+\S/)
      expect(d.why.length, d.id).toBeGreaterThan(20)
    }
  })

  it('has no duplicate ids', () => {
    const ids = FROZEN_GATE_DEBT.map((d) => d.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('every frozen row carries a recommendation naming WHICH SIDE to change', () => {
    // `why` describes the disagreement; on its own it leaves the reader to re-derive the ladder
    // (`member < crew < host < guide < mentor < admin < janitor`, so `janitor` is the NARROWEST
    // setting) before they can act. Several of these rows were mischaracterised when first frozen
    // for exactly that reason. A row without a recommendation is a row nobody can pick up, which
    // is how frozen debt becomes permanent debt.
    for (const d of FROZEN_GATE_DEBT) {
      expect(['catalog', 'page'], `${d.id}: fix must name a side`).toContain(d.fix)
      expect(d.rec.length, `${d.id}: rec must say what to change and why`).toBeGreaterThan(80)
    }
  })

  it('the recommendations split both ways (a list that always blames one side is not a reading)', () => {
    // Not a style rule. If every row resolved to "fix the catalog", the honest conclusion would be
    // that nobody read the pages and the default was applied eleven times.
    const sides = new Set(FROZEN_GATE_DEBT.map((d) => d.fix))
    expect(sides).toContain('catalog')
    expect(sides).toContain('page')
  })
})

// ── Rule 2: a `?tab=` row must point at a page that reads the tab ────────────────────────────
// Rule 1 skips query-string rows because their authz is per-tab inside a shared body. That is
// right, and "out of scope for the authz comparison" had quietly become "unchecked": four rows
// point at dashboards taking no searchParams, so the tab is inert and the row renders the parent
// page under a child's name.

describe('inert tab rows', () => {
  // Local fixtures: a catalog with enough ROWS to clear MIN_ROWS but no tabs at all, for the
  // under-scan test. The behavioural tests run against the REAL catalog with a stub file map, so
  // every real page reads as missing and is skipped -- which isolates the row under test.
  const plainRow = (id: string) =>
    `{ id: '${id}', href: '/admin/${id}', label: 'X', min: 'janitor' },\n`.padEnd(60, ' ')
  const noTabs = Array.from({ length: MIN_ROWS }, (_, i) => plainRow(`pad${i}`)).join('')

  it('finds every ?tab= href in the real catalog, including rows rule 1 cannot see', () => {
    const tabs = tabRows(CATALOG)
    expect(tabs.length).toBeGreaterThanOrEqual(MIN_TAB_ROWS)
    // All four survivors are vera-ai, the one page that does read searchParams.
    expect(tabs).toContain('/admin/vera-ai?tab=studio')
    expect(tabs.every((t) => t.startsWith('/admin/vera-ai?'))).toBe(true)
    // The four inert rows were dropped by owner decision; nothing should reintroduce them.
    expect(tabs).not.toContain('/admin/programs?tab=content')
  })

  it('still parses a synthetic row, which rule 1\'s id-keyed regex cannot see', () => {
    // The dropped rows had no `id:`. Keeping this proves the collector handles that shape, so a
    // future synthetic row is caught rather than skipped.
    const tabs = tabRows(`{ synthetic: { href: '/admin/thing?tab=x', label: 'X' } },`)
    expect(tabs).toEqual(['/admin/thing?tab=x'])
    expect(catalogRows(`{ synthetic: { href: '/admin/thing?tab=x', label: 'X' } },`)).toEqual([])
  })

  it('reads searchParams off a page that destructures it, and not off one that does not', () => {
    const f = io({
      'app/(main)/admin/reads/page.tsx': 'export default async function P({ searchParams }) {}',
      'app/(main)/admin/inert/page.tsx': 'export default async function P() {}',
    })
    expect(pageReadsSearchParams('/admin/reads?tab=a', f.read, f.exists).reads).toBe(true)
    expect(pageReadsSearchParams('/admin/inert?tab=a', f.read, f.exists).reads).toBe(false)
  })

  it('FAILS a NEW inert tab row (the ninth)', () => {
    const src = CATALOG + `{ synthetic: { href: '/admin/newthing?tab=whatever', label: 'X' } },`
    const f = io({ 'app/(main)/admin/newthing/page.tsx': 'export default async function P() { return null }' })
    const r = evaluate(src, f)
    expect(r.inertTabs.map((t: { href: string }) => t.href)).toEqual(['/admin/newthing?tab=whatever'])
  })

  it('PASSES a new tab row whose page reads the tab', () => {
    const src = CATALOG + `{ synthetic: { href: '/admin/newthing?tab=whatever', label: 'X' } },`
    const f = io({ 'app/(main)/admin/newthing/page.tsx': 'export default async function P({ searchParams }) {}' })
    expect(evaluate(src, f).inertTabs).toEqual([])
  })

  it('does NOT re-report the four frozen rows against the real tree', () => {
    const r = evaluate(CATALOG)
    expect(r.inertTabs).toEqual([])
    expect(r.tabs).toBeGreaterThanOrEqual(MIN_TAB_ROWS)
  })

  it('reports a frozen row as HEALED once its page learns to read the tab', () => {
    // FROZEN_TAB_DEBT is empty now that the four inert rows are gone, so this branch is
    // unreachable against the real catalog. Seeding a frozen href through the test seam keeps the
    // coverage rather than letting it be deleted along with the debt.
    const src = CATALOG + `{ synthetic: { href: '/admin/newthing?tab=x', label: 'X' } },`
    const base = io({
      'app/(main)/admin/newthing/page.tsx': 'export default async function P({ searchParams }) {}',
    })
    const r = evaluate(src, { ...base, frozenTabs: ['/admin/newthing?tab=x'] })
    expect(r.healedTabs.map((t: { href: string }) => t.href)).toContain('/admin/newthing?tab=x')
    expect(r.inertTabs).toEqual([])
  })

  it('FROZEN_TAB_DEBT is empty because the debt was fixed, and the corpus is still real', () => {
    // An empty frozen list is only meaningful next to a non-empty corpus. Together these say
    // "four rows checked, none inert" rather than "nothing checked".
    expect(FROZEN_TAB_DEBT).toEqual([])
    expect(tabRows(CATALOG).length).toBeGreaterThanOrEqual(MIN_TAB_ROWS)
  })

  it('throws rather than passing when the tab regex matches almost nothing', () => {
    // Same failure mode MIN_ROWS exists for: a rule that scans nothing passes everything.
    expect(() => evaluate(noTabs, io({}))).toThrow(/tab/)
  })

  it('every frozen tab row names a reason', () => {
    for (const d of FROZEN_TAB_DEBT) {
      expect(d.href).toMatch(/\?tab=/)
      expect(d.why.length, d.href).toBeGreaterThan(20)
    }
  })
})
