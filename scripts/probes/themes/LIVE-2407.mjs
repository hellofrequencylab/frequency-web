#!/usr/bin/env node
// LIVE-2407 probe: Mindless is offered in the pickers and the theme library, its page is in search, and every picture it wears is in the repo.
// Reads the sources (no build): RETIRED_FROM_PICKERS in lib/theme/site-style.ts, the ids in lib/themes/library.ts, the theme page, the
// sitemap and the photo paths the kits, the home and the preview name.
import { existsSync, readFileSync } from 'node:fs'
const read = (p) => readFileSync(p, 'utf8')
const problems = []
const retired = read('lib/theme/site-style.ts').match(/RETIRED_FROM_PICKERS[^=]*=\s*new Set\(\[([^\]]*)\]/)?.[1] ?? ''
if (retired.includes("'mindless'")) problems.push('mindless is still retired from the pickers')
if (!read('lib/themes/library.ts').includes("id: 'mindless'")) problems.push('mindless has no theme library entry')
if (/robots:\s*\{\s*index:\s*false/.test(read('app/(marketing)/themes/mindless/page.tsx'))) problems.push('/themes/mindless is still noindex')
if (!read('app/sitemap.ts').includes('/themes/mindless`')) problems.push('/themes/mindless is not in the sitemap')
const manifest = JSON.parse(read('lib/themes/manifests/mindless.manifest.json'))
if (manifest.offered !== true || !manifest.library) problems.push('the mindless manifest does not say offered with a library entry')
// Every picture is one of Frequency's own, in the paint treatment, and is in the repo.
const sources = ['lib/sites/mindless-home.ts', 'lib/sites/kits/mindless-variants.ts', 'lib/spotlight/mindless-kit-content.ts', 'lib/create-space/preview-site.ts'].map(read).join('\n')
const names = new Set()
for (const m of sources.matchAll(/\/sites\/mindless\/photos\/([a-z0-9-]+)\.jpg/g)) names.add(m[1])
for (const m of sources.matchAll(/(?:PHOTO|MINDLESS_PHOTO)\('([a-z0-9-]+)'\)/g)) if (/-(mono|yellow|pink|blue)$/.test(m[1])) names.add(m[1])
for (const kind of ['hero', 'guide']) for (const accent of ['yellow', 'pink', 'blue']) names.add(`${kind}-${accent}`)
if (names.size < 10) problems.push(`only ${names.size} Mindless pictures found in the sources`)
for (const n of names) if (!existsSync(`public/sites/mindless/photos/${n}.jpg`)) problems.push(`Mindless photo ${n} is missing`)
if (problems.length) { console.error(problems.join('\n')); process.exit(1) }
console.log(`LIVE-2407: Mindless offered and catalogued; ${names.size} pictures present`)
