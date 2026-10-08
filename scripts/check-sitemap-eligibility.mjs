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
  const end = load('lib/events/end-time.ts', name => { throw new Error(name) })
  const pageEnded = actualFunction('lib/discover.ts', 'hasEventEnded', { eventHasEnded: end.eventHasEnded })
  const fold = load('lib/events/series.ts', name => { throw new Error(name) })
  const uuid = n => `00000000-0000-0000-0000-${String(n).padStart(12, '0')}`
  const row = (n, start, ends, extra = {}) => ({ id: uuid(n), slug: `event-${n}`, starts_at: start, ends_at: ends, is_cancelled: false, cover_image_path: null, recurrence_type: 'none', recurrence_until: null, parent_event_id: null, ...extra })
  const past = '2026-10-08T09:00:00-07:00', later = '2026-10-08T22:00:00Z'
  const rows = [
    row(1, past, '2026-10-08T10:00:00-07:00'), // ended today
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
    row(40, '2026-10-08T20:00:00Z', '2026-10-08T20:00:00Z'), // exact boundary matches page
  ]
  const selections = []
  const db = { from() {
    let filtered = rows
    const query = {
      select(value) { selections.push(value); return query }, eq() { return query }, is() { return query },
      gte(key, value) { filtered = filtered.filter(r => Date.parse(r[key]) >= Date.parse(value)); return query },
      order() { return query }, async limit(n) { return { data: filtered.slice(0, n), error: null } },
    }
    return query
  } }
  const deps = { 'server-only': {}, '@/lib/supabase/admin': { createAdminClient: () => db },
    './hero-url': { EVENT_MEDIA_BUCKET: 'public' }, './series': fold, './end-time': end,
    '@/lib/time/zone': { HOME_TZ: 'America/Los_Angeles', dayInZone: () => '2026-10-08' } }
  const crawl = load('lib/events/series-seo.ts', name => { assert.ok(deps[name], name); return deps[name] })
  const entries = await crawl.listSitemapEventEntries({ occurrences: 2 })
  const slugs = entries.map(r => r.slug)
  assert.deepEqual(slugs, ['event-2', 'event-4', 'event-10', 'event-11', 'event-12', 'event-21', 'event-22', 'event-40'])
  assert.ok(selections.some(s => s.includes('ends_at')), 'Reader projects the actual event end')
  for (const n of [1, 3, 20, 30]) assert.equal(pageEnded(rows.find(r => r.id === uuid(n))), true)
  for (const n of [2, 4, 40]) assert.equal(pageEnded(rows.find(r => r.id === uuid(n))), false)
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
