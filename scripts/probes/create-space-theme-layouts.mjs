// LIVE-2284: the Create a Space preview is laid out like each theme's own page, and shows the design's sample headline until the business writes its own.
import { readFileSync } from 'node:fs'
const css = readFileSync('components/frequency/site/pages/create-space/create-space-themes.css', 'utf8')
const site = readFileSync('lib/create-space/preview-site.ts', 'utf8')
const tsx = readFileSync('components/frequency/site/pages/create-space/space-preview.tsx', 'utf8')
const bad = []
if (!/const KIT_SAMPLE/.test(site) || !/sample: ghost \? KIT_SAMPLE/.test(site)) bad.push('no sample headline per theme while a ghost')
if (!/data-sample/.test(tsx)) bad.push('the preview does not mark a sample hero')
const v2 = css.slice(css.indexOf('v2 (owner'))
for (const t of ['new-world', 'services', 'designer', 'midnight', 'network-kit', 'temple-kit', 'bold', 'wildheart']) {
  if (!v2.includes(`[data-preview-theme="${t}"]`)) bad.push(`no v2 layout block for ${t}`)
}
if (bad.length) { console.error(bad.join('\n')); process.exit(1) }
