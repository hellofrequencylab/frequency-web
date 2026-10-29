// The Temple Theme Kit's Spotlight pass: the `temple-kit` preset wears the kit's six layouts of the design's Spotlight Layouts
// board (Stack, Card wall, Story, Calendar first, Shop front, Profile), the shell draws them, the thirteen profiles differ by
// accent only, the layout sheet holds no raw colour and no shadow-* name, and the Library lists Spotlight as ready.
// Fails on main (no temple-kit layouts, the preset carries no layout, the Library lists Spotlight as soon).
// Run: node --experimental-strip-types --no-warnings --import ./scripts/probe-ts.mjs scripts/probes/temple-kit-spotlight.mjs
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const layouts = await import('../../lib/spotlight/layouts.ts')
const theme = await import('../../lib/spotlight/theme.ts')
const content = await import('../../lib/spotlight/temple-kit-content.ts')
const kit = await import('../../lib/theme/temple-kit.ts')
const { TEMPLE_KIT_LAYOUTS_CSS } = await import('../../components/spotlight/temple-kit-layouts-css.ts')

const IDS = ['stack', 'card-wall', 'story', 'calendar-first', 'shop-front', 'profile'].map((i) => `temple-kit:${i}`)
assert.deepEqual(layouts.spotlightLayoutsFor('temple-kit').map((l) => l.id), IDS)
const preset = theme.THEME_PRESETS.find((p) => p.id === 'temple-kit')
assert.equal(theme.validateSpotlightTheme(preset.theme).layout, 'temple-kit:stack')

const tsx = readFileSync('components/spotlight/temple-kit-layouts.tsx', 'utf8')
for (const id of IDS) assert.ok(tsx.includes(`'${id}':`), `${id} has a component`)
assert.ok(readFileSync('components/spotlight/spotlight-shell.tsx', 'utf8').includes('isTempleKitLayout(theme.layout)'), 'the shell draws the Temple layouts')

const RAW = /#[0-9a-fA-F]{3,8}\b|\brgba?\(|\bhsla?\(/
assert.ok(!RAW.test(TEMPLE_KIT_LAYOUTS_CSS), 'no raw colour in the layout sheet')
assert.ok(!RAW.test(tsx.replace(/\/\/.*$/gm, '')), 'no raw colour in the layout markup')
assert.ok(!/var\(--shadow-/.test(TEMPLE_KIT_LAYOUTS_CSS), 'depth tokens only')

const base = JSON.stringify({ ...content.templeKitSpotlightContent('general'), profile: '' })
for (const p of Object.keys(kit.TEMPLE_KIT_PROFILES)) {
  const c = content.templeKitSpotlightContent(p)
  assert.equal(c.profile, p)
  assert.equal(JSON.stringify({ ...c, profile: '' }), base, `${p}: accent only`)
  assert.ok(!/—|\bevery (monday|tuesday|wednesday|thursday|friday|week)\b|\bweekly\b|\bunlock\b|\bfree\b/i.test(JSON.stringify(c)), `${p}: voice`)
  const live = content.templeKitSpotlightContent(p, { sample: false })
  assert.ok(live.dates.length === 0 && live.offerings.length === 0 && live.quote === null && live.letter === null, `${p}: nothing invented on a live page`)
}
assert.ok(/id: 'temple-kit',[\s\S]*?surfaces\('ready', 'ready'\)/.test(readFileSync('lib/themes/library.ts', 'utf8')), 'the Library lists Spotlight as ready')
console.log('temple-kit spotlight: ok')
