// LIVE-2534 probe: the Console has one Work page that rolls up to-dos and live Plans from the
// Frequency root Space and every Space the viewer runs, reachable from the Platform menu.
import { readFileSync, existsSync } from 'node:fs'

const fail = (m) => { console.error(`LIVE-2534: ${m}`); process.exit(1) }
const page = 'app/(main)/admin/work/page.tsx'
if (!existsSync(page)) fail(`${page} is missing`)
if (!/loadWorkRollup\(/.test(readFileSync(page, 'utf8'))) fail('the Work page does not read the rollup')
const loader = readFileSync('lib/work/rollup.ts', 'utf8')
if (!/loadRootSpaceId\(/.test(loader)) fail('the rollup leaves out the Frequency root Space')
if (!/listOperatedSpaces\(/.test(loader)) fail('the rollup leaves out the Spaces the viewer runs')
const studio = readFileSync('lib/nav/studio.ts', 'utf8')
if (!/id: 'work', href: '\/admin\/work'/.test(studio)) fail('no Work leaf in the studio catalog')
if (!/\{ heading: 'Work', leaves: \[\{ leaf: 'work' \}\] \}/.test(studio)) fail('Work is not in the Platform menu')
console.log('LIVE-2534: the Console Work rollup is wired')
