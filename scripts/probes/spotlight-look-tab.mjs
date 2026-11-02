// Fails on main: the Spotlight editor has no Look tab, so theme, fonts and background live only in a separate rail.
import { readFileSync } from 'node:fs'
const e = readFileSync('components/spotlight/spotlight-page-editor.tsx', 'utf8')
if (!/value: 'look'/.test(e) || !e.includes('PersonalAppearanceModule')) { console.error('editor has no Look tab'); process.exit(1) }
if (!e.includes('data-skin={resolveProfileSkin(skin)}')) { console.error('the preview does not follow the chosen theme'); process.exit(1) }
console.log('ok')
