import { describe, it, expect } from 'vitest'
import {
  headerViolations,
  stripCommentsAndStrings,
  importSpecifiers,
  resolveImport,
  isRouteModule,
  delegationClosure,
  runCheck,
  KNOWN_DELEGATED,
} from './check-headers.mjs'

// Locks the header contract gate (PAGE-FRAMEWORK §3,§8). Two failure modes are under test, and the
// second one is why this file exists at all:
//
//   1. CLASSIFICATION — is a given `<h1>` markup, prose, or an annotated exception?
//   2. REACH — can the gate SEE the h1 in the first place? Until 2026-08-05 it walked `page.tsx`
//      only, so a page that handed its whole header to a co-located island was unwatched. Three
//      hand-rolled page headers were living in that gap. A classifier test alone would have passed
//      the whole time, which is exactly the shape of gate this repo has shipped six of.

describe('check-headers — classification', () => {
  it('flags a hand-rolled page-level <h1>', () => {
    expect(headerViolations('export default function P() {\n  return <h1>Feed</h1>\n}')).toEqual([
      { line: 2, text: 'return <h1>Feed</h1>' },
    ])
  })

  it('sees an <h1> whose attributes start on the NEXT line', () => {
    // `/<h1[\s\/>]/` could not match this: the scan is per line, so the class had no newline to
    // match against. It is the shape PageHeading itself is written in, and the Space-profile hero
    // was invisible because of it.
    expect(headerViolations('<h1\n  className={cn(a, b)}\n>\n  {title}\n</h1>')).toHaveLength(1)
  })

  it('does not mistake prose or a string for markup', () => {
    expect(headerViolations('// never hand-roll a <h1> here')).toEqual([])
    expect(headerViolations('/**\n *  a page never contains a raw <h1>\n */')).toEqual([])
    expect(headerViolations('const help = "use PageHeading, not <h1>"')).toEqual([])
  })

  it('honours `header-ok:` on the element line, the line above, and further up its comment block', () => {
    expect(headerViolations('<h1>X</h1> // header-ok: bespoke takeover pane')).toEqual([])
    expect(headerViolations('{/* header-ok: bespoke pane */}\n<h1>X</h1>')).toEqual([])
    // A reason worth writing runs to more than one line, and only its FIRST line carries the token.
    // Requiring the token on the immediately preceding line failed the well-explained exception and
    // passed the terse one — the wrong way round.
    const block = '{/* header-ok: the profile hero IS this group\'s header,\n    so the layout owns the single page h1 and no\n    page beneath it declares one. */}\n<h1\n  className="x"\n>{n}</h1>'
    expect(headerViolations(block)).toEqual([])
  })

  it('stops the annotation scan at the first line of real code', () => {
    // An unrelated `header-ok` further up a FILE must not excuse an h1 lower down.
    const src = '// header-ok: something else entirely\nconst x = 1\n<h1>X</h1>'
    expect(headerViolations(src)).toHaveLength(1)
  })

  it('blanks comments and strings while preserving the line count', () => {
    const lines = stripCommentsAndStrings('const a = "x"\n// c\nreal')
    expect(lines).toHaveLength(3)
    expect(lines[0].trim()).toBe('const a =')
    expect(lines[2]).toBe('real')
  })
})

describe('check-headers — reach: the gate follows delegation', () => {
  it('reads both import and re-export specifiers', () => {
    const src = "import { A } from './a'\nimport B from '@/components/b'\nexport { C } from './c'\nimport 'server-only'"
    expect(importSpecifiers(src)).toEqual(['./a', '@/components/b', './c', 'server-only'])
  })

  it('resolves `@/` and relative specifiers, and refuses bare packages', () => {
    const exists = (p: string) => p === 'app/(main)/events/new/event-form.tsx'
    expect(resolveImport('./event-form', 'app/(main)/events/new/page.tsx', exists)).toBe('app/(main)/events/new/event-form.tsx')
    expect(resolveImport('../new/event-form', 'app/(main)/events/[slug]/page.tsx', exists)).toBe('app/(main)/events/new/event-form.tsx')
    expect(resolveImport('react', 'app/(main)/events/new/page.tsx', exists)).toBeNull()
  })

  it('governs app/(main) modules only — shared components and other route groups are a boundary', () => {
    expect(isRouteModule('app/(main)/events/event-spark.tsx')).toBe(true)
    expect(isRouteModule('components/journey/v2/journey-spark.tsx')).toBe(false)
    expect(isRouteModule('app/(marketing)/pricing/page.tsx')).toBe(false)
    expect(isRouteModule('app/join/(induction)/induction.tsx')).toBe(false)
  })

  it('reaches an island a page delegates to, and records WHICH route reached it', () => {
    const files: Record<string, string> = {
      'app/(main)/x/page.tsx': "import { Island } from './island'\nexport default () => <Island />",
      'app/(main)/x/island.tsx': "import { Deep } from './deep'\nexport const Island = () => <h1>X</h1>",
      'app/(main)/x/deep.tsx': 'export const Deep = () => null',
    }
    const closure = delegationClosure(
      ['app/(main)/x/page.tsx'],
      (f) => files[f] ?? (() => { throw new Error('nope') })(),
      (f) => f in files,
    )
    expect(closure.get('app/(main)/x/island.tsx')).toBe('app/(main)/x/page.tsx')
    expect(closure.get('app/(main)/x/deep.tsx')).toBe('app/(main)/x/page.tsx')
  })
})

describe('check-headers — the shipped tree', () => {
  const result = runCheck()

  it('is green over every route entry and every module they delegate to', () => {
    expect(result.violations).toEqual([])
  })

  it('actually followed delegation — more modules scanned than route entries', () => {
    // The assertion that would have failed while the gate walked page.tsx only. Without it, a
    // regression that quietly narrowed the walk back to entry files would still read green here.
    expect(result.entries).toBeGreaterThan(200)
    expect(result.scanned).toBeGreaterThan(result.entries)
  })

  it('names every known hand-rolled header instead of being blind to it', () => {
    expect(KNOWN_DELEGATED.size).toBeGreaterThan(0)
    expect(result.known.map((k) => k.file).sort()).toEqual([...KNOWN_DELEGATED.keys()].sort())
    for (const [file, reason] of KNOWN_DELEGATED) {
      expect(reason.length, `${file}: a named exception needs a reason a reviewer can check`).toBeGreaterThan(40)
    }
  })

  it('fails a KNOWN_DELEGATED entry that no longer hand-rolls an h1, so the list can only shrink', () => {
    expect(result.stale).toEqual([])
  })
})
