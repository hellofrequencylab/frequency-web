// A synced Free Human website gives its Space page the kit's display face (LIVE-1926).
import { readFileSync } from 'node:fs'

let bad = 0
const fail = (m) => {
  console.error(`free-human space faces: ${m}`)
  bad++
}
if (!/'free-human'/.test(readFileSync('lib/theme/site-faces.ts', 'utf8'))) fail('lib/theme/site-faces.ts has no free-human faces id')
if (!/style\.theme === 'free-human' \|\| style\.theme === 'wildheart'/.test(readFileSync('lib/theme/site-style.ts', 'utf8'))) fail('spacePageSiteFaces does not return free-human')
if (!/data-space-fonts="free-human"\] \{ --space-font-display/.test(readFileSync('app/themes/frequency/space-page.css', 'utf8'))) fail('space-page.css has no free-human display rule')
process.exit(bad ? 1 : 0)
