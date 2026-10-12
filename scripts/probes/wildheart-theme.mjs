// LIVE-902: the Wildheart site theme and its astrology calendar. Measures the consequences the ADR names:
//   1. `wildheart` is a registered site theme (the picker offers it) and `Wildheart` a live editor theme;
//   2. its faces load on the website alone, never from the root layout (DEPLOY-SAFETY: a root registration
//      rides every route);
//   3. the wheel module exists and sorts a year: twelve signs from Capricorn, four seasons, the festivals
//      and the moons, a Space event in its sign;
//   4. nothing applies the theme on its own (a legacy font set never reads as Wildheart);
//   5. the theme's own words are generic (no program or gender facts in a default).
// Run: node --experimental-strip-types --no-warnings --import ./scripts/probe-ts.mjs scripts/probes/wildheart-theme.mjs
import assert from 'node:assert/strict'
import { readFileSync, existsSync } from 'node:fs'

const siteStyle = await import('../../lib/theme/site-style.ts')
const state = await import('../../lib/sites/editor/state.ts')
const seed = await import('../../lib/sites/editor/seed.ts')
const wheel = await import('../../lib/theme/astrology-wheel.ts')
const theme = await import('../../lib/theme/wildheart.ts')
const symbols = await import('../../lib/theme/wildheart-symbols.ts')

// 1. Registered, selectable, live.
const def = siteStyle.SITE_THEMES.find((t) => t.id === 'wildheart')
assert.ok(def, 'wildheart is a site theme')
assert.equal(def.label, 'Wildheart')
assert.ok(siteStyle.isSiteThemeId('wildheart'))
assert.ok(state.WEBSITE_THEMES.includes('Wildheart'), 'Wildheart is an editor theme')
assert.ok(state.WEBSITE_THEMES_LIVE.has('Wildheart'), 'a published Wildheart site renders')
assert.equal(siteStyle.readSiteStyle({ siteStyle: { theme: 'wildheart' } }).theme, 'wildheart')

// 2. Fonts stay off the root layout.
const layout = readFileSync('app/layout.tsx', 'utf8')
for (const face of ['IM_Fell', 'EB_Garamond', 'Hanken_Grotesk', 'Noto_Sans_Symbols', '--font-wh-']) assert.ok(!layout.includes(face), `${face} is not registered in app/layout.tsx`)
const fonts = readFileSync('components/sites/wildheart-fonts.ts', 'utf8')
assert.ok(fonts.includes("variable: '--font-wh-fell'") && fonts.includes('next/font/local'), 'the skin loads IM Fell English itself')
assert.ok(existsSync('public/fonts/wildheart/IMFellEnglish-Regular.ttf') && existsSync('public/fonts/wildheart/IMFellEnglish-Italic.ttf'), 'the owner font files are in the repo')
assert.ok(!readFileSync('components/sites/site-chrome.tsx', 'utf8').includes('wildheart-fonts'), 'the chrome the suite renders never imports next/font')
assert.ok(theme.WILDHEART_TOKENS_CSS.includes('var(--font-wh-fell)'), 'the token block reads the site-scoped variable')

// 3. The wheel.
const year = 2027
const model = wheel.astrologyWheel(year, [...wheel.skyItems(year), ...wheel.eventItems([{ id: 'e', title: 'Spring gathering', startsAt: '2027-03-23T18:00' }])])
assert.deepEqual(model.signs.map((s) => s.id), ['capricorn', 'aquarius', 'pisces', 'aries', 'taurus', 'gemini', 'cancer', 'leo', 'virgo', 'libra', 'scorpio', 'sagittarius'])
assert.equal(model.seasons.length, 4)
assert.equal(model.items.filter((i) => i.kind === 'festival').length, 8)
assert.ok(model.items.filter((i) => i.kind === 'moon').length >= 24)
assert.equal(model.signs.find((s) => s.id === 'aries').items.some((i) => i.title === 'Spring gathering'), true)
assert.equal(wheel.phaseOf(wheel.utcDate(2027, 1, 23)), 4, 'the Wolf Moon is full')

// 4. Nothing auto-applies.
assert.equal(siteStyle.readSiteStyle({ theme: 'classic' }).theme, 'frequency')
assert.equal(seed.initialWebsiteTheme({ theme: 'wildheart' }), 'DAWN')
assert.equal(seed.initialWebsiteTheme({ siteStyle: { theme: 'wildheart' } }), 'Wildheart')

// 5. Generic words, no emoji.
const words = JSON.stringify([def.description, theme.WILDHEART_SEASONS, symbols.ZODIAC, wheel.festivals(year)])
assert.ok(!/women|sister|\bher\b|circle night|retreat/i.test(words), 'the theme ships no program or gender facts')
for (const g of Object.values(symbols.WILDHEART_GLYPHS)) assert.ok(g.endsWith('︎') && !g.includes('️'), 'text presentation on every glyph')
console.log('wildheart-theme: ok')
