#!/usr/bin/env node
// LIVE-2499 (Daniel 2026-11-20): /for is a zig-zag, one row per door, each with its own matching photo.
import { existsSync, readFileSync } from 'node:fs'

const bad = []
const index = readFileSync('components/frequency/site/pages/funnel/frequency-for-index.tsx', 'utf8')
const css = readFileSync('app/themes/frequency/site-funnel.css', 'utf8')
const config = readFileSync('lib/marketing/funnel-config.ts', 'utf8')
const P = '[data-design="frequency"] [data-kit="site"] '

const block = index.slice(index.indexOf('const DOOR_PHOTO'), index.indexOf('\n}\n', index.indexOf('const DOOR_PHOTO')))
const rows = [...block.matchAll(/^\s+'?([a-z-]+)'?: \{ src: (?:'([^']+)'|`\$\{NICHE_PHOTO_DIR\}\/([^`]+)`)/gm)].map((m) => ({
  slug: m[1],
  src: m[2] ?? `/brand/frequency/photos/${m[3]}`,
}))
const registry = config.slice(config.indexOf('return {'))
for (const slug of ['coaches-and-healers', 'studios', 'event-hosts', 'venues', 'nonprofits', 'networks', 'local-businesses', 'clubs-and-groups', 'spiritual-community']) {
  if (!rows.some((r) => r.slug === slug)) bad.push(`no matched photo for the ${slug} row`)
  if (!registry.includes(slug)) bad.push(`${slug} left the funnel registry`)
}
for (const r of rows) if (!existsSync(`public${r.src}`)) bad.push(`${r.slug}: ${r.src} is not in public/`)
const srcs = rows.map((r) => r.src)
if (new Set(srcs).size !== srcs.length) bad.push('two door rows share a photo')
if (!/className="fo-jump"/.test(index)) bad.push('no jump links to each door')
if (!/id=\{c\.slug\} className="fo-door"/.test(index)) bad.push('door rows have no anchor ids')
if (!css.includes(`${P}.fo-door:nth-child(even) .fo-door-ph{grid-column:6/span 7}`)) bad.push('even rows do not swap the photo side')
if (!css.includes(`${P}.fo-door{display:grid;grid-template-columns:repeat(12,minmax(0,1fr))`)) bad.push('door rows are not a twelve-column split')
if (/\.fo-door:first-child\{grid-column:span 2/.test(css)) bad.push('the old tile grid is back')
if (bad.length) {
  console.error('LIVE-2499 probe failed:\n- ' + bad.join('\n- '))
  process.exit(1)
}
console.log('LIVE-2499: /for is a zig-zag of nine doors, each with its own photo')
