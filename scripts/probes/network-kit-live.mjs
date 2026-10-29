#!/usr/bin/env node
// LIVE-1803: a Space owner can publish the Network Theme Kit. The website editor lists NetworkKit as a theme whose
// published render replaces the house look, and the editor page loads the kit's faces so the preview draws in them.
//
// Fails when NetworkKit is not in WEBSITE_THEMES_LIVE, or the editor page does not pass NETWORK_KIT_FONT_CLASS.
// Run on main it fails: the kit was held back until its pages and profile kits shipped.
import { existsSync, readFileSync } from 'node:fs'

const r = (f) => (existsSync(f) ? readFileSync(f, 'utf8') : '')
const bad = []
const live = r('lib/sites/editor/state.ts').match(/WEBSITE_THEMES_LIVE[^=]*=\s*new Set<WebsiteTheme>\(\[([^\]]*)\]/)?.[1] ?? ''
if (!/'NetworkKit'/.test(live)) bad.push('NetworkKit is not in WEBSITE_THEMES_LIVE')
const editor = r('components/sites/editor/editor-page.tsx')
if (!/NETWORK_KIT_FONT_CLASS\}`\}/.test(editor)) bad.push('the editor page does not load the Network kit faces')

if (bad.length) {
  console.error(bad.join('\n'))
  process.exit(1)
}
console.log('network-kit-live: ok')
