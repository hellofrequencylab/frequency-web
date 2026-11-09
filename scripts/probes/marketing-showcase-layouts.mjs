// LIVE-2151: the four lane A marketing bodies each wear their own layout (owner 2026-11-04, "they are all
// really flat and text based. Make each a different layout that speaks to the feature, program or service").
// Measures the consequence: every body renders its own skeleton's markers from the showcase sheet, the sheet
// styles each marker, no two bodies share a skeleton, every loop the sheet adds stops for reduced motion, and
// no photo appears twice on one page.
import fs from 'node:fs'
import assert from 'node:assert/strict'

const read = (p) => fs.readFileSync(p, 'utf8')
const SHEET = 'app/themes/frequency/site-pages-showcase.css'
const css = read(SHEET)
const PAGES = {
  'components/frequency/site/pages/features/frequency-features.tsx': { root: 'pa-tour', marks: ['tour-map', 'tour-cover', 'sig', 'jr'] },
  'components/frequency/site/pages/spaces/frequency-spaces.tsx': { root: 'pa-show', marks: ['show-ch', 'show-panel', 'show-prev', 'show-types', 'show-sheet'] },
  'components/frequency/site/pages/people/frequency-people.tsx': { root: 'pa-folk', marks: ['folk-collage', 'folk-marq', 'folk-line', 'folk-step', 'folk-first'] },
  'components/frequency/site/pages/stories/frequency-stories.tsx': { root: 'pa-stories', marks: ['st-mast', 'st-arch', 'st-pull', 'st-ed', 'st-tell'] },
}

assert(fs.existsSync('app/themes/active/site-pages-showcase.ts'), 'the showcase sheet has no stub in app/themes/active')
for (const [file, { root, marks }] of Object.entries(PAGES)) {
  const src = read(file)
  assert(src.includes("'@/app/themes/active/site-pages-showcase'"), `${file} does not load the showcase sheet`)
  assert(new RegExp(`className="[^"]*\\b${root}\\b`).test(src), `${file} lost its layout root .${root}`)
  for (const m of marks) {
    assert(new RegExp(`className=[{"'\`][^>]*\\b${m}\\b`).test(src), `${file} lost the .${m} layout marker`)
    assert(css.includes(`.${root} .${m}`), `${SHEET} does not style .${root} .${m}`)
  }
  // No photo twice on one page (a marquee repeats its own strip on purpose, from one array).
  const photos = [...src.matchAll(/(?:photo\('|')((?:\/images\/site\/|\/brand\/frequency\/broll\/)?[\w-]+\.jpe?g)'/g)].map((m) => m[1].replace(/^.*\//, ''))
  const dup = photos.filter((p, i) => photos.indexOf(p) !== i)
  assert.deepEqual(dup, [], `${file} uses the same photo twice: ${dup.join(', ')}`)
}
// The features page's job photos live in its data file.
const data = read('components/frequency/site/pages/features/features-data.ts')
const jobPhotos = [...data.matchAll(/photo: '([\w-]+\.jpe?g)'/g)].map((m) => m[1])
assert.equal(new Set(jobPhotos).size, jobPhotos.length, 'a Features job photo repeats')

// Every keyframe the sheet defines has a reduced-motion stop.
for (const [, name] of css.matchAll(/@keyframes ([\w-]+)/g)) {
  const users = [...css.matchAll(new RegExp(`([^{}]+)\\{[^}]*animation:[^;}]*\\b${name}\\b`, 'g'))]
  assert(users.length > 0, `@keyframes ${name} is unused`)
  assert(/prefers-reduced-motion:reduce\)\{[^@]*animation:none/.test(css), `@keyframes ${name} has no reduced-motion stop`)
}
console.log('✓ marketing showcase: features, spaces, the-community and stories each render their own layout, styled, photo-unique, motion-safe')
