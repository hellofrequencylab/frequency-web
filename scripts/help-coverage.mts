// Help-center coverage report. Reads the canonical feature-key registry
// (lib/help/feature-keys.ts) and every help article (lib/help/content.ts) and
// reports which features have a published article, which are draft-only, and which
// are undocumented — plus any article featureKey that isn't in the registry.
//
// This is the "what is everything, and is it documented?" measure the living-docs
// loop builds on (docs/SUPPORT-SYSTEM.md, ADR-067).
//
//   pnpm help:coverage           # print the report
//   pnpm help:coverage --strict  # exit 1 if any CORE feature is undocumented (CI)
//
// Runs on Node's built-in TS type-stripping — no tsx/build step.

import { getAllCategories } from '../lib/help/content.ts'
import { FEATURE_KEYS, FEATURE_KEY_SET, type FeatureArea } from '../lib/help/feature-keys.ts'

const strict = process.argv.includes('--strict')

const cats = await getAllCategories({ includeDrafts: true })
const articles = cats.flatMap((c) => c.articles)

// key -> { published: [], draft: [] }
const coverage = new Map<string, { published: string[]; draft: string[] }>()
for (const f of FEATURE_KEYS) coverage.set(f.key, { published: [], draft: [] })

// keys used in articles but not in the registry (vocabulary drift)
const orphans = new Map<string, string[]>()

for (const a of articles) {
  const ref = `${a.category}/${a.slug}`
  for (const key of a.featureKeys) {
    if (FEATURE_KEY_SET.has(key)) {
      coverage.get(key)![a.status === 'published' ? 'published' : 'draft'].push(ref)
    } else {
      const list = orphans.get(key) ?? []
      list.push(ref)
      orphans.set(key, list)
    }
  }
}

// ── Status helpers ────────────────────────────────────────────────────────────
type Status = 'covered' | 'draft' | 'missing'
function statusOf(key: string): Status {
  const c = coverage.get(key)!
  if (c.published.length > 0) return 'covered'
  if (c.draft.length > 0) return 'draft'
  return 'missing'
}
const ICON: Record<Status, string> = { covered: '✅', draft: '🟡', missing: '🔴' }

const AREA_ORDER: FeatureArea[] = [
  'community', 'discovery', 'content', 'comms', 'engagement', 'account', 'membership', 'safety', 'operator',
]
const AREA_LABEL: Record<FeatureArea, string> = {
  community: 'Community', discovery: 'Discovery', content: 'Content', comms: 'Comms',
  engagement: 'Engagement', account: 'Account', membership: 'Membership', safety: 'Safety', operator: 'Operator',
}

// ── Report ────────────────────────────────────────────────────────────────────
const pad = (s: string, n: number) => s.padEnd(n)
console.log('\n📒 Help-center coverage  (✅ published · 🟡 draft only · 🔴 undocumented)\n')

for (const area of AREA_ORDER) {
  const keys = FEATURE_KEYS.filter((f) => f.area === area)
  if (keys.length === 0) continue
  console.log(`  ${AREA_LABEL[area]}`)
  for (const f of keys) {
    const st = statusOf(f.key)
    const c = coverage.get(f.key)!
    const where = c.published[0] ?? c.draft[0] ?? ''
    const tag = f.core ? '' : ' (secondary)'
    console.log(`    ${ICON[st]} ${pad(f.key, 16)} ${pad(f.label + tag, 34)} ${where}`)
  }
  console.log('')
}

// ── Orphan keys ───────────────────────────────────────────────────────────────
if (orphans.size > 0) {
  console.log('  ⚠️  Article featureKeys not in the registry (add to lib/help/feature-keys.ts or fix the article):')
  for (const [key, refs] of orphans) console.log(`    ⚠️  ${pad(key, 16)} ${refs.join(', ')}`)
  console.log('')
}

// ── Summary ───────────────────────────────────────────────────────────────────
const core = FEATURE_KEYS.filter((f) => f.core)
const coreCovered = core.filter((f) => statusOf(f.key) === 'covered')
const coreMissing = core.filter((f) => statusOf(f.key) === 'missing')
const allCovered = FEATURE_KEYS.filter((f) => statusOf(f.key) === 'covered').length
const pct = (n: number, d: number) => (d === 0 ? 0 : Math.round((n / d) * 100))

console.log('  ── Summary ──────────────────────────────────────────────')
console.log(`  Articles:        ${articles.length} (${articles.filter((a) => a.status === 'published').length} published)`)
console.log(`  Feature keys:    ${FEATURE_KEYS.length} total · ${allCovered} covered (${pct(allCovered, FEATURE_KEYS.length)}%)`)
console.log(`  Core coverage:   ${coreCovered.length}/${core.length} (${pct(coreCovered.length, core.length)}%)`)
if (orphans.size > 0) console.log(`  Orphan keys:     ${orphans.size} ⚠️`)
if (coreMissing.length > 0) {
  console.log(`\n  🔴 Undocumented core features (the backfill backlog):`)
  console.log(`     ${coreMissing.map((f) => f.key).join(', ')}`)
}
console.log('')

if (strict && coreMissing.length > 0) {
  console.error(`✖ ${coreMissing.length} core feature(s) undocumented (strict mode).`)
  process.exit(1)
}
