// LIVE-1712: the Network Theme Kit's Spotlight (Link Page) has its six layouts. Measures consequences:
//   1. the `network-kit` Spotlight preset resolves a layout through the validator and the registry lists the six of the design
//      (Stack, Card wall, Story, Calendar first, Shop front, Profile) for that theme and none for the others, so no other
//      theme's output changes;
//   2. every layout id has a component in the layouts file and the shell swaps to it only when a theme carries a layout;
//   3. the layout stylesheet and every layout's markup source hold no raw colour (tokens only), and use pill buttons, the 28px
//      card radius and the accent-dot label;
//   4. the thirteen profiles each give a default layout the profile can use, wear their scheme, and their copy has no em dash, no
//      cadence promise and no invented count; a live page (no sample) carries no date, price or testimonial.
// Fails on main (lib/spotlight/layouts.ts does not exist). The rendered proof (real shell, DS frame, design beside build) is in
// /mnt/project-files/network-theme/renders/spotlight/.
// Run: node --experimental-strip-types --no-warnings --import ./scripts/probe-ts.mjs scripts/probes/network-kit-spotlight.mjs
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const layouts = await import('../../lib/spotlight/layouts.ts')
const theme = await import('../../lib/spotlight/theme.ts')
const content = await import('../../lib/spotlight/network-kit-content.ts')
const kit = await import('../../lib/theme/network-kit.ts')
const { NETWORK_KIT_LAYOUTS_CSS } = await import('../../components/spotlight/network-kit-layouts-css.ts')

// 1. Preset and registry.
const IDS = ['stack', 'card-wall', 'story', 'calendar-first', 'shop-front', 'profile'].map((i) => `network-kit:${i}`)
assert.deepEqual(layouts.spotlightLayoutsFor('network-kit').map((l) => l.id), IDS)
assert.deepEqual(layouts.spotlightLayoutsFor('midnight'), [])
const preset = theme.THEME_PRESETS.find((p) => p.id === 'network-kit')
assert.equal(theme.validateSpotlightTheme(preset.theme).layout, 'network-kit:stack')
assert.equal('layout' in theme.validateSpotlightTheme({ ...preset.theme, layout: 'midnight:stack' }), false, 'an unregistered layout is dropped')
for (const p of theme.THEME_PRESETS) if (p.id !== 'network-kit') assert.ok(!('layout' in p.theme), `${p.id} has no layout`)
assert.deepEqual(theme.validateSpotlightTheme(theme.EMPTY_THEME), theme.EMPTY_THEME, 'the default theme is unchanged')

// 2. Each layout has a component; the shell swaps only for a themed layout.
const tsx = readFileSync('components/spotlight/network-kit-layouts.tsx', 'utf8')
for (const id of IDS) assert.ok(tsx.includes(`'${id}':`), `${id} has a component`)
const shell = readFileSync('components/spotlight/spotlight-shell.tsx', 'utf8')
assert.ok(shell.includes('if (theme.layout)') && shell.includes('sample: sampleContent'), 'the shell swaps only when a theme has a layout, and never ships sample content live')

// 3. Tokens only.
const RAW = /#[0-9a-fA-F]{3,8}\b|\brgba?\(|\bhsla?\(/
assert.ok(!RAW.test(NETWORK_KIT_LAYOUTS_CSS), 'no raw colour in the layout sheet')
assert.ok(!RAW.test(tsx.replace(/\/\/.*$/gm, '')), 'no raw colour in the layout markup')
assert.ok(NETWORK_KIT_LAYOUTS_CSS.includes('var(--nk-radius-card)') && NETWORK_KIT_LAYOUTS_CSS.includes('var(--nk-radius-control)') && NETWORK_KIT_LAYOUTS_CSS.includes('.nks-eb::before'), '28px cards, pill buttons, accent-dot labels via tokens')

// 4. Profiles.
for (const p of kit.NETWORK_KIT_PROFILES) {
  const c = content.networkKitSpotlightContent(p)
  assert.equal(c.scheme, kit.networkKitProfileScheme(p))
  assert.ok(c.layouts.includes(c.defaultLayout), `${p}: the default layout is one it can use`)
  if (!c.doors.some((d) => d.key === 'gather')) assert.ok(!c.layouts.includes('calendar-first'), `${p}: no meetups, no Calendar first`)
  const copy = JSON.stringify(c)
  assert.ok(!/—|\bevery (monday|tuesday|wednesday|thursday|friday|week)\b|\ba week\b|\bweekly\b|\bunlock\b/i.test(copy), `${p}: voice`)
  assert.ok(!/\b\d+ (members|reviews|chapters)\b|4\.9/.test(copy), `${p}: no invented count`)
  const live = content.networkKitSpotlightContent(p, { sample: false })
  assert.ok(live.dates.length === 0 && live.offerings.length === 0 && live.quote === null && live.letter === null, `${p}: nothing invented on a live page`)
}
assert.equal(content.networkKitSpotlightContent('hosts').scheme, 'coral')
console.log('network-kit spotlight: ok')
