// LIVE-2455: the Spotlight editor opens on the page itself, with Look and Share and stats on their own tabs,
// and a phone switches between Edit and Preview.
import { readFileSync } from 'node:fs'
const ed = readFileSync('components/spotlight/space-spotlight-editor.tsx', 'utf8')
const fail = (m) => { console.error(`LIVE-2455: ${m}`); process.exit(1) }
if (!/useState<'page' \| 'look' \| 'share'>\('page'\)/.test(ed)) fail('the editor does not open on the Page tab')
if (!/tab === 'look' && themes/.test(ed) || !/tab === 'share' && published && clicks/.test(ed)) fail('theme and stats still stack above the page')
if (!/label="Edit or preview"/.test(ed)) fail('a phone has no Edit or Preview switch')
console.log('LIVE-2455 ok')
