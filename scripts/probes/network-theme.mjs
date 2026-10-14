// LIVE-906: the Network site theme and The Group's Collective. Measures the consequences ADR-1736 names:
//   1. `network` is a registered site theme (the picker offers it) and `Network` a live editor theme;
//   2. its faces load on the website alone, never from the root layout (DEPLOY-SAFETY);
//   3. every scheme reads at AA, the scheme follows the owner's accent, and the token block is scoped, leaves
//      the accent to the Space and zeroes motion under reduced motion;
//   4. the Network section family is registered on the website surface and plans as its own full-bleed band;
//   5. the seed builds what the brief asks: a Collective on the Network theme, five chapter member Spaces,
//      the tiers, the studio offerings, the merch, Feel Good Friday weekly 9:00–10:10 AM, the PitchFest Party,
//      and scripts/seed-the-group.sql is the seed's current output.
// Run: node --experimental-strip-types --no-warnings --import ./scripts/probe-ts.mjs scripts/probes/network-theme.mjs
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const siteStyle = await import('../../lib/theme/site-style.ts')
const state = await import('../../lib/sites/editor/state.ts')
const editorSeed = await import('../../lib/sites/editor/seed.ts')
const theme = await import('../../lib/theme/network.ts')
const accent = await import('../../lib/spaces/accent.ts')
const plan = await import('../../lib/sites/menswork-page.ts')
const seed = await import('../seed-the-group.mts')

// 1. Registered, selectable, live.
const def = siteStyle.SITE_THEMES.find((t) => t.id === 'network')
assert.ok(def, 'network is a site theme')
assert.equal(def.label, 'Network')
assert.ok(state.WEBSITE_THEMES.includes('Network') && state.WEBSITE_THEMES_LIVE.has('Network'), 'Network is a live editor theme')
assert.equal(editorSeed.initialWebsiteTheme({ siteStyle: { theme: 'network' } }), 'Network')
assert.equal(siteStyle.readSiteStyle({ theme: 'modern' }).theme, 'frequency', 'nothing applies the theme on its own')

// 2. Fonts stay off the root layout.
const layout = readFileSync('app/layout.tsx', 'utf8')
for (const face of ['Bricolage_Grotesque', 'Instrument_Serif', '--font-nw-']) assert.ok(!layout.includes(face), `${face} is not registered in app/layout.tsx`)
assert.ok(!readFileSync('components/sites/site-chrome.tsx', 'utf8').includes('network-fonts'), 'the chrome the suite renders never imports next/font')
assert.ok(theme.NETWORK_TOKENS_CSS.includes('var(--font-nw-bricolage)'), 'the token block reads the site-scoped variable')

// 3. AA in every scheme; the scheme follows the accent.
for (const id of theme.NETWORK_SCHEME_ORDER) {
  const s = theme.NETWORK_SCHEMES[id]
  for (const fg of [s.ink, s.muted, s.subtle, s.accentText]) for (const bg of [s.paper, s.surface, s.fill, theme.NETWORK_SAND.sand]) assert.ok(accent.contrastRatio(fg, bg) >= 4.5, `${id}: ${fg} on ${bg}`)
  assert.ok(accent.contrastRatio(s.onAccent, s.accent) >= 4.5, `${id}: label on accent`)
  assert.equal(theme.networkScheme(s.accent), id)
}
assert.equal(theme.networkScheme(null), 'marigold', 'Marigold is the default')
const marigold = theme.networkAccentVars(null)
assert.equal(marigold['--color-primary'], '#E9B949')
assert.equal(marigold['--color-text-on-primary'], '#1F3440', 'ink on the marigold accent')
const custom = theme.networkAccentVars('#7A3FB0')
assert.ok(accent.contrastRatio(custom['--color-text-on-primary'], '#7A3FB0') >= 4.5, 'any other hex keeps a readable label')
assert.match(theme.NETWORK_TOKENS_CSS, /^\s*\[data-house-theme="network"\]\{/, 'the token block is scoped to the Network site root')
for (const id of ['ocean', 'lagoon', 'coral']) assert.ok(theme.NETWORK_TOKENS_CSS.includes(`[data-scheme="${id}"]`), `${id} has its block`)
assert.ok(!/--color-primary[a-z-]*:/.test(theme.NETWORK_TOKENS_CSS), 'the accent stays the Space\'s (AccentScope)')
assert.match(theme.NETWORK_TOKENS_CSS, /prefers-reduced-motion:reduce\)\{\[data-house-theme="network"\]\{--nw-dur-fast:0ms/, 'reduced motion zeroes the motion tokens')

// 4. The section family.
const config = readFileSync('lib/page-editor/config.tsx', 'utf8')
assert.ok(config.includes('...networkComponents') && config.includes('NETWORK_CATEGORY_COMPONENTS'), 'the Network blocks are registered')
assert.ok(readFileSync('lib/page-editor/palette-scope.ts', 'utf8').includes("'network'"), 'website pages offer them')
assert.deepEqual(plan.planMensworkPage([{ type: 'NetworkHero', props: {} }, { type: 'NetworkEvents', props: {} }]).map((p) => p.kind), ['own', 'own'])

// 4b. The Network blocks are Server Components and never call a client function. Every name they import from a
// 'use client' module must be a component (PascalCase) or a type: a plain function from one is a client
// reference on the server, and calling it threw on every render of the published Network home
// (wallClockInstant, LIVE-906).
const { existsSync } = await import('node:fs')
for (const file of ['network.tsx']) {
  const src = readFileSync(`components/page-editor/blocks/${file}`, 'utf8')
  for (const [, names, spec] of src.matchAll(/^import\s+(?!type\b)\{([^}]*)\}\s+from\s+'(@\/[^']+)'/gm)) {
    const base = spec.replace(/^@\//, '')
    const path = ['.tsx', '.ts'].map((ext) => base + ext).find((p) => existsSync(p))
    if (!path || !/^\s*['"]use client['"]/.test(readFileSync(path, 'utf8'))) continue
    for (const name of names.split(',').map((n) => n.trim().split(/\s+as\s+/)[0]).filter(Boolean)) {
      // A field config (`...Field`) may come from a client module when it is only ever spread: the spread of a
      // client reference reads as nothing on the server, and the editor gets the real control.
      const spreadOnly = /Field$/.test(name) && [...src.matchAll(new RegExp(`(\\.\\.\\.)?\\b${name}\\b`, 'g'))].slice(1).every((m) => m[1])
      assert.ok(/^type\s/.test(name) || /^[A-Z]/.test(name) || spreadOnly, `${file} imports ${name} from the client module ${spec}; move it to a shared module`)
    }
  }
}
const clock = await import('../../lib/time/wall-clock.ts')
assert.equal(clock.countdownParts(Date.UTC(2026, 9, 16, 16) + 3_723_000, Date.UTC(2026, 9, 16, 16)).join(':'), '0:1:2:3')
assert.equal(new Date(clock.wallClockInstant('2026-10-16T09:00', 'America/Los_Angeles')).toISOString(), '2026-10-16T16:00:00.000Z', '9 AM Pacific is 16:00 UTC in October')

// 4c. A Network site's admin is the Website builder alone (no Executive Overview or Yearly Calendar), drawn as
// its own chip apart from the menu (owner ask 2026-10-14).
const adminBar = readFileSync('components/sites/site-admin-bar.tsx', 'utf8')
assert.match(adminBar, /if \(theme === 'network'\) return \{ menu: hrefs\.editor \? \[\{ href: hrefs\.editor, label: 'Website builder'[^\]]*\] : \[\]/, 'Network admin lists only the Website builder')
assert.ok(readFileSync('components/sites/site-page.tsx', 'utf8').includes("netSite ? siteAdminLinks(origin, space.slug, siteBase, null, 'network')"), 'the site page asks for the Network admin')
assert.ok(readFileSync('components/sites/network-css.ts', 'utf8').includes('.hs-nav .hs-nav-admin{display:flex'), 'the admin link is its own chip')

// 5. The seed.
const prefs = seed.buildPreferences()
assert.equal(prefs.siteStyle.theme, 'network')
assert.equal(seed.CHAPTERS.length, 5, 'five chapter member Spaces (the Collective plan includes five)')
assert.deepEqual(seed.TIERS.map((t) => [t.name, t.priceCents]), [['Free', 0], ['Basic', 1999], ['Premium', 2999]])
assert.deepEqual(seed.STUDIO.map((s) => [s.title, s.price]), [['Space Rental', 200], ['Recording Only', 350], ['Recording + Basic', 500]])
assert.deepEqual(seed.MERCH.map((m) => m.priceCents), [3000, 3000, 4000, 2600])
const events = seed.buildEvents()
const fgf = events.find((e) => e.title === 'Feel Good Friday')
assert.ok(fgf && fgf.rule === 'FREQ=WEEKLY;BYDAY=FR' && fgf.start === '09:00' && fgf.end === '10:10', 'Feel Good Friday is weekly on Fridays, 9:00 to 10:10 AM')
const party = events.find((e) => /PitchFest/i.test(e.title))
assert.ok(party && party.date === '2026-10-21' && party.start === '17:30', 'the PitchFest Party is Oct 21 at 5:30 PM')
for (const c of seed.CHAPTERS) assert.ok(events.some((e) => e.chapter === c.key), `${c.short} hosts its own meetings`)
assert.ok(!JSON.stringify(prefs).includes('—'), 'no em dash in the copy')
assert.equal(readFileSync('scripts/seed-the-group.sql', 'utf8'), seed.renderSql(), 'scripts/seed-the-group.sql is the seed’s current output (node --experimental-strip-types scripts/seed-the-group.mts --sql)')
console.log(`network-theme: ok (${events.length} event rows, ${seed.CHAPTERS.length} chapters)`)
