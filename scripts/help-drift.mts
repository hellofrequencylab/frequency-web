// help:drift — given changed files (argv, or the PR diff vs origin/main), report
// which help articles a code change may have made stale. The deterministic input
// to the living-docs loop's AI doc-writer + the staff review checklist
// (docs/SUPPORT-SYSTEM.md §6).
//
//   pnpm help:drift                       # diff vs origin/main
//   pnpm help:drift app/(main)/circles/page.tsx   # explicit files

import { execSync } from 'node:child_process'
import { getAllCategories } from '../lib/help/content.ts'
import { FEATURE_KEYS } from '../lib/help/feature-keys.ts'
import { affectedFeatureKeys, affectedArticles } from '../lib/help/drift.ts'

let files = process.argv.slice(2)
if (files.length === 0) {
  try {
    files = execSync('git diff --name-only origin/main...HEAD', { encoding: 'utf8' })
      .split('\n')
      .map((s) => s.trim())
      .filter(Boolean)
  } catch {
    files = []
  }
}

const cats = await getAllCategories()
const articles = cats.flatMap((c) => c.articles.map((a) => ({ category: c.slug, slug: a.slug, featureKeys: a.featureKeys })))

const keys = affectedFeatureKeys(files, FEATURE_KEYS)
const affected = affectedArticles(files, articles, FEATURE_KEYS)

console.log(`\n📒 Help drift — ${files.length} changed file(s)\n`)
if (keys.length === 0) {
  console.log('  ✅ No documented feature areas touched. No help review needed.\n')
} else {
  console.log(`  Feature areas touched: ${keys.join(', ')}\n`)
  if (affected.length === 0) {
    console.log('  ⚠️  No existing article covers these areas — consider writing one (see pnpm help:coverage).\n')
  } else {
    console.log('  📝 Review these articles for staleness (the AI doc-writer drafts updates here):')
    for (const a of affected) console.log(`     - content/help/${a.category}/${a.slug}.md  [${a.featureKeys.join(', ')}]`)
    console.log('')
  }
}
