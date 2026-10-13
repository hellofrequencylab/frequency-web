// LIVE-903 PROBE: the Wildheart site is composed from registered blocks and dressed by its skin alone.
// Runs the SHIPPED modules (probe-ts resolves `@/` and extensionless imports; nothing is mocked) and fails
// on the consequence, not the spelling:
//   1. the seed's page docs are the handoff's six screens (home, program, the-year, circles, retreat,
//      about), each led by a banner, every block id unique, every block type a registered block (the
//      page-editor fragments' keys), every photo a file under public/, no em dash or emoji in the copy,
//      and the Space's own rows drawn by the live blocks on every page that needs them;
//   2. the Wildheart skin re-dresses every page-section class the Frequency sheet draws, with a selector
//      that outranks that sheet's (`[data-house-site]` plus the theme attribute), so no section on a
//      Wildheart site renders in the house look; the theme CSS stays under its byte budget; no hex or rgb()
//      literal reaches the skin (tokens only, so a token round is values-only);
//   3. the composition blocks the pages use carry a layout field and generic defaults, and the site page
//      routes a Wildheart Home through its page doc (components/sites/site-page.tsx reads it).
//
//   node --experimental-strip-types --no-warnings --import ./scripts/probe-ts.mjs scripts/probes/wildheart-fidelity.mjs
import assert from 'node:assert/strict'
import { existsSync, readFileSync, readdirSync } from 'node:fs'

const seed = await import('../../scripts/seed-wildheart.mts')
const skin = await import('../../components/sites/wildheart-css.ts')
const page = await import('../../components/sites/frequency-page-css.ts')
const tokens = await import('../../lib/theme/wildheart.ts')

// The registered block names: every `Name: {` key at the top level of a blocks fragment.
const registry = new Set()
for (const f of readdirSync('components/page-editor/blocks')) {
  if (!f.endsWith('.tsx') || f.includes('.test.')) continue
  for (const m of readFileSync(`components/page-editor/blocks/${f}`, 'utf8').matchAll(/^  ([A-Z][A-Za-z0-9]*): \{/gm)) registry.add(m[1])
}
assert.ok(registry.has('PhotoHero') && registry.has('WildheartSeasonBand'), 'the registry read both a generic and a Wildheart block')

// 1. The six screens, composed from registered blocks.
const docs = seed.buildPageDocs()
assert.deepEqual(Object.keys(docs), ['home', 'program', 'the-year', 'circles', 'retreat', 'about'])
assert.deepEqual(seed.PAGES.map((p) => p.slug), Object.keys(docs), 'the nav lists exactly the six page docs')
const ids = new Set()
const used = new Map()
for (const [slug, doc] of Object.entries(docs)) {
  const blocks = doc.content
  // LIVE-904: the handoff's Retreat and About screens are one section each.
  assert.ok(blocks.length >= 1, `${slug} has a composition, not a stub`)
  assert.ok(['PhotoHero', 'WildheartMarkSplit'].includes(blocks[0].type), `${slug} leads with a banner`)
  for (const b of blocks) {
    assert.ok(registry.has(b.type), `${slug}: ${b.type} is a registered block`)
    assert.ok(!ids.has(b.props.id), `${slug}: block id ${b.props.id} is unique across the site`)
    ids.add(b.props.id)
    used.set(b.type, (used.get(b.type) ?? 0) + 1)
    const json = JSON.stringify(b.props)
    assert.ok(!/—|[\u{1F300}-\u{1FAFF}☀-⛿]/u.test(json.replace(/︎/g, '')) || /︎/.test(json), `${slug}: no em dash or emoji in ${b.type}`)
    for (const m of json.matchAll(/"\/brand\/wildheart\/[^"]+\.(?:jpg|svg)"/g)) assert.ok(existsSync(`public${JSON.parse(m[0])}`), `${slug}: ${m[0]} exists under public/`)
    assert.ok(!/<[a-z]+[^>]*>/i.test(json), `${slug}: no literal HTML in ${b.type}`)
    assert.ok(!/#[0-9a-f]{3,8}\b/i.test(json), `${slug}: no hex in ${b.type}`)
  }
}
// LIVE-904: Home draws the rows through the season band and the year journey, the Retreat screen is its hero.
for (const [slug, live] of [['home', 'WildheartYearJourney'], ['home', 'WildheartSeasonBand'], ['program', 'SpacePractices'], ['circles', 'SpaceCommunity'], ['the-year', 'WildheartSkyMap']]) {
  assert.ok(docs[slug].content.some((b) => b.type === live), `${slug} draws the Space's own rows through ${live}`)
}

// 2. The skin dresses every page-section class, outranking the Frequency sheet, tokens only, under budget.
const classes = (css) => new Set(css.match(/\.mw-[a-z0-9-]+/g))
const LAYOUT_ONLY = new Set(['.mw-cols-1', '.mw-cols-2', '.mw-cols-3', '.mw-cols-4', '.mw-grid-3', '.mw-wheel-svg', '.mw-wheel-turn', '.mw-wheel-center', '.mw-wheel-pointer', '.mw-wheel-list', '.mw-wheel-chev', '.mw-wheel-item', '.mw-wheel-name', '.mw-wheel', '.mw-hero-stack', '.mw-head-text', '.mw-head-aside', '.mw-person', '.mw-photos-item', '.mw-circle-head', '.mw-circle-meta', '.mw-progress', '.mw-progress-head', '.mw-strip-text', '.mw-strip-end', '.mw-kicker-summer', '.mw-kicker-season', '.mw-season-name', '.mw-season-photo', '.mw-module-text', '.mw-module-dates', '.mw-keydates', '.mw-text', '.mw-text-head', '.mw-parts-sec', '.mw-parts-top', '.mw-story-right', '.mw-story-solo', '.mw-story-copy', '.mw-story-photo', '.mw-year-seasons', '.mw-badge-full', '.mw-badge-forming', '.mw-chevlist-quiet', '.mw-label-strong', '.mw-icon', '.mw-freqtag', '.mw-sec-head-row', '.mw-tags'])
const own = classes(skin.WILDHEART_CSS)
const missing = [...classes(page.FREQUENCY_PAGE_CSS)].filter((c) => !own.has(c) && !LAYOUT_ONLY.has(c))
assert.deepEqual(missing, [], 'every page-section class with a look is re-dressed')
assert.ok(skin.WILDHEART_CSS.includes('[data-house-site][data-house-theme="wildheart"] .mw-sec{'), 'the section rules outrank the Frequency sheet')
const sheet = skin.WILDHEART_CSS.slice(tokens.WILDHEART_TOKENS_CSS.length)
assert.ok(!/#[0-9a-f]{3,8}\b/i.test(sheet) && !/rgba?\(/.test(sheet), 'the skin carries no colour literal')
const bytes = Buffer.byteLength(skin.WILDHEART_CSS)
assert.ok(bytes < 160 * 1024, `the theme CSS is ${bytes} bytes, under 160KB (raised from 128KB by LIVE-904, the pinned year journey and the sky map)`)

// 3. The composition blocks and the Home wiring.
const blocksSrc = readFileSync('components/page-editor/blocks/wildheart.tsx', 'utf8')
for (const name of ['WildheartOrnament', 'WildheartPhoto', 'WildheartMoonPath', 'WildheartSealCards', 'WildheartSeasonBand', 'WildheartRetreatBand', 'WildheartMarkSplit', 'WildheartMoonStrip']) {
  assert.ok(used.has(name) || name === 'WildheartPhoto', `${name} is placed on a page (or is the standalone photo frame)`)
  const at = blocksSrc.indexOf(`  ${name}: {`)
  assert.ok(at > 0 && blocksSrc.slice(at, at + 4000).includes('layout: layoutField'), `${name} carries the layout field`)
}
const sitePage = readFileSync('components/sites/site-page.tsx', 'utf8')
assert.ok(/wildHome = home && wildSite && !websitePage && readPageDoc\(space\.preferences, HOME_SLUG\) !== null/.test(sitePage), 'a Wildheart Home renders its page doc')
assert.ok(sitePage.includes('const model = home && !websitePage && !wildHome'), 'and skips the house Home when it does')
console.log(`wildheart-fidelity: ok (${Object.keys(docs).length} pages, ${ids.size} blocks, ${used.size} block types, theme CSS ${bytes} bytes)`)
