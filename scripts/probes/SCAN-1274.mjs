// SCAN-1274: New World niche links keep their niche, the listing composer is noindex, and an empty
// list publishes no ItemList.
import { readFileSync } from 'node:fs'

const theme = readFileSync('components/frequency/site/pages/themes/frequency-new-world.tsx', 'utf8')
const composer = readFileSync('app/(main)/(marketplace)/classifieds/new/page.tsx', 'utf8')
const jsonLd = readFileSync('components/json-ld.tsx', 'utf8')
const bad = []
if (/\$\{START_HREF\}\?niche=/.test(theme)) bad.push('the niche link appends ?niche= to a link that already has a query')
if (!/START_HREF\.includes\('\?'\) \? '&' : '\?'/.test(theme)) bad.push('the niche link does not pick & or ? by the base link')
if (!/export const metadata = \{[^\n]*robots: \{ index: false, follow: false \}/.test(composer)) bad.push('/classifieds/new is indexable')
if (!/itemListElement\.length === 0/.test(jsonLd)) bad.push('an ItemList with no items is still published')
if (bad.length) {
  console.error('SCAN-1274: ' + bad.join('; '))
  process.exit(1)
}
console.log('SCAN-1274: niche links are well formed, the listing composer is noindex, empty ItemLists are dropped')
