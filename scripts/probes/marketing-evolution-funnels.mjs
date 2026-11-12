#!/usr/bin/env node
// LIVE-2158 (Daniel-approved Gate A re-aim, 2026-11-11): surviving funnel pages keep their layouts; retired entry pages permanently redirect.
// Each surviving page keeps its own layout markers, textures and photo usage.
import { existsSync, readFileSync } from 'node:fs'

const read = (f) => readFileSync(f, 'utf8')
const bad = []
const P = 'components/frequency/site/pages'
const pages = {
  '/for': [`${P}/funnel/frequency-for-index.tsx`, ['fo-collage', 'fo-doors', 'fo-door-tx fq-glass', 'fq-iri-rim', 'See your door →']],
  '/vs': [`${P}/funnel/frequency-compare.tsx`, ['fv-venn', 'fv-cards', 'fv-us fq-glass', 'Frequency vs {c.name}', 'comparisonPath(c.slug)']],
  '/subscribe': [`${P}/funnel/frequency-subscribe.tsx`, ['fsb-grid', 'fn-col fn-glass', 'fsb-steps', '<FrequencySubscribeForm />', 'Get notes from Frequency.']],
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

const config = read('next.config.ts')
for (const [source, destination] of [
  ['/spaces/launch', '/create-a-space'],
  ['/start/welcome', '/join'],
  ['/start/event', '/join'],
  ['/start/partner', '/start/host'],
]) {
  const entry = `{ source: '${source}', destination: '${destination}', permanent: true }`
  if (!config.includes(entry)) bad.push(`${source} must permanently redirect to ${destination}`)
}
const retiredLaunch = ['app', '(main)', 'spaces', 'launch', 'page.tsx'].join('/')
if (existsSync(retiredLaunch)) bad.push('the retired launch page still exists')
if (!existsSync('app/(marketing)/start/host/page.tsx')) bad.push('/start/host must remain available for invite attribution')

const parts = read(`${P}/funnel/parts.tsx`)
if (!/function FnStill/.test(parts) || !/fq-grain/.test(parts)) bad.push('funnel/parts.tsx has no photo still with grain for FnHero / FnStage')
if (/^import [^\n]*from '(?!react|next\/link|\.\.\/shared\/photo-bg|@\/components\/frequency\/icon|@\/app\/themes\/active\/site-(?:pages-b|funnel))/m.test(parts)) {
  bad.push('funnel/parts.tsx imports a module the timer-runtime probe does not map')
}
const css = read('app/themes/frequency/site-funnel.css')
for (const sel of ['.fo-doors{', '.fv-card{', '.fsb-pair{', '.fn-sec.fn-lift{', '.fn-glass .fn-box{']) {
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
console.log('LIVE-2158: surviving funnel pages retain their layouts, and retired launch entries permanently redirect to survivors')
