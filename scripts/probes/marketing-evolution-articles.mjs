#!/usr/bin/env node
// LIVE-2163 probe: the four seeker articles each have their own layout on the design system's textures
// (Daniel 2026-11-04: "they are all really flat and text based"). Each spec picks a different `design`, the
// generator composes it from the registered article blocks, the blocks draw each layout's markers, the
// stylesheet dresses them (grain on photos, glass over photos, dotted connectors, a signal spine, the
// iridescent rim), the HowTo still comes from the visible steps, and no page shows the same photo twice.
import { readFileSync } from 'node:fs'

const read = (f) => readFileSync(f, 'utf8')
const bad = []
const T = 'lib/page-editor/templates'
const designs = {
  loneliness: 'quiet',
  'friendship-as-an-adult': 'conversation',
  'how-to-be-more-social': 'path',
  'how-to-start-a-circle': 'manual',
}
const seen = new Set()
for (const [slug, design] of Object.entries(designs)) {
  const s = read(`${T}/${slug}.ts`)
  if (!s.includes(`design: '${design}'`)) bad.push(`${slug}: the spec does not pick the ${design} layout`)
  if (seen.has(design)) bad.push(`${slug}: shares a layout with another article`)
  seen.add(design)
  // One photo, once: every still a spec names is a distinct path.
  const consts = Object.fromEntries([...s.matchAll(/const (\w+_IMAGE) = '([^']+)'/g)].map((m) => [m[1], m[2]]))
  const used = [...s.matchAll(/\b(?:image2?|image): (\w+_IMAGE)\b/g)].map((m) => consts[m[1]])
  const dupes = used.filter((p, i) => p && used.indexOf(p) !== i)
  if (dupes.length) bad.push(`${slug}: the same photo twice (${[...new Set(dupes)].join(', ')})`)
}
const gen = read(`${T}/article.ts`)
for (const m of ["type: 'ArticleQuestion'", "type: 'ArticleLine'", "type: 'ArticleStory'", "type: 'ArticleSteps'", 'if (spec.design && ']) {
  if (!gen.includes(m)) bad.push(`article.ts does not compose ${m}`)
}
for (const d of Object.values(designs)) if (!new RegExp(`\\b${d}: \\{ question:`).test(gen)) bad.push(`article.ts has no ${d} recipe`)
const blocks = read('components/page-editor/blocks/article.tsx')
for (const m of ['art-signal', 'art-ask', 'art-reply', 'art-node', 'art-check', 'art-bento', 'art-card-b', 'art-chapter-frame', 'fq-glass', 'fq-grain', 'fq-iri-rim', 'howToStepsSchema({ name, intro, totalTime, steps })', '<JsonLd data={node} />']) {
  if (!blocks.includes(m)) bad.push(`blocks/article.tsx is missing "${m}"`)
}
const config = read('lib/page-editor/config.tsx')
if (!config.includes('...articleComponents') || !config.includes('...ARTICLE_BLOCK_TYPES') || !read('lib/page-editor/palette-scope.ts').includes("article: 'FrequencySite'")) bad.push('the article blocks are not registered and categorised in the block config')
const css = read('app/themes/frequency/site-blocks.css')
for (const sel of ['.art-q-quiet .art-signal', '.art-q-talk .art-ask', 'section:is(.art-q-path, .art-line-signpost)::before', '.art-steps-list-timeline::before', '.art-bento .art-tile-head', '.art-story-overlap .art-card-b', '.art-q-panel .art-num']) {
  if (!css.includes(sel)) bad.push(`site-blocks.css does not draw ${sel}`)
}
if ((css.match(/dotted var\(--fq-ig-dash\)/g) || []).length < 3) bad.push('site-blocks.css has no dotted connectors on the path')
if (!/prefers-reduced-motion: reduce\)[^}]*\.art-line-frame \.art-line-text > span,[^}]*\.art-q-panel \.art-num \{\s*animation: none/.test(css)) bad.push('the article sweeps ignore reduced motion')
if (/#5B3FD0/i.test(css + blocks)) bad.push('the banned violet is back')
const route = read('app/(marketing)/loneliness/page.tsx')
if (/<section/.test(route)) bad.push('a coded section reached an editor-backed route')
if (bad.length) {
  console.error('LIVE-2163 probe failed:\n- ' + bad.join('\n- '))
  process.exit(1)
}
console.log('LIVE-2163: loneliness, friendship-as-an-adult, how-to-be-more-social and how-to-start-a-circle each wear their own layout, with photos used once')
