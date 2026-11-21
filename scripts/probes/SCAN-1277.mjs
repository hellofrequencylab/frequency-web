// SCAN-1277: a Spotlight with almost nothing on it says noindex and stays out of the sitemap, and a
// member's Spotlight title no longer matches the Space Spotlight of the same name.
import { existsSync, readFileSync } from 'node:fs'

const read = (f) => (existsSync(f) ? readFileSync(f, 'utf8') : '')
const bad = []

const rule = read('lib/seo/thin-spotlight.ts')
const min = /SPOTLIGHT_MIN_WORDS = (\d+)/.exec(rule)?.[1]
if (!min) bad.push('there is no thin-Spotlight rule (lib/seo/thin-spotlight.ts)')

const member = read('app/spotlight/[handle]/page.tsx')
if (!/isThinSpotlightText\(data\.profile\.bio\) \? \{ robots: \{ index: false, follow: true \} \}/.test(member))
  bad.push('a member Spotlight with almost no bio is indexable')
if (!/\(@\$\{data\.profile\.handle\}\)/.test(member)) bad.push('a member Spotlight carries the same title as the Space Spotlight of the same name')

const space = read('app/spaces/[slug]/spotlight/page.tsx')
if (!/isThinSpotlightText\(space\.about\) \? \{ robots: \{ index: false, follow: true \} \}/.test(space))
  bad.push('a Space Spotlight with almost no About is indexable')

const data = read('lib/spotlight/data.ts')
if (!min || !data.includes(`.filter(Boolean).length >= ${min})`)) bad.push('the sitemap advertises member Spotlights with almost no bio')

const discovery = read('lib/spaces/discovery.ts')
if (!/!isThinSpotlightText\(r\.about\) && readSpaceSpotlight\(r\.preferences\)\.published\) push\('spotlight'\)/.test(discovery))
  bad.push('the sitemap advertises Space Spotlights with almost no About')

if (bad.length) {
  console.error('SCAN-1277: ' + bad.join('; '))
  process.exit(1)
}
console.log('SCAN-1277: thin Spotlights say noindex and stay out of the sitemap; the two Spotlight titles differ')
