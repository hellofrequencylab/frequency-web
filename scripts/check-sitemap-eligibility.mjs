// LIVE-886: actual crawl reader and organizer mapper; synthetic rows, no network or test runner.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import ts from 'typescript'
import { invokedDirectly } from './lib/invoked-directly.mjs'
const instant = Date.parse('2026-10-08T20:00:00Z')
class Clock extends Date {
  constructor(...args) { super(...(args.length ? args : [instant])) }
  static now() { return instant }
}
function load(path, resolve) {
  const output = ts.transpileModule(readFileSync(path, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText
  const exports = {}
  new Function('require', 'exports', 'Date', output)(resolve, exports, Clock)
  return exports
}
function actualFunction(path, name, bindings) {
  const source = readFileSync(path, 'utf8')
  const ast = ts.createSourceFile(path, source, ts.ScriptTarget.Latest, true)
  const declaration = ast.statements.find(s => ts.isFunctionDeclaration(s) && s.name?.text === name)
  assert.ok(declaration, `Actual function ${name} exists`)
  const text = declaration.getText(ast).replace(/^export /, '')
  const output = ts.transpileModule(text, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText
  return new Function(...Object.keys(bindings), `${output};return ${name}`)(...Object.values(bindings))
}
export async function verifySitemapEligibility() {
  const zone = load('lib/time/zone.ts', name => { assert.equal(name, 'tz-lookup'); return () => 'America/Los_Angeles' })
  const end = load('lib/events/end-time.ts', name => { assert.equal(name, '@/lib/time/zone'); return zone })
  const pageEnded = actualFunction('lib/discover.ts', 'hasEventEnded', { eventHasEnded: end.eventHasEnded })
  const fold = load('lib/events/series.ts', name => { throw new Error(name) })
  const uuid = n => `00000000-0000-0000-0000-${String(n).padStart(12, '0')}`
  const row = (n, start, ends, extra = {}) => ({ id: uuid(n), slug: `event-${n}`, starts_at: start, ends_at: ends, is_cancelled: false, cover_image_path: null, recurrence_type: 'none', recurrence_until: null, parent_event_id: null, ...extra })
  const past = '2026-10-08T09:00:00Z', later = '2026-10-08T22:00:00Z'
  const rows = [
    row(1, past, '2026-10-08T10:00:00Z'), // ended today
    row(2, past, later), // in progress
    row(3, past, null), // no end falls back to start
    row(4, later, null),
    row(10, past, past, { recurrence_type: 'weekly' }),
    row(11, later, later, { parent_event_id: uuid(10) }),
    row(12, '2026-10-09T20:00:00Z', null, { parent_event_id: uuid(10) }),
    row(20, past, past, { parent_event_id: uuid(99) }),
    row(21, later, later, { parent_event_id: uuid(99) }),
    row(22, '2026-10-09T20:00:00Z', null, { parent_event_id: uuid(99) }),
    row(23, '2026-10-10T20:00:00Z', null, { parent_event_id: uuid(99) }),
    row(30, past, past, { recurrence_type: 'weekly' }),
    row(40, '2026-10-08T13:00:00Z', '2026-10-08T13:00:00Z'), // exact boundary matches page
  ]
  rows.push(row(50, '2026-10-08T19:00:00Z', '2026-10-08T19:00:00Z', { time_zone: 'America/Los_Angeles' }))
  rows.push(row(51, '2026-10-08T19:00:00Z', '2026-10-08T19:00:00Z', { time_zone: 'Europe/London' }))
  const selections = []
  const db = { from() {
    let filtered = rows
    const query = {
      select(value) { selections.push(value); return query },
      eq(key, value) { filtered = filtered.filter(r => !(key in r) || r[key] === value); return query }, is() { return query },
      async maybeSingle() { return { data: filtered[0] ?? null, error: null } },
      gte(key, value) { filtered = filtered.filter(r => Date.parse(r[key]) >= Date.parse(value)); return query },
      order() { return query }, async limit(n) { return { data: filtered.slice(0, n), error: null } },
    }
    return query
  } }
  // Load the actual shared read ladder; the strict healthy read must emit the same fold.
  const discoverDeps = {
    '@/lib/supabase/public': { createPublicClient: () => db },
    '@/lib/events/end-time': end, '@/lib/events/series': fold, '@/lib/time/zone': zone,
    '@/lib/maps/city-centroids': { cityCentroid: () => null },
    '@/lib/utils': {}, // Unused discover re-exports; this probe calls only the real read ladder.
  }
  const discover = load('lib/discover.ts', name => { assert.ok(discoverDeps[name], name); return discoverDeps[name] })
  const deps = { 'server-only': {}, '@/lib/discover': discover, '@/lib/supabase/admin': { createAdminClient: () => db },
    './hero-url': { EVENT_MEDIA_BUCKET: 'public' }, './series': fold, './end-time': end,
    '@/lib/time/zone': zone }
  const crawl = load('lib/events/series-seo.ts', name => { assert.ok(deps[name], name); return deps[name] })
  assert.equal((await crawl.shareEventSeo('event-50')).timeZone, 'America/Los_Angeles', 'Metadata read carries the selected host timezone')
  const entries = await crawl.listSitemapEventEntries({ occurrences: 2 })
  assert.deepEqual(await crawl.listSitemapEventEntries({ occurrences: 2, failClosed: true }), entries, 'Strict healthy reads preserve every fold and eligibility consequence')
  const slugs = entries.map(r => r.slug)
  assert.deepEqual(slugs, ['event-2', 'event-4', 'event-10', 'event-11', 'event-12', 'event-21', 'event-22', 'event-40', 'event-50'])
  assert.ok(selections.some(s => s.includes('ends_at')), 'Reader projects the actual event end')
  assert.ok(selections.some(s => s.includes('time_zone')), 'Reader projects the host timezone')
  for (const n of [1, 3, 20, 30, 51]) assert.equal(pageEnded(rows.find(r => r.id === uuid(n))), true)
  for (const n of [2, 4, 40, 50]) assert.equal(pageEnded(rows.find(r => r.id === uuid(n))), false)
  assert.ok(!slugs.includes('event-23'), 'Ended rows cannot promote a date beyond the page ordinal allowance')
  const organizers = actualFunction('app/sitemap.ts', 'getOrganizerRoutes', {
    SITE_URL: 'https://example.test', createPublicClient: () => ({ rpc: async () => ({ data: [{ handle: 'guide', next_starts: '2099-01-01T00:00:00Z' }] }) }),
  })
  const mapped = await organizers()
  assert.equal(mapped[0].url, 'https://example.test/discover/events/organizer/guide')
  assert.ok(!Object.hasOwn(mapped[0], 'lastModified'), 'A future event start is not an organizer modification date')
  return 'page end instants, live anchors and ordinal allowances agree; organizer lastmod is not invented'
}
if (invokedDirectly(import.meta.url)) console.log(`LIVE-886: ${await verifySitemapEligibility()}`)
