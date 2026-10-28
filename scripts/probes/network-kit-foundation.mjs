// LIVE-1710: the Network Theme Kit is registered as a theme, and the earlier `network` theme is out of every picker. Measures consequences, not spelling:
//   1. `network-kit` resolves as a site theme, a Mega Theme and an editor theme (NetworkKit), shown as "Network" at
//      /themes/network, while the earlier `network` theme still resolves (live sites wear it) but is offered nowhere;
//   2. every scheme's text steps clear AA on paper, surface, card tint and pressed tint, the labels clear AA on the fill
//      and on its hover, and the accent edge holds 3:1 on paper;
//   3. the theme fence's module list names the kit, so a member page cannot import it;
//   4. the kit's faces load on the website alone (not the root layout, not the chrome the suite renders);
//   5. the earlier Network theme is exactly as it was (its contract entry, its scheme values, its accent rule).
// Fails on main (the module does not exist). Run: node --experimental-strip-types --no-warnings --import ./scripts/probe-ts.mjs scripts/probes/network-kit-foundation.mjs
import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'

const siteStyle = await import('../../lib/theme/site-style.ts')
const mega = await import('../../lib/theme/mega-theme.ts')
const state = await import('../../lib/sites/editor/state.ts')
const library = await import('../../lib/themes/library.ts')
const accent = await import('../../lib/spaces/accent.ts')
const kit = await import('../../lib/theme/network-kit.ts')
const classic = await import('../../lib/theme/network.ts')
const contract = JSON.parse(readFileSync('lib/sites/editor/theme-contract.json', 'utf8'))

// 1. Registered; the earlier theme resolves but is not offered.
assert.ok(siteStyle.isSiteThemeId('network-kit') && siteStyle.isSiteThemeId('network'), 'both are site themes')
assert.equal(siteStyle.readSiteStyle({ siteStyle: { theme: 'network-kit' } }).theme, 'network-kit')
assert.equal(siteStyle.SITE_THEMES.find((t) => t.id === 'network-kit')?.label, 'Network')
assert.ok(!siteStyle.SITE_THEMES.some((t) => t.id === 'network'), 'the earlier network theme is not offered in a picker')
assert.equal(siteStyle.SITE_THEME_DEFS.find((t) => t.id === 'network')?.label, 'Network', 'but it keeps its own label for the sites that wear it')
assert.ok(!library.THEME_LIBRARY.some((t) => t.id === 'network'), 'and has no library page')
assert.deepEqual(siteStyle.THEME_LOOK['network-kit'], { corners: 'soft', spacing: 'airy', header: 'bar', footer: 'full' })
assert.ok(mega.isMegaThemeId('network-kit') && mega.MEGA_THEMES.some((t) => t.id === 'network-kit' && t.editor === 'NetworkKit' && t.site === 'network-kit'))
// site-render-style imports the contract without a JSON attribute node needs, so its table is read as text.
assert.ok(readFileSync('lib/sites/site-render-style.ts', 'utf8').includes("'network-kit': 'NetworkKit'") && readFileSync('lib/sites/editor/state.ts', 'utf8').includes("'network-kit': 'NetworkKit'"), 'both editor-theme tables name it')
assert.ok(state.WEBSITE_THEMES.includes('NetworkKit'), 'an editor theme')
assert.ok(!state.WEBSITE_THEMES_LIVE.has('NetworkKit'), 'not published to a live site until its render is finished')
assert.ok(library.themeLibraryEntry('network-kit'), 'a library entry')
assert.equal(library.themePagePath('network-kit'), '/themes/network')
assert.notEqual(library.themeIdFromSlug('network-classic'), 'network')
assert.equal(library.themeIdFromSlug('network'), 'network-kit')
assert.equal(siteStyle.spacePageSiteFaces({ siteStyle: { theme: 'network-kit', synced: true } }), 'network-kit')
assert.ok(readFileSync('next.config.ts', 'utf8').includes("source: '/themes/network-kit', destination: '/themes/network'"), 'the old kit address redirects')

// 2. Contrast, measured with the app's own function.
const AA = 4.5
for (const [id, s] of Object.entries(kit.NETWORK_KIT_SCHEMES)) {
  for (const fg of [s.ink, s.ink2, s.muted, s.subtle]) for (const bg of [s.paper, s.white, s.card, s.card2]) assert.ok(accent.contrastRatio(fg, bg) >= AA, `${id}: ${fg} on ${bg}`)
  for (const bg of [s.paper, s.white, s.card, s.accentBg]) assert.ok(accent.contrastRatio(s.accentText, bg) >= AA, `${id}: accent text on ${bg}`)
  assert.ok(accent.contrastRatio(s.onAccent, s.accent) >= AA && accent.contrastRatio(s.onAccent, s.accentHover) >= AA, `${id}: label on the fill and its hover`)
  const edge = accent.contrastRatio(s.accent, s.paper) >= 3 ? s.accent : s.ink
  assert.ok(kit.NETWORK_KIT_TOKENS_CSS.includes(`--nk-accent-edge:${edge}`) && accent.contrastRatio(edge, s.paper) >= 3, `${id}: the accent edge holds 3:1`)
}
assert.equal(Object.keys(kit.NETWORK_KIT_PROFILE_SCHEME).length, 13)

// 3. The fence names the kit, in both the component sheets and the lib/theme modules.
const fence = readFileSync('app/(main)/no-site-theme-in-member-area.test.ts', 'utf8')
const source = fence.match(/const SITE_THEME_MODULES =\s*\n?\s*\/(.+)\/\s*\n/)?.[1]
assert.ok(source, 'the fence regex is readable')
const modules = new RegExp(source)
assert.ok(modules.test("from '@/components/sites/network-kit-css'") && modules.test("from '@/lib/theme/network-kit'"), 'the fence lists the Network Theme Kit')

// 4. Faces: the website root only.
const fonts = readFileSync('components/sites/network-kit-fonts.ts', 'utf8')
assert.ok(fonts.includes("'--font-nk-bricolage'") && fonts.includes("'--font-nk-caveat'"), 'the kit loads its own faces')
assert.ok(!readFileSync('app/layout.tsx', 'utf8').includes('nk-'), 'no kit face on the root layout')
assert.ok(!readFileSync('components/sites/site-chrome.tsx', 'utf8').includes('network-kit-fonts'), 'the chrome the suite renders never imports next/font')

// 5. The earlier Network theme is as it was.
assert.equal(contract.themes.Network['--th-muted'], '#666D72')
assert.equal(contract.themes.Network['--th-season'], '#22303A')
assert.equal(contract.themes.Network['--th-clip-lg'], 'inset(0 round 36px)')
assert.equal(classic.NETWORK_SCHEMES.marigold.subtle, '#666D72')
assert.equal(classic.networkAccentVars(null)['--color-primary'], '#E9B949')
assert.ok(existsSync('components/sites/network-css.ts') && existsSync('lib/theme/network.ts'))
assert.ok(contract.themes.NetworkKit && contract.themes.NetworkKit['--th-accent'] === '#E9B949' && contract.themes.NetworkKit['--th-muted'] === kit.NETWORK_KIT_SCHEMES.marigold.subtle, 'the kit has its own contract entry')
console.log('network-kit foundation: ok')
