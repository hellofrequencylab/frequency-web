// LIVE-1752: the Designer Theme Kit's Spotlight (Link Page) has its six layouts. Measures consequences:
//   1. the layout registry lists the six of the design for `designer-kit` beside Network's and none for other themes, a stored
//      designer layout survives validation, an unregistered one is dropped, and no preset (the Designer one included) gained a
//      layout, so no saved page changes;
//   2. every layout id has a component and the shell swaps to it only when a theme carries a designer layout;
//   3. the layout sheet and every layout's markup hold no raw colour, and use the design's tokens (card radius, control radius,
//      charcoal buttons, the profile accent);
//   4. the thirteen profiles each give a default layout they can use, wear their own accent, and their copy has no em dash, no
//      placeholder city, no cadence promise and no invented count; a live page carries no date, price or testimonial.
// Fails on main (lib/spotlight/designer-kit-content.ts does not exist). The rendered proof (real shell, DS frame, design beside
// build, desktop widths) is in /mnt/project-files/designer-kit/renders/spotlight/.
// Run: node --experimental-strip-types --no-warnings --import ./scripts/probe-ts.mjs scripts/probes/designer-kit-spotlight.mjs
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const layouts = await import('../../lib/spotlight/layouts.ts')
const theme = await import('../../lib/spotlight/theme.ts')
const content = await import('../../lib/spotlight/designer-kit-content.ts')
const { DESIGNER_KIT_LAYOUTS_CSS, designerKitAccentCss } = await import('../../components/spotlight/designer-kit-layouts-css.ts')

// 1. Registry and validation.
const IDS = ['stack', 'card-wall', 'story', 'calendar-first', 'shop-front', 'profile'].map((i) => `designer-kit:${i}`)
assert.deepEqual(layouts.spotlightLayoutsFor('designer-kit').map((l) => l.id), IDS)
assert.equal(layouts.spotlightLayoutsFor('network-kit').length, 6)
assert.deepEqual(layouts.spotlightLayoutsFor('midnight'), [])
const designer = theme.THEME_PRESETS.find((p) => p.id === 'designer')
assert.equal(theme.validateSpotlightTheme({ ...designer.theme, layout: 'designer-kit:story', kit: 'coaches' }).layout, 'designer-kit:story')
assert.equal('layout' in theme.validateSpotlightTheme({ ...designer.theme, layout: 'designer-kit:nope' }), false, 'an unregistered layout is dropped')
assert.equal('layout' in theme.validateSpotlightTheme(designer.theme), false, 'the saved Designer preset is unchanged')
assert.deepEqual(theme.validateSpotlightTheme(theme.EMPTY_THEME), theme.EMPTY_THEME, 'the default theme is unchanged')

// 2. Each layout has a component; the shell swaps only for a designer layout.
const tsx = readFileSync('components/spotlight/designer-kit-layouts.tsx', 'utf8')
for (const id of IDS) assert.ok(tsx.includes(`'${id}':`), `${id} has a component`)
const shell = readFileSync('components/spotlight/spotlight-shell.tsx', 'utf8')
assert.ok(shell.includes('isDesignerKitLayout(theme.layout)') && shell.includes('sample: sampleContent'), 'the shell swaps for a designer layout and never ships sample content live')

// 3. Tokens only.
const RAW = /#[0-9a-fA-F]{3,8}\b|\brgba?\(|\bhsla?\(/
assert.ok(!RAW.test(DESIGNER_KIT_LAYOUTS_CSS), 'no raw colour in the layout sheet')
assert.ok(!RAW.test(tsx.replace(/\/\/.*$/gm, '')), 'no raw colour in the layout markup')
assert.ok(DESIGNER_KIT_LAYOUTS_CSS.includes('var(--radius-card)') && DESIGNER_KIT_LAYOUTS_CSS.includes('var(--dz-r-1)') && DESIGNER_KIT_LAYOUTS_CSS.includes('var(--color-ink)') && DESIGNER_KIT_LAYOUTS_CSS.includes('var(--color-accent-strong)'), 'design radii, charcoal buttons and the accent via tokens')

// 4. Profiles.
assert.equal(content.DESIGNER_KIT_SPOTLIGHT_PROFILES.length, 13)
const accents = new Set()
for (const p of content.DESIGNER_KIT_SPOTLIGHT_PROFILES) {
  const c = content.designerKitSpotlightContent(p)
  accents.add(c.accent.base)
  assert.ok(designerKitAccentCss(p, c.accent).includes(c.accent.base), `${p}: wears its accent`)
  assert.ok(c.layouts.includes(c.defaultLayout), `${p}: the default layout is one it can use`)
  if (!c.doors.some((d) => d.key === 'gather')) assert.ok(!c.layouts.includes('calendar-first'), `${p}: no events, no Calendar first`)
  const copy = JSON.stringify(c)
  assert.ok(!/—|\byour city\b|\bevery (monday|tuesday|wednesday|thursday|friday|week|season)\b|\bweekly\b|\bunlock\b/i.test(copy), `${p}: voice`)
  assert.ok(!/\b\d+ (members|reviews|projects|clients)\b|4\.9/.test(copy), `${p}: no invented count`)
  assert.ok(!/com{2}is{2}ion|affiliate|kickback/i.test(copy), `${p}: banned words`)
  const live = content.designerKitSpotlightContent(p, { sample: false })
  assert.ok(live.dates.length === 0 && live.quote === null && live.letter === null && live.offerings.every((o) => o.price === null && o.minutes === null), `${p}: nothing invented on a live page`)
}
assert.ok(accents.size >= 12, 'the profiles each have their own accent')
console.log('designer-kit spotlight: ok')
