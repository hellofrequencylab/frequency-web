// LIVE-699 PROBE: theme depth for Sites. Runs the SHIPPED pure decisions (probe-ts resolves `@/` and
// extensionless imports; nothing is mocked) and fails on the consequence, not the spelling:
//   1. a page may wear its own theme, every other page falls back to the site's, and the override
//      survives every other style write and clears cleanly (lib/theme/site-style.ts);
//   2. the website header wears the Space's stored brand with a sane fallback, and a published website
//      may override the name, logo and accent (lib/sites/site-brand.ts);
//   3. the membership badge names the reader's tier in THIS Space only, and the route grants credentials
//      only to the Space's own https hosts (lib/sites/site-member.ts).
// Then it checks the wiring that only a render would otherwise prove: the public page reads the PAGE
// style, the header carries the member island, and the editor action accepts the per-page patch.
//
//   node --experimental-strip-types --no-warnings --import ./scripts/probe-ts.mjs scripts/probes/sites-theme-depth.mjs
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const style = await import('../../lib/theme/site-style.ts')
const brand = await import('../../lib/sites/site-brand.ts')
const member = await import('../../lib/sites/site-member.ts')

// 1. A theme per page, falling back to the site's.
const site = style.withSiteStyle({}, { theme: 'frequency', look: { corners: 'square', spacing: null, header: null, footer: null } })
assert.deepEqual(style.readSitePageStyle(site, 'events'), style.readSiteStyle(site), 'a page with no override wears the site style')
const prefs = style.withSitePageTheme(site, 'events', 'bold')
assert.equal(style.siteTheme(prefs), 'frequency', 'the site theme is untouched by a page override')
assert.equal(style.readSitePageStyle(prefs, 'home').theme, 'frequency', 'Home keeps the site theme')
const events = style.readSitePageStyle(prefs, 'events')
assert.equal(events.theme, 'bold')
assert.equal(events.fonts, 'menswork', 'a page on the other theme wears that theme\'s own fonts')
assert.deepEqual(style.siteLook(events), { ...style.THEME_LOOK.bold, corners: 'square' }, 'explicit global styles hold; the rest follow the page theme')
assert.deepEqual(style.readSiteStyle(style.withSiteStyle(prefs, { theme: 'bold', fonts: 'menswork' })).pages, { events: 'bold' }, 'a page theme survives other style writes')
const cleared = style.withSitePageTheme(prefs, 'events', null)
assert.equal(style.readSitePageStyle(cleared, 'events').theme, 'frequency', 'clearing puts the page back on the site theme')
assert.equal(cleared.siteStyle.pages, undefined, 'a cleared override is not stored')
assert.deepEqual(style.readSiteStyle({ siteStyle: { theme: 'frequency', pages: { 'Bad Slug': 'bold', about: 'midnight', ok: 'bold' } } }).pages, { ok: 'bold' }, 'malformed entries are dropped')
assert.deepEqual(style.readSiteStyle(style.withSitePageTheme({}, 'Not A Slug', 'bold')).pages, {}, 'an invalid slug writes nothing')

// 2. The Space's visual brand in the website header, with its fallbacks.
const space = { name: 'Heart on Fire', brandName: ' HoF ', brandLogoUrl: '/logo.svg', brandAccent: '#123456' }
assert.deepEqual(brand.resolveSiteHeaderBrand(space, null), { name: 'HoF', logo: '/logo.svg', accent: '#123456' })
assert.deepEqual(brand.resolveSiteHeaderBrand({ name: 'Heart on Fire', brandName: ' ', brandLogoUrl: null, brandAccent: null }, null), { name: 'Heart on Fire', logo: null, accent: null }, 'no brand set: the Space name alone')
assert.equal(brand.resolveSiteHeaderBrand({ name: '' }, null).name, 'Your Space', 'the name is never empty')
const page = { slug: 'home', label: 'Home', doc: { root: {}, content: [] }, seo: { title: '', description: '' }, comments: [] }
assert.deepEqual(brand.resolveSiteHeaderBrand(space, { theme: 'Menswork', pages: [page], chrome: { name: 'HoF Circles' }, brand: { logo: null, accent: '#abc' } }), { name: 'HoF Circles', logo: null, accent: '#abc' }, 'a published website overrides and may clear the logo')
assert.deepEqual(brand.resolveSiteHeaderBrand(space, { theme: 'Menswork', pages: [page], brand: {} }), { name: 'HoF', logo: '/logo.svg', accent: '#123456' }, 'an absent website key inherits the stored brand')

// 3. Per-Space membership identity: one tier, this Space, own hosts only.
assert.equal(member.siteMembershipLine(null), null)
assert.equal(member.siteMembershipLine({ tierName: 'Circle', status: 'active' }), 'Member · Circle')
assert.equal(member.siteMembershipLine({ tierName: 'Circle', status: 'waitlist' }), 'Waitlist · Circle')
const hosts = ['heart.frequencylocal.com', 'heartonfire.org', null]
assert.equal(member.siteMemberOrigin('https://heart.frequencylocal.com', hosts), 'https://heart.frequencylocal.com')
assert.equal(member.siteMemberOrigin('http://heart.frequencylocal.com', hosts), null, 'plain http is refused')
assert.equal(member.siteMemberOrigin('https://other.frequencylocal.com', hosts), null, 'another Space\'s host is refused')
assert.equal(member.siteMemberOrigin('https://heartonfire.org.evil.com', hosts), null)
assert.equal(member.siteMemberOrigin(null, hosts), null)

// The wiring a render would otherwise have to prove.
const code = (path) => readFileSync(path, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
const sitePage = code('components/sites/site-page.tsx')
assert.match(sitePage, /readSitePageStyle\(space\.preferences,\s*pageSlug\)/, 'the public page reads the PAGE style')
assert.match(sitePage, /resolveSiteHeaderBrand\(space,\s*website\)/, 'the header brand comes from the one resolver')
assert.match(sitePage, /<SiteMemberBadge endpoint=\{`\$\{origin\}\/api\/sites\/\$\{space\.slug\}\/membership`\}/, 'the header carries the member island')
assert.match(code('components/sites/house-header.tsx'), /\{member\}/, 'the house header renders the member slot')
assert.match(code('app/api/sites/[slug]/membership/route.ts'), /getMyMembership\(space\.id\)/, 'the route reads the existing membership reader')
assert.match(code('app/api/sites/[slug]/membership/route.ts'), /siteMemberOrigin\(request\.headers\.get\('origin'\)/, 'the route grants CORS through the pure origin check')
assert.match(code('lib/sites/editor/actions.ts'), /withSitePageTheme\(next,\s*slug/, 'the editor action writes the per-page theme')
assert.match(code('components/sites/editor/shell.tsx'), /theme=\{canvasTheme\}/, 'the editor canvas wears the page theme')
console.log('ok: a theme per page falls back to the site theme, the website header wears the Space brand with a fallback, and the membership badge names one tier for one Space on its own hosts')
