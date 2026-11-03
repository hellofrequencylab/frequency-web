#!/usr/bin/env node
// LIVE-2058 / LIVE-2059: New World is offered in the pickers (`picker`) and is the theme every new Space starts in (`default`).
// Reads the source, so it measures the shipped code paths rather than a flag:
//   picker   New World is not held back from the pickers, and /themes/new-world exists.
//   default  createSpace dresses a Space with no explicit pick in NEW_SPACE_THEME = 'new-world' (a write at birth, never a read
//            fallback, so existing Spaces keep their look), the Space page fills the Tide accent, and New World email has its
//            own flat surface.
import { existsSync, readFileSync } from 'node:fs'

const mode = process.argv[2]
const read = (p) => (existsSync(p) ? readFileSync(p, 'utf8') : '')
const bad = []

if (mode === 'picker') {
  const style = read('lib/theme/site-style.ts')
  const retired = style.match(/RETIRED_FROM_PICKERS[^=]*=\s*new Set\(\[([^\]]*)\]\)/)
  if (!retired) bad.push('RETIRED_FROM_PICKERS not found in lib/theme/site-style.ts')
  else if (/'new-world'/.test(retired[1])) bad.push('new-world is still held back from the pickers')
  if (!existsSync('app/(marketing)/themes/new-world/page.tsx')) bad.push('missing /themes/new-world')
} else if (mode === 'default') {
  const mega = read('lib/theme/mega-theme.ts')
  if (!/export const NEW_SPACE_THEME: MegaThemeId = 'new-world'/.test(mega)) bad.push('NEW_SPACE_THEME is not new-world')
  const provision = read('lib/spaces/provision.ts')
  if (!/applyMegaTheme\(spaceId, NEW_SPACE_THEME\)/.test(provision)) bad.push('createSpace does not start an unpicked Space in NEW_SPACE_THEME')
  const style = read('lib/theme/site-style.ts')
  if (!/style\.theme === 'new-world'\) return NEW_WORLD_ACCENTS\.tide\.accent/.test(style)) bad.push('a New World Space page does not fill the Tide accent')
  if (!/const DEFAULT_SITE_THEME: SiteThemeId = 'frequency'/.test(style)) bad.push('the read fallback moved: existing Spaces with no saved theme would be restyled')
  if (!/'new-world': NEW_WORLD_SURFACE/.test(read('lib/theme/mega-surfaces.ts'))) bad.push('New World email has no surface')
} else {
  bad.push('usage: new-world-theme.mjs picker|default')
}

if (bad.length) {
  console.error(bad.join('\n'))
  process.exit(1)
}
console.log(`new-world-theme ${mode}: ok`)
