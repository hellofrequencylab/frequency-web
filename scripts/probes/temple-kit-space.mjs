// The Temple Theme Kit's Space page pass: a Space synced to the Temple website takes the kit's DISPLAY face only
// (Marcellus), never its body face (ADR-1728, ADR-1906). Fails on main (no 'temple-kit' faces id, no Space page rule).
// Run: node --experimental-strip-types --no-warnings --import ./scripts/probe-ts.mjs scripts/probes/temple-kit-space.mjs
import { existsSync, readFileSync } from 'node:fs'

let bad = 0
const fail = (m) => {
  console.error(`temple-kit space: ${m}`)
  bad++
}
const read = (p) => (existsSync(p) ? readFileSync(p, 'utf8') : '')

const faces = read('lib/theme/site-faces.ts')
if (!/SiteFacesId =[^\n]*'temple-kit'/.test(faces)) fail('SiteFacesId does not name temple-kit')
if (!/'temple-kit':\s*\{[^}]*--font-tp-marcellus/.test(faces)) fail('SITE_FACE_VARS has no Temple faces')
if (!/'temple-kit':\s*\n?\s*'https:\/\/fonts\.googleapis\.com\/css2\?family=Marcellus/.test(faces)) fail('SITE_FACE_SHEETS has no Temple sheet')
if (!/theme === 'temple-kit'/.test(read('lib/theme/site-style.ts').split('export function spacePageSiteFaces')[1]?.split('\n}')[0] ?? '')) fail('spacePageSiteFaces does not return temple-kit for a synced Temple website')

const css = read('app/themes/frequency/space-page.css')
const line = css.split('\n').find((l) => l.includes('[data-space-fonts="temple-kit"] {') && l.includes('--space-font-display'))
if (!line) fail('the Space page has no temple-kit display rule')
else if (/--space-font-body:\s*var\(--font-tp-jost\)/.test(line)) fail('the Space page takes the kit body face (display face and accent only, ADR-1728)')
if (!/\[data-space-fonts="temple-kit"\][^\n]*font-weight: 400/.test(css)) fail('the Space page has no temple-kit display weight rule')
process.exit(bad ? 1 : 0)
