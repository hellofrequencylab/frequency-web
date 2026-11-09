#!/usr/bin/env node
// LIVE-2166 probe: lane D of the marketing evolution (Daniel 2026-11-04: "they are all really flat and text
// based. Make each a different layout"). /about tells its story as photo-led founder chapters and holds its
// principles around an orb; /how-to-build-community is a playbook with a cover index, numbered chapters and a
// tool-stack panel; /pricing puts photos beside and behind the plans with glass cards and a held questions
// column. Each page's source carries its layout's markers, the blocks and the stylesheet draw them, the
// textures are on, every photo is used once per page, and the pinned pricing classes stay.
import { readFileSync } from 'node:fs'

const read = (f) => readFileSync(f, 'utf8')
const bad = []
const need = (label, src, markers) => {
  for (const m of markers) if (!src.includes(m)) bad.push(`${label} is missing "${m}"`)
}
const oncePerPage = (label, src) => {
  const stills = [...src.matchAll(/['`](\/(?:brand|images)\/[^'`]+\.(?:jpe?g|png))['`]/g)].map((m) => m[1])
  const dupes = stills.filter((p, i) => stills.indexOf(p) !== i)
  if (dupes.length) bad.push(`${label}: the same photo twice (${[...new Set(dupes)].join(', ')})`)
}

const about = read('lib/page-editor/templates/about.ts')
need('/about template', about, ["type: 'FounderChapters'", "type: 'PrincipleOrbit'", '/brand/frequency/photos/daniel-tyack.jpg', 'A hunger nobody could name.', "The principles we won't trade away."])
if (/type: 'StoryBeats'|type: 'ValueBand'/.test(about)) bad.push('/about still renders the flat StoryBeats / ValueBand bands')
oncePerPage('/about', about)

const guide = read('lib/page-editor/templates/how-to-build-community.ts')
need('/how-to-build-community template', guide, ["type: 'PlaybookCover'", "type: 'PlaybookChapter'", "type: 'ToolStack'", 'export const data = playbook(articleTemplate(spec))'])
oncePerPage('/how-to-build-community', guide)

const blocks = read('components/page-editor/blocks/site-story.tsx')
need('site-story.tsx', blocks, ['st-fc-ch', 'st-fc-ph', 'fq-grain', 'st-po-ring', 'st-po-core', 'st-pb-idx fq-panel fq-iri-rim', '<h1 className="h-xl">', 'st-ch-num', 'st-ts-panel fq-panel', 'getImageProps'])
const config = read('lib/page-editor/config.tsx')
if (!/\.\.\.siteStoryComponents/.test(config)) bad.push('the site story blocks are not registered in the block config')

const pricing = read('components/frequency/site/pages/pricing/frequency-pricing.tsx')
need('/pricing body', pricing, ['pb-people', 'pb-people-ph fq-iri-rim', 'sec pb-sec pb-photo', 'pb-faq-side', 'pb-orb', 'st-sig', 'pop pb-plan', 'className="pb-flag"', "import '@/app/themes/active/site-pages-story'"])
oncePerPage('/pricing', pricing)

const css = read('app/themes/frequency/site-pages-story.css')
for (const sel of ['.st-fc-list::before{', '.st-po-ring{', '.st-pb-idx{', '.st-ch-num{', '.st-ts-t td.st-ts-on span{', '.pb-people{', '.pb-photo .pb-pc{', '.pb-faq-side{position:sticky']) {
  if (!css.includes(sel)) bad.push(`site-pages-story.css does not draw ${sel}`)
}
if ((css.match(/dotted var\(--fq-ig-dash\)/g) || []).length < 3) bad.push('site-pages-story.css has no dotted connectors')
if (!/prefers-reduced-motion:reduce\)\{\n\[data-design="frequency"\] \[data-kit="site"\] \.st-po-core\{animation:none\}/.test(css)) bad.push('the orb ignores reduced motion')
if (/#5B3FD0/i.test(css)) bad.push('the banned violet is back')
if (!read('app/themes/active/site-pages-story.ts').includes("import '../frequency/site-pages-story.css'")) bad.push('the site-pages-story stub does not load the sheet')

if (bad.length) {
  console.error('LIVE-2166 probe failed:\n- ' + bad.join('\n- '))
  process.exit(1)
}
console.log('LIVE-2166: /about, /how-to-build-community and /pricing each wear their own layout, with photos used once')
