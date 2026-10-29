// The Temple Theme Kit is published on a Space's public site like Nocturne: the website theme is in the live set.
// Fails on main (TempleKit is not in WEBSITE_THEMES_LIVE, so a publish keeps the house look).
import { readFileSync } from 'node:fs'

const src = readFileSync('lib/sites/editor/state.ts', 'utf8')
const live = /export const WEBSITE_THEMES_LIVE[^\n]*/.exec(src)?.[0] ?? ''
if (!live.includes("'TempleKit'")) {
  console.error('temple-kit live: TempleKit is not in WEBSITE_THEMES_LIVE')
  process.exit(1)
}
