// LIVE-904 PROBE: the Wildheart site is the design handoff's website template (2026-10-13), top to bottom,
// on every page, with every word of it. Runs the SHIPPED modules (probe-ts resolves `@/` and
// extensionless imports; nothing is mocked) and fails on the consequence, not the spelling:
//   1. the seed's six page docs follow the handoff's screens section by section: Home (hero, the bridge,
//      the pinned year journey, the four parts, the member path, the ornament, this season, Circle Night
//      with its five beats, the four pillars, the retreat band, the closing row) plus the phone's Home
//      (the short hero, Tonight's sky, Your first night, the retreat), The program (hero, the foundation's
//      head, the weeks from the Space's own journey, the practice and the care), The year (hero, the sky
//      map centered at 440, the twelve module cards), Circles (hero, the four circle cards from the rows,
//      the invitation), Retreat (the hero), About (the mark split); every block registered, every id
//      unique, no em dash, no hex, no literal HTML;
//   2. every string of the handoff template (scripts/probes/wildheart-content-checklist.json, extracted
//      by scripts/probes/wildheart-content.mjs) is carried by the seed's words, the Space's own rows the
//      seed writes, or the theme's own labels, except the template's named placeholders and the few lines
//      the page composes from a date at render time (those the render harness holds,
//      test/wildheart-site.render.test.tsx, which renders the six pages; a probe cannot render JSX,
//      LIVE-475);
//   3. the chrome is the handoff's: a fixed header with a 116px spacer and the date line that folds, the
//      LogoMark horizontal at 46px, the Admin chip named Vision and Calendar, the account pill, the
//      1216px column with 48px gutters, the retreat band bleeding to the window, the footer's columns,
//      ornament, copyright suffix and closing line from the Space's own footer words;
//   4. the skin stays tokens-only and under 160KB; the two interactive pieces are client islands loaded
//      from the Wildheart blocks alone, never from the app shell.
//
//   node --experimental-strip-types --no-warnings --import ./scripts/probe-ts.mjs scripts/probes/wildheart-fidelity-v2.mjs
import assert from 'node:assert/strict'
import { existsSync, readFileSync, readdirSync } from 'node:fs'

const seed = await import('../../scripts/seed-wildheart.mts')
const skin = await import('../../components/sites/wildheart-css.ts')
const tokens = await import('../../lib/theme/wildheart.ts')
const footer = await import('../../lib/sites/site-footer.ts')

const registry = new Set()
for (const f of readdirSync('components/page-editor/blocks')) {
  if (!f.endsWith('.tsx') || f.includes('.test.')) continue
  for (const m of readFileSync(`components/page-editor/blocks/${f}`, 'utf8').matchAll(/^  ([A-Z][A-Za-z0-9]*): \{/gm)) registry.add(m[1])
}

// 1. The six screens, section by section.
const docs = seed.buildPageDocs()
assert.deepEqual(Object.keys(docs), ['home', 'program', 'the-year', 'circles', 'retreat', 'about'])
const visOf = (b) => (b.props.layout && typeof b.props.layout === 'object' ? b.props.layout.visibility : undefined) ?? 'all'
const ids = new Set()
let blocks = 0
for (const [slug, doc] of Object.entries(docs)) {
  for (const b of doc.content) {
    blocks++
    assert.ok(registry.has(b.type), `${slug}: ${b.type} is a registered block`)
    assert.ok(!ids.has(b.props.id), `${slug}: block id ${b.props.id} is unique across the site`)
    ids.add(b.props.id)
    const json = JSON.stringify(b.props)
    assert.ok(!/—/.test(json), `${slug}: no em dash in ${b.type}`)
    assert.ok(!/<[a-z]+[^>]*>/i.test(json), `${slug}: no literal HTML in ${b.type}`)
    assert.ok(!/#[0-9a-f]{3,8}\b/i.test(json), `${slug}: no hex in ${b.type}`)
    for (const m of json.matchAll(/"\/brand\/wildheart\/[^"]+\.(?:jpg|svg)"/g)) assert.ok(existsSync(`public${JSON.parse(m[0])}`), `${slug}: ${m[0]} exists under public/`)
  }
}
const order = (slug, vis) => docs[slug].content.filter((b) => visOf(b) === vis || visOf(b) === 'all').map((b) => `${b.type}${b.type === 'WildheartOrnament' ? `:${b.props.variant}` : ''}${b.props.wheel ? `:${b.props.wheel}` : ''}${b.type === 'SpaceCommunity' ? `:${b.props.layout}` : ''}`)
assert.deepEqual(order('home', 'desktop'), ['PhotoHero', 'WildheartOrnament:bridge', 'WildheartYearJourney', 'CardGrid', 'WildheartMoonPath', 'WildheartOrnament:phases', 'WildheartSeasonBand', 'Zigzag', 'WildheartSealCards', 'WildheartRetreatBand', 'AccentBeat'], 'Home follows the handoff top to bottom')
assert.deepEqual(order('home', 'mobile'), ['PhotoHero', 'WildheartSkyMap:compact', 'WildheartFirstNight', 'WildheartRetreatBand'], 'the phone Home follows the handoff')
assert.deepEqual(order('program', 'desktop'), ['PhotoHero', 'WildheartMoonStrip', 'SpacePractices', 'CardGrid'])
assert.deepEqual(order('the-year', 'desktop'), ['PhotoHero', 'WildheartSkyMap:centered', 'WildheartModules'])
assert.deepEqual(order('circles', 'desktop'), ['PhotoHero', 'SpaceCommunity:grid', 'AccentBeat'])
assert.deepEqual(order('retreat', 'desktop'), ['PhotoHero'])
assert.deepEqual(order('about', 'desktop'), ['WildheartMarkSplit'])
const home = docs.home.content
const journey = home.find((b) => b.type === 'WildheartYearJourney')
assert.ok(journey.props.programStops.length >= 4 && journey.props.modules.length === 12, 'the year journey carries the program stops and the twelve modules')
assert.equal(home.find((b) => b.type === 'Zigzag').props.items.length, 5, 'Circle Night carries the five beats')
assert.equal(home.find((b) => b.type === 'WildheartSealCards').props.cards.length, 4, 'the four pillars')
assert.equal(docs['the-year'].content.find((b) => b.type === 'WildheartModules').props.modules.length, 12, 'twelve module cards')
assert.equal(docs.circles.content.find((b) => b.type === 'SpaceCommunity').props.seatNoun, 'women')
assert.equal(docs.program.content.find((b) => b.type === 'SpacePractices').props.only, 'foundation', 'the program page lists the foundation journey alone')

// The rows the seed writes carry the handoff's fields: four circles, the enrollment, the festivals with
// their notes, the moons by name, the weeks as "Week n · Theme".
assert.equal(seed.CIRCLES_MORE.length, 3)
assert.deepEqual([seed.CIRCLE, ...seed.CIRCLES_MORE].map((c) => c.name), ['Primary Circle', 'Eastside', 'Foothills', 'Riverside'])
const events = seed.buildEvents()
assert.ok(events.some((e) => e.title === 'Enrollment opens') && events.some((e) => e.title === 'Enrollment closes'))
assert.ok(events.some((e) => e.title === "Hunter's Moon" && e.description.startsWith('Full moon esbat · release')))
assert.ok(events.some((e) => e.title === 'Samhain' && e.description.startsWith('Honour the dead · the veil is thin')))
assert.ok(events.some((e) => e.title === 'Week 1 · Arriving'))
assert.ok(events.some((e) => e.title === 'Lughnasadh'))
const prefs = seed.buildPreferences()
const foot = footer.readSiteFooter(prefs)
assert.deepEqual(foot.columns.map((c) => c.title), ['The program', 'Circles', 'On Frequency'])
assert.equal(foot.suffix, 'A program on Frequency')
assert.ok(foot.line.startsWith('Women-only · Invitation, never instruction'))
assert.equal(foot.note, 'Practice and community, not therapy or crisis care.')
assert.ok(JSON.stringify(prefs).includes('"siteFooter"'), 'the seed writes the footer words')
const sql = readFileSync('scripts/seed-wildheart.sql', 'utf8')
for (const c of seed.CIRCLES_MORE) assert.ok(sql.includes(`'${c.slug}'`), `the SQL seeds ${c.name}`)
assert.ok(sql.includes('"siteFooter"'), 'the SQL carries the footer words')

// 2. Every handoff string, in the seed, the rows or the theme's own labels.
const checklist = JSON.parse(readFileSync('scripts/probes/wildheart-content-checklist.json', 'utf8'))
const walk = (v, out) => { if (typeof v === 'string') out.push(v); else if (Array.isArray(v)) v.forEach((x) => walk(x, out)); else if (v && typeof v === 'object') Object.values(v).forEach((x) => walk(x, out)); return out }
const corpus = [
  ...walk(prefs, []),
  ...walk(events, []),
  ...walk([seed.CIRCLE, ...seed.CIRCLES_MORE], []),
  ...['components/page-editor/blocks/wildheart.tsx', 'components/sites/wildheart-year-journey.tsx', 'components/sites/wildheart-sky-map.tsx', 'components/sites/wildheart-first-night.tsx', 'components/sites/wildheart-now-line.tsx', 'components/sites/site-chrome.tsx', 'components/sites/house-menu.tsx', 'components/sites/house-header.tsx', 'components/sites/site-member-badge.tsx', 'components/sites/site-admin-bar.tsx', 'components/sites/menswork-page.tsx', 'lib/theme/astrology-wheel.ts', 'lib/theme/wildheart-symbols.ts', 'lib/theme/wildheart.ts', 'lib/theme/wildheart-seasons.ts'].map((f) => readFileSync(f, 'utf8')),
].join('\n').replace(/\\'/g, "'").replace(/\\n/g, '\n')
/** Lines the page composes from a date or a row at render time; the render harness holds each of them. */
const COMPOSED = new Set(['Wildheart home', '© 2026 Wildheart · A program on Frequency', 'Yes, no, and asking. Two Circle Nights, a daily practice focus and an optional full moon ritual.', '✦︎ Chosen', 'Now · until Oct 22', 'Tuesday · 6:00 – 7:30 PM · every circle on the same module.', 'women · host', 'Next Circle Night', 'Jan 5', 'Jan 12', 'Jan 19', 'Jan 26', 'Feb 2', 'Feb 9', 'Feb 16', 'Feb 23', 'The sun enters', 'Wolf Moon', 'Cold Moon', 'Calling', 'Partners', 'Full moon', 'New moon'])
const except = new Set(checklist.exceptions.map((e) => e.text))
const missing = []
for (const [screen, list] of Object.entries(checklist.screens)) for (const s of list) if (!except.has(s) && !COMPOSED.has(s) && !corpus.includes(s)) missing.push(`${screen}: ${s}`)
assert.deepEqual(missing, [], 'every handoff string is carried by the seed, the rows or the theme')
const total = Object.values(checklist.screens).reduce((n, l) => n + l.length, 0)
assert.ok(total >= 350, `the checklist is the handoff's (${total} strings)`)

// 3. The chrome.
const chrome = readFileSync('components/sites/site-chrome.tsx', 'utf8')
assert.ok(chrome.includes('className="wh-fixed"') && chrome.includes('className="wh-fixed-spacer"'), 'a fixed header with its spacer')
assert.ok(chrome.includes('<WhLogoMark name={brandName} lockup="horizontal" size={46}'), 'the LogoMark horizontal at 46px in the header')
assert.ok(chrome.includes('<WhLogoMark name={brandName} size={170}'), 'the LogoMark at 170px in the footer')
assert.ok(chrome.includes('footer.columns.map') && chrome.includes('footer.suffix') && chrome.includes('footer.line') && chrome.includes('footer.note'), 'the footer draws the Space\'s own columns, suffix, line and note')
const css = skin.WILDHEART_CSS
const sheet = css.slice(tokens.WILDHEART_TOKENS_CSS.length)
assert.ok(css.includes('--wh-header-total:116px') && sheet.includes('.wh-fixed{position:fixed') && sheet.includes('.wh-fixed-spacer{height:var(--wh-header-total)'), 'the 116px spacer under a fixed bar')
assert.ok(sheet.includes('.hs-season{animation:wh-fold linear both;animation-timeline:scroll(root);animation-range:40px 41px}'), 'the date line folds after 40px of scroll')
assert.ok(css.includes('--wh-col:1216px') && sheet.includes('.mw-wrap{max-width:var(--wh-col);padding-left:var(--wh-col-pad);padding-right:var(--wh-col-pad)}'), 'the 1216px column with 48px gutters')
assert.ok(sheet.includes('.wh-retreat{display:block;border-radius:0;margin:0;padding:96px max(var(--wh-col-pad),calc(50vw - 560px))'), 'the retreat band pads back to the column from the window')
assert.ok(sheet.includes('.hs-footer-top[data-columns]{grid-template-columns:minmax(0,2fr) repeat(3,minmax(0,1fr))}'), 'the footer\'s three columns')
assert.ok(sheet.includes('.hs-nav .hs-nav-admin{') && sheet.includes('background:var(--wh-gradient-nightshade)'), 'the nightshade admin chip')
assert.ok(sheet.includes('.hs-member-pill{') && sheet.includes('.hs-member-avatar{'), 'the account pill')
assert.ok(sheet.includes('.hs-nav a{') && sheet.includes('font-size:12px') && sheet.includes('.hs-nav a[aria-current="page"]::after{opacity:1}'), 'the 12px nav with the active underline')
const sitePage = readFileSync('components/sites/site-page.tsx', 'utf8')
assert.ok(sitePage.includes("siteAdminLinks(origin, space.slug, siteBase, null, wildSite ? 'wildheart' : undefined)"), 'the site names the admin pages Vision and Calendar on this theme')
assert.ok(sitePage.includes('footer={skin ? siteFooterFor(readSiteFooter(space.preferences), siteLinks, origin) : null}'), 'the site reads the footer words')
const adminBar = readFileSync('components/sites/site-admin-bar.tsx', 'utf8')
assert.ok(adminBar.includes("wild ? { label: 'Vision' }") && adminBar.includes("wild ? { label: 'Calendar' }"))

// 4. Tokens only, under budget, islands only on Wildheart pages.
assert.ok(!/#[0-9a-f]{3,8}\b/i.test(sheet) && !/rgba?\(/.test(sheet), 'the skin carries no colour literal')
const bytes = Buffer.byteLength(css)
assert.ok(bytes < 160 * 1024, `the theme CSS is ${bytes} bytes, under 160KB`)
const shell = readFileSync('components/layout/app-shell.tsx', 'utf8')
assert.ok(!/wildheart/i.test(shell), 'nothing Wildheart is reachable from the app shell')
for (const island of ['components/sites/wildheart-year-journey.tsx', 'components/sites/wildheart-sky-map.tsx', 'components/sites/wildheart-first-night.tsx']) {
  assert.ok(readFileSync(island, 'utf8').startsWith("'use client'"), `${island} is a client island`)
}
const blocksSrc = readFileSync('components/page-editor/blocks/wildheart.tsx', 'utf8')
assert.ok(blocksSrc.includes("from '@/components/sites/wildheart-year-journey'") && blocksSrc.includes("from '@/components/sites/wildheart-sky-map'"), 'the islands load from the Wildheart blocks alone')
for (const name of ['WildheartModules', 'WildheartFirstNight']) {
  const at = blocksSrc.indexOf(`  ${name}: {`)
  assert.ok(at > 0 && blocksSrc.slice(at, at + 3000).includes('layout: layoutField'), `${name} is registered with the layout field`)
}
console.log(`wildheart-fidelity-v2: ok (6 pages, ${blocks} blocks, ${total} handoff strings, theme CSS ${bytes} bytes)`)
