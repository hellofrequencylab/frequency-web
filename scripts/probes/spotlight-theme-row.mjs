// LIVE-2274: a Space with no website can pick any Spotlight-ready theme from the Spotlight console. The console shows the
// theme row, and the action goes through the one theme apply and refuses a theme with no Spotlight looks.
import { readFileSync } from 'node:fs'
const act = readFileSync('app/(main)/spaces/[slug]/manage/spotlight/actions.ts', 'utf8')
const ed = readFileSync('components/spotlight/space-spotlight-editor.tsx', 'utf8')
const page = readFileSync('app/(main)/spaces/[slug]/manage/spotlight/page.tsx', 'utf8')
const checks = [
  ['the action applies the theme through applyMegaTheme', /export async function setSpaceSpotlightTheme/.test(act) && /applyMegaTheme\(managed\.space\.id, theme\)/.test(act)],
  ['it refuses a theme with no Spotlight looks', /spaceLooksFor\(theme\)\.length === 0/.test(act)],
  ['the editor draws a Theme row and calls the action', /aria-label="Theme"/.test(ed) && /setSpaceSpotlightTheme\(slug, next\)/.test(ed)],
  ['the page offers the theme row whether or not the theme has looks', /themes=\{\{ options: PREVIEW_KITS/.test(page)],
]
let bad = 0
for (const [l, ok] of checks) { console.log(`${ok ? 'ok  ' : 'FAIL'} ${l}`); if (!ok) bad++ }
process.exit(bad ? 1 : 0)
