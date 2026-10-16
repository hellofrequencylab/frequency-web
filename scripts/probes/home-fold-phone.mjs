// SCAN-959: on a phone the home page's photo scroll (the pinned fold) stuttered, jammed and loaded late.
// Measures the consequences of the fix:
//   1. every fold photo is served from a small variant (photos/sm, at most 120KB) with the original
//      only in the srcset, and each variant exists;
//   2. the fold's progress is measured against the stage's own height, not `innerHeight`, which changes
//      while a phone's address bar slides away;
//   3. the motion loop reads every box before it writes any style (no forced second layout per frame);
//   4. on a phone the fold drops the orbs between the photos and the photos' 80px shadow.
// Run: node scripts/probes/home-fold-phone.mjs
import assert from 'node:assert/strict'
import { existsSync, readFileSync, statSync } from 'node:fs'

const home = readFileSync('components/frequency/site/pages/home/frequency-home.tsx', 'utf8')
const files = [...home.matchAll(/\['([\w-]+\.jpg)', [\d.]+, \{/g)].map((m) => m[1])
assert.equal(files.length, 6, 'the fold has six photos')
assert.ok(home.includes('src={photo(`sm/${file}`)}'), 'fold photos load the small variant')
assert.ok(home.includes('srcSet={`${photo(`sm/${file}`)} 640w, ${photo(file)} 1600w`}'), 'the original is only a srcset candidate')
for (const f of files) {
  const p = `public/brand/frequency/photos/sm/${f}`
  assert.ok(existsSync(p), `${p} exists`)
  assert.ok(statSync(p).size <= 120 * 1024, `${p} is at most 120KB`)
}

const motion = readFileSync('components/frequency/site/pages/home/home-motion.tsx', 'utf8')
const tick = motion.slice(motion.indexOf('const tick = () => {'), motion.indexOf('let queued = false'))
assert.ok(tick.length > 0, 'the motion loop is found')
assert.ok(!tick.includes('innerHeight'), 'the fold progress does not read innerHeight per frame')
assert.ok(motion.includes("querySelector<HTMLElement>('.fold-stage')"), 'the stage height is the measure')
const lastRead = Math.max(tick.lastIndexOf('getBoundingClientRect'), tick.lastIndexOf('offsetHeight'))
const firstWrite = tick.indexOf('.style.')
assert.ok(firstWrite > 0 && lastRead < firstWrite, 'every read comes before the first write')

const css = readFileSync('app/themes/frequency/site-pages-a.css', 'utf8')
const phone = css.slice(css.indexOf('@media (max-width:760px){[data-design="frequency"] [data-kit="site"] .pa-home .fold{height:400vh}'))
const block = phone.slice(0, phone.indexOf('}}') + 2)
assert.ok(block.includes('.fold-stage>.tx-field .tx-jewel{display:none}'), 'no orbs between the photos on a phone')
assert.ok(/\.fl-ph\{[^}]*box-shadow:0 14px 32px/.test(block), 'a light photo shadow on a phone')

console.log('home-fold-phone: ok')
