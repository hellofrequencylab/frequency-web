// The Designer Theme Kit's Space page pass: a Space synced to the Designer website takes the kit's DISPLAY face only
// (Cormorant), never its body face (ADR-1728, ADR-1906). Fails on main (no 'designer' faces id, no Space page rule).
import { existsSync, readFileSync } from 'node:fs'

let bad = 0
const fail = (m) => {
  console.error(`designer-kit space: ${m}`)
  bad++
}
const read = (p) => (existsSync(p) ? readFileSync(p, 'utf8') : '')

const faces = read('lib/theme/site-faces.ts')
if (!/SiteFacesId =[^\n]*'designer'/.test(faces)) fail('SiteFacesId does not name designer')
if (!/designer:\s*\{[^}]*--font-dz-cormorant/.test(faces)) fail('SITE_FACE_VARS has no Designer faces')
if (!/designer:\s*\n?\s*'https:\/\/fonts\.googleapis\.com\/css2\?family=Cormorant/.test(faces)) fail('SITE_FACE_SHEETS has no Designer sheet')
if (!/theme === 'designer'/.test(read('lib/theme/site-style.ts').split('export function spacePageSiteFaces')[1]?.split('\n}')[0] ?? '')) fail('spacePageSiteFaces does not return designer for a synced Designer website')

const css = read('app/themes/frequency/space-page.css')
const line = css.split('\n').find((l) => l.includes('[data-space-fonts="designer"] {') && l.includes('--space-font-display'))
if (!line) fail('the Space page has no designer display rule')
else if (/--space-font-body:\s*var\(--font-dz-jost\)/.test(line)) fail('the Space page takes the kit body face (display face and accent only, ADR-1728)')
process.exit(bad ? 1 : 0)
