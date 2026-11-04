#!/usr/bin/env node
// LIVE-2158 probe: the lane B marketing pages each have their own layout on the design system's textures
// (Daniel 2026-11-04: "they are all really flat and text based"). Each page's body carries its layout's
// markers, the stylesheet draws them, the textures are on (grain on photos, glass over photos, the
// iridescent rim, dotted connectors), every photo is used once per page, and the words, links and form stay.
import { readFileSync } from 'node:fs'

const read = (f) => readFileSync(f, 'utf8')
const bad = []
const P = 'components/frequency/site/pages'
const pages = {
  '/for': [`${P}/funnel/frequency-for-index.tsx`, ['fo-collage', 'fo-doors', 'fo-door-tx fq-glass', 'fq-iri-rim', 'See your door →']],
  '/vs': [`${P}/funnel/frequency-compare.tsx`, ['fv-venn', 'fv-cards', 'fv-us fq-glass', 'Frequency vs {c.name}', 'comparisonPath(c.slug)']],
  '/subscribe': [`${P}/funnel/frequency-subscribe.tsx`, ['fsb-grid', 'fn-col fn-glass', 'fsb-steps', '<FrequencySubscribeForm />', 'Get notes from Frequency.']],
  '/free-spotlight': [`${P}/launch/free-spotlight.tsx`, ['fsp-portrait fq-iri-rim', 'fsp-stack', 'fsp-path', '<FreeSpotlightButton surface="landing" variant="primary" />']],
  '/mindless': ['app/(marketing)/mindless/page.tsx', ['image={HERO_STILL}', '<FnColumn label="02 Timer" glass>', '<FrequencyMindlessTimer />']],
  '/subscribe/confirm': ['app/(marketing)/subscribe/confirm/page.tsx', ['<FnStage image={CONFIRM_STILL}>', 'image={CONFIRM_STILL}']],
  '/create-a-space': [`${P}/create-space/create-space-sections.tsx`, ['cs-pain-lead fq-iri-rim', 'cs-pain-text fq-glass', 'cs-signal', 'cs-band-pic', 'Free to <em className="fq-iri-text">operate.</em>']],
}
for (const [route, [file, markers]] of Object.entries(pages)) {
  const s = read(file)
  for (const m of markers) if (!s.includes(m)) bad.push(`${route}: ${file} is missing "${m}"`)
  // One photo, once: no still path appears twice in a page's body.
  const stills = [...s.matchAll(/['`](\/(?:brand|images|create-a-space)\/[^'`]+\.(?:jpe?g|png))['`]/g)].map((m) => m[1])
  const dupes = stills.filter((p, i) => stills.indexOf(p) !== i)
  if (dupes.length) bad.push(`${route}: the same photo twice (${[...new Set(dupes)].join(', ')})`)
}
const parts = read(`${P}/funnel/parts.tsx`)
if (!/function FnStill/.test(parts) || !/fq-grain/.test(parts)) bad.push('funnel/parts.tsx has no photo still with grain for FnHero / FnStage')
if (/^import [^\n]*from '(?!react|next\/link|\.\.\/shared\/photo-bg|@\/components\/frequency\/icon|@\/app\/themes\/active\/site-(?:pages-b|funnel))/m.test(parts)) {
  bad.push('funnel/parts.tsx imports a module the timer-runtime probe does not map')
}
const css = read('app/themes/frequency/site-funnel.css')
for (const sel of ['.fo-doors{', '.fv-card{', '.fsb-pair{', '.fsp-stack{', '.fn-sec.fn-lift{', '.fn-glass .fn-box{']) {
  if (!css.includes(sel)) bad.push(`site-funnel.css does not draw ${sel}`)
}
if ((css.match(/dotted var\(--fq-ig-dash\)/g) || []).length < 2) bad.push('site-funnel.css has no dotted connectors between steps')
if (!/prefers-reduced-motion:reduce\)\{\[data-design="frequency"\] \[data-kit="site"\] \.fn-lift \.fn-halo i\{animation:none/.test(css)) bad.push('the breath halo ignores reduced motion')
const cs = read(`${P}/create-space/create-space.css`)
if (!/scroll-snap-type:x mandatory/.test(cs) || !/\.cs-band-pic\{/.test(cs)) bad.push('create-space.css has no phone rail or photo band')
if (/#5B3FD0/i.test(css + cs)) bad.push('the banned violet is back')
if (bad.length) {
  console.error('LIVE-2158 probe failed:\n- ' + bad.join('\n- '))
  process.exit(1)
}
console.log('LIVE-2158: /for, /vs, /subscribe, /subscribe/confirm, /free-spotlight, /mindless and /create-a-space each wear their own layout, with photos used once')
