// The Free Human site has its menu pages, the full Partner badge, a kit-skinned editor canvas and no header admin links (LIVE-1937).
import { readFileSync } from 'node:fs'

let bad = 0
const fail = (m) => {
  console.error(`free human site pages: ${m}`)
  bad++
}
const site = readFileSync('lib/sites/free-human-site.ts', 'utf8')
for (const slug of ['program', 'workshops', 'books', 'audrey']) if (!new RegExp(`page:${slug}`).test(site)) fail(`no ${slug} page in the menu`)
const chrome = readFileSync('components/sites/site-chrome.tsx', 'utf8')
if (!/credit === 'badge' && !tk && <PartnerBadge \/>/.test(chrome)) fail('the Free Human footer does not draw the Partner badge')
if (!/adminLinks=\{fh \? null/.test(chrome)) fail('the Free Human header still draws admin links')
if (!/theme === 'FreeHuman' \? \{ theme: 'free-human'/.test(readFileSync('components/sites/editor/canvas.tsx', 'utf8'))) fail('the editor canvas has no Free Human skin')
process.exit(bad ? 1 : 0)
