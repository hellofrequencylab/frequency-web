// The Free Human Theme Kit is registered as a Mega Theme, wears the editor's FreeHuman family, publishes live and ships its
// thirteen starter kits, and stays out of every picker (LIVE-1910, owner ruling 2026-10-29: private like House of Fates).
import { existsSync, readFileSync } from 'node:fs'

let bad = 0
const fail = (m) => {
  console.error(`free-human registered: ${m}`)
  bad++
}
const read = (p) => (existsSync(p) ? readFileSync(p, 'utf8') : '')

if (!/id: 'free-human', editor: 'FreeHuman', site: 'free-human'/.test(read('lib/theme/mega-theme.ts'))) fail('MEGA_THEMES has no free-human entry')
if (!/'FreeHuman'\]\)/.test(read('lib/sites/editor/state.ts').split('WEBSITE_THEMES_LIVE')[1] ?? '')) fail('FreeHuman is not in WEBSITE_THEMES_LIVE')
if (!/RETIRED_FROM_PICKERS[^\n]*'free-human'/.test(read('lib/theme/site-style.ts'))) fail('free-human is not held out of the site theme picker')
if (!/id !== 'free-human'/.test(read('lib/spaces/create-wizard.ts'))) fail('the wizard look step offers free-human')
if (!/'free-human': FREE_HUMAN_SURFACE/.test(read('lib/theme/mega-surfaces.ts'))) fail('free-human has no email and Spotlight surface')
if (!/id: 'free-human'/.test(read('lib/spotlight/theme.ts'))) fail('free-human has no Spotlight preset')
if (!/free-human-\$\{niche\}/.test(read('lib/sites/kits/registry.ts'))) fail('the kit registry has no free-human-<niche> loaders')
const config = read('lib/page-editor/config.tsx')
for (const f of ['freeHumanBlocks', 'freeHumanCalendarBlocks', 'freeHumanWheelBlocks']) if (!config.includes(f)) fail(`the page editor does not register ${f}`)
process.exit(bad ? 1 : 0)
