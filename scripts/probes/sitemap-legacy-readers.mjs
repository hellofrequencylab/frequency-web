import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import ts from 'typescript'

// Optional controls disable one reader's opt-in inside this in-memory probe only.
const control = process.argv[2]
assert.ok(!control || ['getTopicalChannels', 'getPublicCircles', 'listPublicJourneys', 'listPublishedSpotlightHandles', 'listSitemapEventEntries'].includes(control), 'unknown control')
function declarations(file, names) {
  const source = ts.createSourceFile(file, readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true)
  const selected = source.statements.filter(node =>
    (node.name && names.includes(node.name.text)) ||
    (ts.isVariableStatement(node) && node.declarationList.declarations.some(d => names.includes(d.name.getText(source)))))
  assert.equal(selected.length, names.length, `${file}: required declaration missing`)
  return selected.map(node => node.name?.text === control ? node.getText(source).replaceAll('opts.failClosed', 'false') : node.getText(source)).join('\n')
}
const discover = declarations('lib/discover.ts', ['TRANSIENT_RE', 'TRANSIENT_STATUS', 'isTransientDiscoverStatus', 'isTransientDiscoverError', 'RETRY_DELAYS_MS', 'attempt', 'TransientReadError', 'listReadFailClosed', 'listRead', 'getTopicalChannels', 'getPublicCircles'])
const readers = declarations('lib/journey-plans.ts', ['listPublicJourneys']) + '\n' +
  declarations('lib/spotlight/data.ts', ['listPublishedSpotlightHandles']) + '\n' +
  declarations('lib/events/series-seo.ts', ['listSitemapEventEntries'])
const sections = declarations('app/sitemap.ts', ['getSpotlightRoutes', 'SitemapTransientReadError', 'isTransientRead', 'describeError', 'failSection', 'sectionRead'])
const code = ts.transpileModule(discover + '\n' + readers + '\n' + sections, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText
let answer = { data: [], error: null, status: 200 }
let reads = 0
const query = () => {
  const api = new Proxy({}, { get: (_, key) => key === 'then'
    ? (resolve, reject) => { reads++; return (answer instanceof Error ? Promise.reject(answer) : Promise.resolve(answer)).then(resolve, reject) }
    : () => api })
  return api
}
const client = { from: query, rpc: query }
const logs = []
const functions = new Function('exports', 'createPublicClient', 'createAdminClient', 'db', 'console', 'setTimeout', 'PLAN_COLS', 'DEFAULT_INDEXED_OCCURRENCES', 'SITEMAP_EVENT_ROW_CAP', 'SERIES_COLUMNS', 'upcomingFloor', 'collapseSeries', 'seriesKey', 'SITE_URL', code + '\nreturn {getTopicalChannels,getPublicCircles,listPublicJourneys,listPublishedSpotlightHandles,listSitemapEventEntries,getSpotlightRoutes,sectionRead}')({}, () => client, () => client, () => client, { error: (...args) => logs.push(args) }, cb => cb(), '', 2, 5000, '', () => '2026-10-25', () => ({ groups: [] }), () => 'fixture', 'https://fixture.invalid')
const cases = [
  ['channels', () => functions.getTopicalChannels({ failClosed: true })],
  ['circles', () => functions.getPublicCircles(200, { failClosed: true })],
  ['events', () => functions.listSitemapEventEntries({ occurrences: 2, failClosed: true })],
  ['journeys', () => functions.listPublicJourneys({ failClosed: true })],
  ['spotlights', () => functions.getSpotlightRoutes()],
]
for (const [name, read] of cases) {
  const run = () => functions.sectionRead(name, read())
  answer = { data: [], error: null, status: 200 }; reads = 0; logs.length = 0
  assert.deepEqual(await run(), [], `${name}: healthy empty`)
  assert.equal(logs.length, 0, `${name}: ${JSON.stringify(logs)}`)
  for (const response of [{ data: null, error: { code: '', message: 'fetch failed' }, status: 0 }, { data: null, error: { message: 'edge unavailable' }, status: 503 }, new TypeError('fetch failed')]) {
    answer = response; reads = 0
    await assert.rejects(run(), { name: 'SitemapTransientReadError' }, `${name}: transport must abandon regeneration`)
    assert.equal(reads, 4, `${name}: existing retry ladder`)
  }
  answer = { data: null, error: { code: '42501', message: 'permission denied' }, status: 503 }; reads = 0
  assert.deepEqual(await run(), [], `${name}: deterministic error is section-local`)
  assert.equal(reads, 1, `${name}: real database codes never retry`)
}
const route = readFileSync('app/sitemap.ts', 'utf8')
for (const call of ['getTopicalChannels({ failClosed: true })', 'getPublicCircles(CIRCLE_SITEMAP_CAP, { failClosed: true })', 'listSitemapEventEntries({ occurrences: indexedOccurrences, failClosed: true })', 'listPublicJourneys({ failClosed: true })', 'listPublishedSpotlightHandles(1000, { failClosed: true })']) assert.ok(route.includes(call), `sitemap must opt in: ${call}`)
console.log('Five actual reader bodies preserve healthy empty and deterministic errors; resolved/thrown transport exhausts the existing ladder and abandons sitemap regeneration. Scripted SDK only; no deployed cache claim.')
