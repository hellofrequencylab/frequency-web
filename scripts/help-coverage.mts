// Help-center coverage report. Reads the canonical feature-key registry
// (lib/help/feature-keys.ts) and every help article (lib/help/content.ts) and
// reports which features have a published article, which are draft-only, and which
// are undocumented — plus any article featureKey that isn't in the registry.
//
// This is the "what is everything, and is it documented?" measure the living-docs
// loop builds on (docs/SUPPORT-SYSTEM.md, ADR-067).
//
//   pnpm help:coverage           # print the report
//   pnpm help:coverage --strict  # also exit 1 if any CORE feature is undocumented
//   pnpm check:help              # the CI gate — runs WITH --strict (see package.json)
//
// Runs on Node's built-in TS type-stripping — no tsx/build step.

import { pathToFileURL } from 'node:url'
import { getAllCategories, type HelpArticle } from '../lib/help/content.ts'
import { FEATURE_KEYS, FEATURE_KEY_SET, type FeatureArea, type FeatureKey } from '../lib/help/feature-keys.ts'

/* ── The floor ──────────────────────────────────────────────────────────────────────────────────
 *
 * A gate that scans nothing reports a clean bill of health. Same pattern as MIN_ROWS in
 * check-gate-parity.mjs and MIN_PAGES in check-templates.mjs, and this guard has a specific,
 * reachable way to scan nothing: `loadCategoriesFromDisk` in lib/help/content.ts wraps its
 * `fs.readdir(HELP_DIR)` in `try { … } catch { return [] }`. A moved content/help tree, a renamed
 * directory, or a cwd that is not the repo root does not throw here — it returns zero articles.
 * With zero articles there are zero featureKeys, therefore zero orphans, therefore exit 0 and a
 * printed report whose every row is 🔴. The strict flag does not save it either: an empty registry
 * has no core keys to miss.
 *
 * TWO floors, because there are two corpora and each can collapse without the other:
 *   · MIN_ARTICLES — the content tree. Measured 2026-08-11: **55** articles (all published).
 *     25 is under half, so retiring a whole category cannot trip it.
 *   · MIN_FEATURE_KEYS — the registry the articles are measured AGAINST. Measured 2026-08-11:
 *     **46** keys, 36 of them core. 20 is under half. Without this one, a registry that lost its
 *     rows would report 0/0 = 100% core coverage and pass --strict cleanly, which is the same
 *     vacuous pass wearing a different hat.
 *
 * Re-measure with `pnpm help:coverage`; the summary block prints both live numbers.
 */
export const MIN_ARTICLES = 25
export const MIN_FEATURE_KEYS = 20

export interface Corpus {
  articles: HelpArticle[]
  featureKeys: FeatureKey[]
}

/** The floor verdict as a message, or null when both corpora are real. Returned rather than exited
 *  so a test can prove it fires on a synthetic empty corpus without spawning a process. */
export function floorViolation({ articles, featureKeys }: Corpus): string | null {
  if (articles.length < MIN_ARTICLES) {
    return (
      `✖ check:help read only ${articles.length} help article(s), expected at least ${MIN_ARTICLES}. ` +
      'content/help is missing or unreadable (lib/help/content.ts swallows that error and returns ' +
      'an empty list), so the walk is broken and its silence about coverage means nothing.'
    )
  }
  if (featureKeys.length < MIN_FEATURE_KEYS) {
    return (
      `✖ check:help loaded only ${featureKeys.length} feature key(s), expected at least ` +
      `${MIN_FEATURE_KEYS}. lib/help/feature-keys.ts is empty or lost its rows, so every article ` +
      'key would read as an orphan and every coverage percentage is measured against nothing. ' +
      'The walk is broken, so its silence means nothing.'
    )
  }
  return null
}

/* ── Coverage model ─────────────────────────────────────────────────────────────────────────────
 *
 * `io` is the test seam, same shape as check-templates.mjs's `evaluate(io)`: pass `{ articles,
 * featureKeys }` to score a synthetic corpus without touching disk. */
export interface Coverage {
  articles: HelpArticle[]
  featureKeys: FeatureKey[]
  /** key -> where it is documented. */
  coverage: Map<string, { published: string[]; draft: string[] }>
  /** Article featureKeys with no row in the registry — broken links, not backlog. */
  orphans: Map<string, string[]>
  statusOf: (key: string) => Status
  core: FeatureKey[]
  coreCovered: FeatureKey[]
  coreMissing: FeatureKey[]
  allCovered: number
}

export type Status = 'covered' | 'draft' | 'missing'

export async function collect(io: Partial<Corpus> = {}): Promise<Coverage> {
  const featureKeys = io.featureKeys ?? FEATURE_KEYS
  const articles =
    io.articles ?? (await getAllCategories({ includeDrafts: true })).flatMap((c) => c.articles)

  // Derive the membership set from `featureKeys` rather than reading the module-level
  // FEATURE_KEY_SET, so a seeded registry is measured against itself.
  const keySet =
    featureKeys === FEATURE_KEYS ? FEATURE_KEY_SET : new Set(featureKeys.map((f) => f.key))

  const coverage = new Map<string, { published: string[]; draft: string[] }>()
  for (const f of featureKeys) coverage.set(f.key, { published: [], draft: [] })

  const orphans = new Map<string, string[]>()

  for (const a of articles) {
    const ref = `${a.category}/${a.slug}`
    for (const key of a.featureKeys) {
      if (keySet.has(key)) {
        coverage.get(key)![a.status === 'published' ? 'published' : 'draft'].push(ref)
      } else {
        const list = orphans.get(key) ?? []
        list.push(ref)
        orphans.set(key, list)
      }
    }
  }

  const statusOf = (key: string): Status => {
    const c = coverage.get(key)!
    if (c.published.length > 0) return 'covered'
    if (c.draft.length > 0) return 'draft'
    return 'missing'
  }

  const core = featureKeys.filter((f) => f.core)
  return {
    articles,
    featureKeys,
    coverage,
    orphans,
    statusOf,
    core,
    coreCovered: core.filter((f) => statusOf(f.key) === 'covered'),
    coreMissing: core.filter((f) => statusOf(f.key) === 'missing'),
    allCovered: featureKeys.filter((f) => statusOf(f.key) === 'covered').length,
  }
}

// ── Report ────────────────────────────────────────────────────────────────────
const ICON: Record<Status, string> = { covered: '✅', draft: '🟡', missing: '🔴' }

const AREA_ORDER: FeatureArea[] = [
  'community', 'discovery', 'content', 'comms', 'engagement', 'account', 'membership', 'safety', 'operator',
]
const AREA_LABEL: Record<FeatureArea, string> = {
  community: 'Community', discovery: 'Discovery', content: 'Content', comms: 'Comms',
  engagement: 'Engagement', account: 'Account', membership: 'Membership', safety: 'Safety', operator: 'Operator',
}

const pad = (s: string, n: number) => s.padEnd(n)
const pct = (n: number, d: number) => (d === 0 ? 0 : Math.round((n / d) * 100))

export function report(c: Coverage): void {
  console.log('\n📒 Help-center coverage  (✅ published · 🟡 draft only · 🔴 undocumented)\n')

  for (const area of AREA_ORDER) {
    const keys = c.featureKeys.filter((f) => f.area === area)
    if (keys.length === 0) continue
    console.log(`  ${AREA_LABEL[area]}`)
    for (const f of keys) {
      const st = c.statusOf(f.key)
      const cov = c.coverage.get(f.key)!
      const where = cov.published[0] ?? cov.draft[0] ?? ''
      const tag = f.core ? '' : ' (secondary)'
      console.log(`    ${ICON[st]} ${pad(f.key, 16)} ${pad(f.label + tag, 34)} ${where}`)
    }
    console.log('')
  }

  if (c.orphans.size > 0) {
    console.log('  ⚠️  Article featureKeys not in the registry (add to lib/help/feature-keys.ts or fix the article):')
    for (const [key, refs] of c.orphans) console.log(`    ⚠️  ${pad(key, 16)} ${refs.join(', ')}`)
    console.log('')
  }

  console.log('  ── Summary ──────────────────────────────────────────────')
  console.log(`  Articles:        ${c.articles.length} (${c.articles.filter((a) => a.status === 'published').length} published, floor ${MIN_ARTICLES})`)
  console.log(`  Feature keys:    ${c.featureKeys.length} total (floor ${MIN_FEATURE_KEYS}) · ${c.allCovered} covered (${pct(c.allCovered, c.featureKeys.length)}%)`)
  console.log(`  Core coverage:   ${c.coreCovered.length}/${c.core.length} (${pct(c.coreCovered.length, c.core.length)}%)`)
  if (c.orphans.size > 0) console.log(`  Orphan keys:     ${c.orphans.size} ⚠️`)
  if (c.coreMissing.length > 0) {
    console.log(`\n  🔴 Undocumented core features (the backfill backlog):`)
    console.log(`     ${c.coreMissing.map((f) => f.key).join(', ')}`)
  }
  console.log('')
}

async function main(): Promise<void> {
  const strict = process.argv.includes('--strict')
  const c = await collect()
  report(c)

  // The floor comes FIRST: every verdict below is a statement about a corpus, and on an empty one
  // they are all vacuously clean.
  const floor = floorViolation(c)
  if (floor) {
    console.error(floor)
    process.exit(1)
  }

  // An ORPHAN key always fails, in every mode. It is not a backlog item like an undocumented
  // feature: it is a BROKEN LINK. A published article declares `featureKeys: [x]`, nothing in the
  // registry answers to `x`, and every in-product help affordance that resolves by feature key
  // silently finds nothing — the article exists, the reader never reaches it. Ten of these had
  // accumulated by 2026-08-10 (ADR-970), printed as a ⚠️ on a tool whose exit code nobody read.
  //
  // `coreMissing` stays behind --strict on purpose: writing an article is content work with an
  // owner and a queue, and failing every build on it would make the gate something to route
  // around. A key that points at nothing is a defect either way.
  if (c.orphans.size > 0) {
    console.error(`✖ ${c.orphans.size} article featureKey(s) resolve to nothing in lib/help/feature-keys.ts:`)
    for (const [key, refs] of c.orphans) console.error(`    ${key}  <- ${refs.join(', ')}`)
    console.error('\n  Either add the key to the registry (with a route that actually exists), or')
    console.error('  fix the article front matter. See docs/HELP-CENTER.md.')
    process.exit(1)
  }

  // `check:help` passes --strict as of 2026-08-11. It was not passing it before, which made the
  // core-coverage half of this gate advisory: the report printed 🔴 rows and exited 0, so the only
  // thing that could ever fail CI was an orphan key. Measured the day it was wired: core coverage
  // is 36/36 (100%), so turning it on changed no outcome and froze nothing — it arms the gate
  // against the NEXT core feature that ships without an article. The seven undocumented keys the
  // report still lists are all `core: false` (crew, profiles, marketing, outreach, pages, plus two
  // draft-only) and stay out of scope by design: `core` is the registry's own declaration of which
  // features owe a member-voice article, so there is no allowlist here — the registry IS the
  // allowlist, one boolean per row.
  if (strict && c.coreMissing.length > 0) {
    console.error(`✖ ${c.coreMissing.length} core feature(s) undocumented (strict mode).`)
    console.error(`    ${c.coreMissing.map((f) => f.key).join(', ')}`)
    console.error('\n  Write the article (content/help/<category>/<slug>.md, docs/HELP-CENTER.md)')
    console.error('  or, if the feature genuinely does not owe a member-voice article, set')
    console.error('  `core: false` on its row in lib/help/feature-keys.ts with a reason.')
    process.exit(1)
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) await main()
