// LIVE-2487: the owner's link styles and main-button pick work on every Spotlight theme, not only New World. Each kit
// reads the shared rules (lib/spotlight/door-style.ts): a text link never becomes the main button, the link marked main
// is the button, and each layout draws text links as a row and buttons as buttons through components/spotlight/door-runs.tsx.
import { readFileSync } from 'node:fs'
const read = (p) => readFileSync(p, 'utf8')
const fail = (m) => { console.error(`LIVE-2487: ${m}`); process.exit(1) }
const overlay = read('lib/spotlight/space-kit-page.ts')
if (!/mainLink\(facts\.links, facts\.linkStyle\)/.test(overlay)) fail('the kit themes still make the first link the main button, even a text link')
if (!/linkDoorStyle\(l, facts\.linkStyle\)/.test(overlay)) fail('the kit themes drop the style the owner picked for each link')
for (const f of ['cyberwitch', 'mindless']) {
  const s = read(`lib/spotlight/${f}-space-page.ts`)
  if (!/markedMainLink\(links\)/.test(s) || !/linkDoorStyle\(l, blockStyle\)/.test(s)) fail(`${f} ignores the link styles or the main-button pick`)
}
for (const f of ['cyberwitch-kit', 'mindless-kit', 'house-kit', 'services-kit', 'temple-kit', 'free-human', 'network-kit', 'designer-kit']) {
  const s = read(`components/spotlight/${f}-layouts.tsx`)
  if (!/from '@\/components\/spotlight\/door-runs'/.test(s) || !/<Door(Runs|Extras) doors=\{c\.doors\}/.test(s)) fail(`${f} draws every link as a card`)
}
console.log('LIVE-2487 ok')
