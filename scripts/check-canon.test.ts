import { describe, it, expect } from 'vitest'
import {
  RULES,
  COPY_KEYS,
  SURFACES,
  MAX_SURFACE_ENTRIES,
  EXCEPTIONS,
  MAX_EXCEPTIONS,
  MIN_SEAM_FILES,
  MIN_SEAM_STRINGS,
  isProse,
  classifySurface,
  memberFacingStrings,
  scanCodeSeam,
  checkCanon,
} from './check-canon.mjs'

/** check-canon.mjs is plain ESM with no `.d.ts`, so the shapes it exports arrive untyped. Name
 *  them once here rather than sprinkling `any` through the assertions. */
interface CanonRule { name: string; re: RegExp; hint: string; audience: string }
const rules: CanonRule[] = RULES
const findRule = (prefix: string) => rules.find((r) => r.name.startsWith(prefix))!

// The canon guard's CODE-SEAM scan (LIVE-018 / ADR-1065). `pnpm check:canon` still prints the
// friendly report; this file is what makes the guard un-forgettable, because vitest auto-discovers
// `*.test.ts` and CI's guards array does not.
//
// WHAT THIS FILE IS REALLY FOR. Widening a copy canon from `content/` (pure prose) to `app/` +
// `lib/` + `components/` (mostly text no human ever reads) fails in one of two ways, and only one
// of them is loud:
//
//   · TOO WIDE  — it fires on comments, identifiers, DB columns, CSS tokens and test fixtures.
//                 Someone adds a waiver, then a second, then the list is the guard and the guard
//                 reads as coverage. That is ADR-970's failure, and it is SILENT.
//   · TOO NARROW — it matches nothing, and green means "I never looked".
//
// So the false-positive half is tested as hard as the true-positive half: `the seam does not see`
// below is the more important describe block of the two.

describe('check-canon · the seam definition (no tree required)', () => {
  it('sees a violation in JSX text and in a copy-carrying prop', () => {
    const src = `
      export function Rail() {
        return (
          <section>
            <h2>Latest broadcasts</h2>
            <Empty title="No broadcasts yet" />
          </section>
        )
      }
    `
    const strings = memberFacingStrings(src, 'app/(main)/nearby/rail.tsx').map((s) => s.text)
    expect(strings).toContain('Latest broadcasts')
    expect(strings).toContain('No broadcasts yet')
  })

  it('sees a copy literal in an object property, including a template with substitutions', () => {
    // `${scope} broadcast` is the exact shape the 2026-08-10 sweep found in the wild, and a scan
    // that only read plain string literals would have missed every one of them.
    const src = 'export const M = { label: `${scope} broadcast`, description: "Your broadcast" }'
    const strings = memberFacingStrings(src, 'lib/x.ts').map((s) => s.text)
    expect(strings.some((s) => /broadcast/.test(s))).toBe(true)
    expect(strings).toContain('Your broadcast')
  })

  // ── THE FALSE-POSITIVE HALF ──────────────────────────────────────────────────────────────────
  it('the seam does not see a comment, an identifier, a DB column, a CSS token, or a non-copy key', () => {
    const src = `
      // The /broadcast route became /nearby (ADR-1020); broadcasts are Dispatches now.
      /* Historical: we used to call these broadcasts. */
      import { broadcastFeed } from '@/lib/broadcast/feed'

      const broadcastCount = 3
      type Broadcast = { broadcasts: number }

      export const COLUMN = 'broadcasts'                 // a database column, not copy
      export const FEATURE_KEY = 'broadcast'             // a featureKey survivor (NAMING.md)
      export const ROUTE = '/broadcast/new'              // a route
      export const TOKEN = { name: '--color-broadcast', swatch: 'bg-broadcast' }
      export const CLASS = { text: 'text-broadcast-strong' }

      export function View({ broadcasts }: { broadcasts: number }) {
        console.log('broadcasts fetched', broadcasts)
        return <div className="text-broadcast-strong" data-testid="broadcast-rail">{broadcasts}</div>
      }
    `
    const strings = memberFacingStrings(src, 'lib/broadcast/view.tsx')
    // Not one of the above is copy. If this array is ever non-empty, the seam has widened into
    // code and the waiver list is about to start growing.
    expect(strings, JSON.stringify(strings)).toEqual([])
  })

  it('one violating string in a file full of the same word yields exactly one finding', () => {
    // The realistic shape: a module whose identifiers, comment, route and token all carry the
    // retired word legitimately, plus ONE visible label that does not.
    const src = `
      // broadcasts are Dispatches now (ADR-1020)
      import { listBroadcasts } from '@/lib/broadcast/list'
      const BROADCAST_TABLE = 'broadcasts'
      export const NAV = { key: 'broadcast', href: '/broadcast', label: 'Broadcasts', icon: 'bg-broadcast' }
    `
    const rule = findRule('"broadcast" as a NOUN')
    const hits = memberFacingStrings(src, 'lib/nav/x.ts').filter((s) => rule.re.test(s.text))
    expect(hits.map((h) => h.text)).toEqual(['Broadcasts'])
  })

  it('the PROSE test keeps machine tokens out of `label`/`name`/`text` keys', () => {
    for (const token of [
      'text-broadcast-strong', '--color-broadcast', 'bg-broadcast', 'zaps_total',
      'suggest_circle', '/marketplace', 'broadcast.send', 'broadcast-rail', '42', '—',
    ]) expect(isProse(token), token).toBe(false)
    for (const prose of ['Broadcast', 'Dispatch', 'Latest broadcasts', 'A Spark. Plus 3 Gems.']) {
      expect(isProse(prose), prose).toBe(true)
    }
  })

  it('the verb "broadcast" is still allowed, because the canon allows it', () => {
    // NAMING.md §Dispatch: "The verb 'broadcast' as plain English (a contact is 'never broadcast')
    // is fine; the product noun is always Dispatch." A rule that failed correct copy would be
    // deleted by the next person who hit it.
    const rule = findRule('"broadcast" as a NOUN')
    expect(rule.re.test('It is never broadcast, and nobody is added to a mailing list.')).toBe(false)
    expect(rule.re.test('This will broadcast to the hub.')).toBe(false)
    expect(rule.re.test('Latest broadcasts')).toBe(true)
  })
})

describe('check-canon · the audience axis', () => {
  it('splits the rules exactly the way the two canons scope themselves', () => {
    const audience = Object.fromEntries(rules.map((r) => [r.name, r.audience]))
    // CONTENT-VOICE scopes the em dash to "brand/member-facing copy"; NAMING.md says "cohort is
    // internal/research framing only". Both are `member`.
    expect(audience['em-dash in brand copy']).toBe('member')
    expect(audience['"cohort" (member word is "Run")']).toBe('member')
    // NAMING.md §Dispatch: "every visible label, help article, notification topic, AND ADMIN
    // HEADING says Dispatch." Proper nouns bind everywhere a human reads them.
    expect(audience['"broadcast" as a NOUN (the member-facing noun is Dispatch)']).toBe('everyone')
    expect(audience['lowercase "zaps" (proper noun Zaps)']).toBe('everyone')
    expect(audience['lowercase "gems" (proper noun Gems)']).toBe('everyone')
  })

  it('classifies operator consoles by path segment, and every listed surface carries a reason', () => {
    expect(classifySurface('app/(main)/admin/qr/qr-studio.tsx').kind).toBe('operator')
    expect(classifySurface('app/(main)/spaces/[slug]/manage/page.tsx').kind).toBe('operator')
    expect(classifySurface('components/achievement-toast.tsx').kind).toBe('member')
    expect(classifySurface('lib/traits/registry.ts').kind).toBe('operator')
    for (const [prefix, meta] of SURFACES) {
      expect(['operator', 'not-copy'], prefix).toContain(meta.kind)
      expect(meta.why.length, prefix).toBeGreaterThan(20)
    }
  })

  it('an operator classification is not a waiver: `everyone` rules still judge those files', () => {
    // The one property that keeps SURFACES from becoming a dumping ground. lib/nav/studio.ts is
    // classified `operator` AND had two real "broadcast" violations fixed in this pass; if the
    // classification suppressed `everyone` rules, neither would ever have been found.
    const src = `export const L = { label: 'Broadcasts', desc: 'converts season zaps to gems' }`
    const strings = memberFacingStrings(src, 'lib/nav/studio.ts')
    const everyoneRules = rules.filter((r) => r.audience === 'everyone')
    const hits = strings.flatMap((s) => everyoneRules.filter((r) => r.re.test(s.text)))
    expect(hits.length).toBeGreaterThanOrEqual(3) // broadcast noun + lowercase zaps + lowercase gems
  })

  it('holds both lists to their caps, so the shrinking list cannot quietly grow', () => {
    expect(SURFACES.size).toBeLessThanOrEqual(MAX_SURFACE_ENTRIES)
    expect(EXCEPTIONS.length).toBeLessThanOrEqual(MAX_EXCEPTIONS)
    // A waiver without a canon citation is a waiver nobody can audit.
    for (const e of EXCEPTIONS) {
      expect(rules.some((r) => r.name === e.rule), e.rule).toBe(true)
      expect(e.why.length, e.file).toBeGreaterThan(40)
    }
  })
})

describe('check-canon · the live tree', () => {
  it('read a real corpus, so silence means something (the non-triviality floor)', () => {
    // The seam scan's verdict is "none of the N strings I extracted breaks canon". Assert N first:
    // a broken walk, a moved root, or a TypeScript upgrade that reclassifies every literal would
    // otherwise turn "I never looked" into "I looked and it was fine". Same instrument as
    // MIN_TARGETS here and MIN_RESOLVED in check-labels.mjs.
    const { files, strings } = scanCodeSeam()
    expect(files.length).toBeGreaterThanOrEqual(MIN_SEAM_FILES)
    expect(strings).toBeGreaterThanOrEqual(MIN_SEAM_STRINGS)
  })

  it('never walks a test file, so a test may pin a canon violation on purpose', () => {
    const { files } = scanCodeSeam()
    expect(files.filter((f: string) => /\.(test|spec)\.tsx?$/.test(f))).toEqual([])
  })

  it('COPY_KEYS is the whole widening lever, and it is non-empty', () => {
    expect(COPY_KEYS.size).toBeGreaterThan(20)
    for (const k of ['label', 'title', 'description', 'placeholder', 'blurb']) expect(COPY_KEYS.has(k)).toBe(true)
    // A key that is not copy would drag identifiers into the scan.
    for (const k of ['className', 'href', 'key', 'id', 'slug', 'type']) expect(COPY_KEYS.has(k)).toBe(false)
  })

  it('content/, the marketing source, and every member-facing string in app/ + lib/ + components/ are on-canon', () => {
    const { content, marketing, seam } = checkCanon()
    interface Finding { file: string; line: number | null; rule: CanonRule; text: string }
    const fmt = (v: Finding) => `${v.file}${v.line ? `:${v.line}` : ''} — ${v.rule.name}\n    ${v.text}`
    const all = [...content, ...marketing.found, ...seam.found]
    expect(all.map(fmt), `\n${all.map(fmt).join('\n')}\n`).toEqual([])
  })
})
