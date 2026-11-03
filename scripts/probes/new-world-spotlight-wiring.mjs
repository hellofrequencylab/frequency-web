// LIVE-2068: the New World Spotlight layouts are registered and drawn on a live Spotlight, not only on /themes/new-world.
// Reads the files under node, never a test runner (LIVE-034).
import { readFileSync, existsSync } from 'node:fs'

const bad = []
const read = (p) => (existsSync(p) ? readFileSync(p, 'utf8') : '')

const layouts = read('lib/spotlight/layouts.ts')
if (!/'new-world': LAYOUT_BLURBS\.map/.test(layouts)) bad.push('lib/spotlight/layouts.ts does not register the new-world layouts')
if (!/export function isNewWorldKitLayout/.test(layouts)) bad.push('isNewWorldKitLayout is missing')
const shell = read('components/spotlight/spotlight-shell.tsx')
if (!/isNewWorldKitLayout\(theme\.layout\)[\s\S]*NewWorldKitSpotlightLayout/.test(shell)) bad.push('the Spotlight shell does not draw the New World layouts')
const page = read('app/spotlight/[handle]/page.tsx')
if (!/NEW_WORLD_FONT_CLASS/.test(page)) bad.push('the public Spotlight page does not load New World faces for its layouts')

if (bad.length) {
  console.error(bad.map((b) => `FAIL ${b}`).join('\n'))
  process.exit(1)
}
console.log('ok: New World Spotlight layouts are registered and drawn')
