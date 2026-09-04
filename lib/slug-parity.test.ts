import { describe, it, expect } from 'vitest'
// (fixture words avoid Tailwind utility prefixes such as `leading-*`: scripts/check-phantom-classes.mjs
//  is a text scan and would read them as a class that emits no CSS.)
import { readFileSync, readdirSync } from 'node:fs'
import path from 'node:path'
import { slugify } from './utils'
import { slugifyName } from './importer/map'
import { slugifyLabel } from './spaces/profile-pages'

/** How many times `needle` appears in `hay`, by indexOf — RULE_BODY looks like a regex to a
 *  reader (and to CodeQL js/string-instead-of-regex), and it must be matched as plain text. */
function occurrences(hay: string, needle: string): number {
  let n = 0
  for (let i = hay.indexOf(needle); i !== -1; i = hay.indexOf(needle, i + needle.length)) n++
  return n
}

// ONE SLUG RULE (B5 dead-code sweep D3, 2026-09-04).
//
// Twenty-odd private copies of "lowercase, hyphenate the rest, trim the hyphens" lived across the
// tree, and two of them DISAGREED: lib/importer/map.ts decomposed with NFKD and the rest did not,
// so an imported "Café Solstice" became `cafe-solstice` while a hand-created Space of the same name
// became `caf-solstice`. Neither stripped the combining marks NFKD produces, so "naïve" was `nai-ve`
// on one side and `na-ve` on the other. The rule now lives once, in lib/utils.ts slugify, and the
// callers that carried a length cap keep only the cap (plus the re-strip of a hyphen a cut can
// leave behind) and delegate.
//
// Three things are pinned:
//   1. ASCII is untouched. Every stored slug was derived from a name, and a name in plain ASCII
//      must derive to the SAME bytes it always did, or a URL somewhere stops resolving. The old
//      body is frozen below and the new one is measured against it across every printable ASCII
//      character.
//   2. The delegates agree with the rule, accents included, and their caps do what they say.
//   3. The copies that are gone stay gone, and the copies that remain are a frozen, named list that
//      fails when one is added OR removed, so the next consolidation starts from a true count.

// The body lib/utils.ts slugify carried before accents were folded, verbatim.
function legacySlugify(s: string): string {
  return s
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

const PRINTABLE_ASCII = Array.from({ length: 0x7f - 0x20 }, (_, i) => String.fromCharCode(0x20 + i))

describe('1. ASCII input derives to the same bytes it always did', () => {
  const ascii = [
    'San Diego North',
    'Still Water Wellness',
    '  About Us!  ',
    'Classes & Workshops',
    "rock'n'roll",
    'Box breathing',
    '***',
    '---',
    '',
    'A_B.C/D',
    'UPPER lower 123',
    'trailing hyphen-',
    '-leading hyphen',
    'tabs\tand\nnewlines',
    'a  b   c',
  ]

  for (const s of ascii) {
    it(`${JSON.stringify(s)}`, () => {
      expect(slugify(s)).toBe(legacySlugify(s))
    })
  }

  it('every printable ASCII character, in every position, is byte-identical to the old body', () => {
    for (const c of PRINTABLE_ASCII) {
      for (const probe of [`a${c}b`, `${c}ab`, `ab${c}`, `${c}${c}`, c]) {
        expect(slugify(probe), JSON.stringify(probe)).toBe(legacySlugify(probe))
      }
    }
    const all = PRINTABLE_ASCII.join('')
    expect(slugify(all)).toBe(legacySlugify(all))
  })
})

describe('2. accents fold to their base letter, and every delegate agrees with the rule', () => {
  const folded: Array<[string, string]> = [
    ['Café Solstice', 'cafe-solstice'],
    ['naïve café résumé', 'naive-cafe-resume'],
    ['Señor Ortíz', 'senor-ortiz'],
    ['Crème brûlée!!', 'creme-brulee'],
    ['Dvořák', 'dvorak'],
    ['İstanbul', 'istanbul'],
    ['ﬁne print', 'fine-print'],
    ['Emoji 🎉 party', 'emoji-party'],
    ['“Quoted” — and ‘more’', 'quoted-and-more'],
    ["rock'n'roll", 'rock-n-roll'],
    ['...Edge & hyphens!!!', 'edge-hyphens'],
    ['日本語', ''],
  ]

  for (const [input, expected] of folded) {
    it(`${JSON.stringify(input)} -> ${JSON.stringify(expected)}`, () => {
      expect(slugify(input)).toBe(expected)
      // Under the caps (40) the delegates are the rule exactly.
      expect(slugifyName(input)).toBe(expected)
      expect(slugifyLabel(input)).toBe(expected)
    })
  }

  it('the two former disagreements now agree, and are right', () => {
    // Before: lib/utils.ts said `caf-solstice`, lib/importer/map.ts said `cafe-solstice`.
    expect(slugify('Café Solstice')).toBe(slugifyName('Café Solstice'))
    // Before: `na-ve-caf-r-sum` vs `nai-ve-cafe-re-sume`. Neither was `naive-cafe-resume`.
    expect(slugify('naïve café résumé')).toBe('naive-cafe-resume')
    expect(slugifyName('naïve café résumé')).toBe('naive-cafe-resume')
    expect(slugifyLabel('naïve café résumé')).toBe('naive-cafe-resume')
  })

  it('the caps cut at 40 and never leave a trailing hyphen', () => {
    // 50 chars; the cut at 40 lands exactly on the hyphen after "lazy" (index 39).
    const long = 'the quick brown fox jumps over the lazy dogs again'
    const rule = slugify(long)
    expect(rule.length).toBeGreaterThan(40)
    for (const capped of [slugifyName(long), slugifyLabel(long)]) {
      expect(capped.length).toBeLessThanOrEqual(40)
      expect(capped).toBe(rule.slice(0, 40).replace(/-+$/g, ''))
      expect(capped.endsWith('-')).toBe(false)
    }
    // A cut that lands on a word boundary is the case that used to leak a hyphen.
    // 10+1+10+1+10+1+6 = 39 chars, so the hyphen after "dddddd" sits at index 39, inside the cut.
    const boundary = 'aaaaaaaaaa bbbbbbbbbb cccccccccc dddddd eeee'
    expect(slugify(boundary).slice(0, 40).endsWith('-')).toBe(true)
    expect(slugifyName(boundary)).toBe('aaaaaaaaaa-bbbbbbbbbb-cccccccccc-dddddd')
    expect(slugifyLabel(boundary)).toBe('aaaaaaaaaa-bbbbbbbbbb-cccccccccc-dddddd')
  })
})

const read = (p: string) => readFileSync(path.join(process.cwd(), p), 'utf8')
// The hyphenation step every copy carries. A file that has it has its own copy of the rule.
const RULE_BODY = 'replace(/[^a-z0-9]+/g'

describe('3. the copies that could not be imported here delegate instead (source shape)', () => {
  // lib/practices.ts is a `server-only` module with a service-role handle at import, and the create
  // Space form is a client component; neither can be called from a node test, so their delegation
  // is pinned in the source, the idiom of lib/events/rsvp-enforcement.test.ts.
  it('lib/practices.ts derives through the shared rule with its 40 cap and the trailing re-strip', () => {
    const src = read('lib/practices.ts')
    expect(src).toContain("import { slugify as slugifyShared } from '@/lib/utils'")
    expect(src).toContain("const slugify = (s: string): string => slugifyShared(s).slice(0, 40).replace(/-+$/g, '')")
    expect(src).not.toContain(RULE_BODY)
  })

  it('the create Space form suggests exactly what lib/spaces/provision.ts will derive', () => {
    const form = read('app/(main)/spaces/new/create-space-form.tsx')
    expect(form).toContain("import { cn, slugify as slugifyShared } from '@/lib/utils'")
    expect(form).toContain("return slugifyShared(name).slice(0, 40).replace(/-+$/g, '')")
    expect(form).not.toContain(RULE_BODY)
    // The server side of the same derivation, for the reader: same rule, same cap, same re-strip.
    const provision = read('lib/spaces/provision.ts')
    expect(provision).toContain("slugify(name).slice(0, 40).replace(/^-+|-+$/g, '')")
  })

  it('lib/importer/map.ts and lib/spaces/profile-pages.ts no longer carry the body', () => {
    expect(read('lib/importer/map.ts')).not.toContain(RULE_BODY)
    expect(read('lib/importer/map.ts')).not.toContain("normalize('NFKD')")
    expect(read('lib/spaces/profile-pages.ts')).not.toContain(RULE_BODY)
  })

  it('the rule body lives in lib/utils.ts, once, with the accent fold in front of it', () => {
    const utils = read('lib/utils.ts')
    expect(occurrences(utils, RULE_BODY)).toBe(1)
    expect(utils).toContain(".normalize('NFKD')")
    expect(utils).toContain('.replace(COMBINING_MARKS, \'\')')
    expect(utils.indexOf(".normalize('NFKD')")).toBeLessThan(utils.indexOf(RULE_BODY))
  })
})

describe('4. the remaining private copies are a frozen list (fails on a new one AND on a stale row)', () => {
  // Every non-test source file under lib/, app/ and components/ that still hyphenates with its own
  // copy of the rule, as of 2026-09-04. Some are genuinely a different kind (an underscore key, an
  // id joined with '', a path-derived storage key) and were left alone on purpose; the rest are the
  // next consolidation's worklist. Either way: adding a copy is a regression this test names, and
  // removing one without updating this list is a stale row it also names.
  const KNOWN_COPIES = [
    'app/(main)/admin/content/actions.ts',
    'app/(main)/admin/library/actions.ts',
    'app/(main)/admin/library/collections-actions.ts',
    'app/(main)/admin/library/recraft-actions.ts',
    'app/(main)/admin/library/vera-actions.ts',
    'app/(main)/admin/qr/campaign-actions.ts',
    'app/(main)/admin/walkthroughs/actions.ts',
    'app/(main)/pages/sequences/builder-actions.ts',
    'app/join/(induction)/induction.tsx',
    'components/admin/theme-studio/theme-editor.tsx',
    'components/studio/spark/draft/draft-store.ts',
    'components/studio/spark/spark-doors.tsx',
    'lib/ai/autodoc.ts',
    'lib/crm/import/map.ts',
    'lib/demo/engine.ts',
    'lib/demo/generate.ts',
    'lib/email-studio/loom-actions.ts',
    'lib/funnels/resolve.ts',
    'lib/importer/excerpt.ts',
    'lib/importer/materialize.ts',
    'lib/journey-plans.ts',
    'lib/loom/cover-actions.ts',
    'lib/loom/picker-actions.ts',
    'lib/page-editor/loom-field-actions.ts',
    'lib/utils.ts',
  ].sort()

  function sourceFiles(root: string): string[] {
    const out: string[] = []
    for (const entry of readdirSync(path.join(process.cwd(), root), { recursive: true, withFileTypes: true })) {
      if (!entry.isFile()) continue
      const rel = path.relative(process.cwd(), path.join(entry.parentPath, entry.name))
      if (rel.includes('node_modules') || rel.startsWith('.next') || rel.startsWith('.claude')) continue
      if (!/\.(ts|tsx)$/.test(rel) || /\.test\.tsx?$/.test(rel)) continue
      out.push(rel)
    }
    return out
  }

  it('matches the frozen list exactly', () => {
    const carrying = ['lib', 'app', 'components']
      .flatMap(sourceFiles)
      .filter((f) => read(f).includes(RULE_BODY))
      .sort()
    const added = carrying.filter((f) => !KNOWN_COPIES.includes(f))
    const gone = KNOWN_COPIES.filter((f) => !carrying.includes(f))
    expect(added, 'new private copies of the slug rule; delegate to lib/utils.ts slugify instead').toEqual([])
    expect(gone, 'copies no longer present; drop their rows from KNOWN_COPIES').toEqual([])
  })
})
