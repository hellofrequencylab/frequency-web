// The design-system intake routine (docs/DESIGN-SYSTEM-INTAKE.md): its pure functions, then the repo measured
// against every committed theme snapshot. The snapshot (inventory, tokens, copy) comes from `ds-intake --write`;
// this file needs no copy of the design system, so it runs in CI like any other test.
import { readdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { DESIGNER_TOKENS_CSS } from '@/lib/theme/designer'
import { MIDNIGHT_TOKENS_CSS } from '@/lib/theme/midnight'
import { repoReport } from './ds-intake.mjs'
import { extractCopy, extractTokens, flatDeclarations, globToRegExp, normValue, repoViolations, resolveVars, ruleFor, squash } from './lib/design-system.mjs'

describe('design-system routine', () => {
  it('globs: ** crosses folders, * does not', () => {
    expect(globToRegExp('assets/**').test('assets/shots/a.png')).toBe(true)
    expect(globToRegExp('assets/*.png').test('assets/shots/a.png')).toBe(false)
    expect(globToRegExp('tokens/*.css').test('tokens/colors.css')).toBe(true)
  })

  it('the first matching rule wins and an unclaimed file is a violation', () => {
    const rules = [{ glob: 'a/*.txt', kind: 'reference', reason: 'r' }]
    expect(ruleFor(rules, 'a/x.txt')?.kind).toBe('reference')
    const r = repoViolations({ rules, inventory: [{ path: 'b/y.txt', sha256: 'x' }], read: () => null, bytes: () => null } as unknown as Parameters<typeof repoViolations>[0])
    expect(r.all.map((v: { id: string }) => v.id)).toEqual(['uncovered:b/y.txt'])
  })

  it('a baseline entry that no longer fires is reported as healed', () => {
    const r = repoViolations({ rules: [], inventory: [], read: () => null, bytes: () => null, baseline: ['missing:gone'] } as unknown as Parameters<typeof repoViolations>[0])
    expect(r.healed).toEqual(['missing:gone'])
  })

  it('tokens: selector scoped, comments dropped, var() chains resolve', () => {
    const t = extractTokens(':root{--a:#ABCDEF;--b:var(--a);} /* --c:1 */ [data-kit="x"]{--a:#000}') as Record<string, string>
    expect(t[':root|--a']).toBe('#ABCDEF')
    expect(Object.keys(t)).not.toContain(':root|--c')
    expect(resolveVars({ '--a': '#abcdef', '--b': 'var(--a)', '--c': 'var(--z, 4px)' })).toEqual({ '--a': '#abcdef', '--b': '#abcdef', '--c': '4px' })
    expect(normValue('#ABCDEF , 1px')).toBe('#abcdef,1px')
  })

  it('copy: text nodes and sentences are found, code is not', () => {
    const c = extractCopy('<h1>Design it once, use it everywhere.</h1><script>const x = "not a sentence ok"; fn(1)</script><p title="x">Short</p>', 'a.html')
    expect(c).toContain('Design it once, use it everywhere.')
    expect(squash('Don’t  *stop*!')).toBe('dont stop')
  })

  it('flatDeclarations reads every selector', () => {
    expect(flatDeclarations('.a{--x:1}.b{--y:2}')).toEqual({ '--x': '1', '--y': '2' })
  })
})

// Each theme's repo-side token block. A theme whose tokens are not built yet reads as empty (every token is a gap).
const TOKEN_CSS: Record<string, string> = { nocturne: MIDNIGHT_TOKENS_CSS, designer: DESIGNER_TOKENS_CSS }

const THEMES = readdirSync(join(process.cwd(), 'docs/design-systems'), { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => e.name)

describe.each(THEMES)('design system: %s', (theme) => {
  it('every design-system file is accounted for, and the repo matches it (baseline may only shrink)', () => {
    const report = repoReport(theme, TOKEN_CSS[theme] ?? '')
    if (process.env.DS_REPORT) for (const v of report.all) console.log(`${v.id}\n    ${v.detail}`)
    // DS_WRITE_BASELINE=1 re-freezes the list of known gaps. It may only be run to shrink it.
    if (process.env.DS_WRITE_BASELINE) {
      const file = join(process.cwd(), 'docs/design-systems', theme, 'baseline.json')
      writeFileSync(file, JSON.stringify({ ledger: process.env.DS_LEDGER ?? '', ids: report.all.map((v: { id: string }) => v.id).sort() }, null, 1) + '\n')
      return
    }
    expect(report.fresh.map((v: { id: string; detail: string }) => `${v.id} — ${v.detail}`)).toEqual([])
    expect(report.healed).toEqual([])
  })
})
