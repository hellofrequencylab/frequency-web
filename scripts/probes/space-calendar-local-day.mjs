// Bounded actual-reader consequences. All database IO and the clock are inert fixtures.
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import vm from 'node:vm'
import { createRequire } from 'node:module'
const require = createRequire(path.resolve('package.json'))
const ts = require('typescript')
const sid = 'aaaaaaaa-0000-4000-a000-000000000001'
let now = '2026-08-21T02:00:00Z', zone = 'America/Los_Angeles', metadataReads = 0
class ClockDate extends Date {
  constructor(value) { super(value === undefined ? now : value) }
  static now() { return Date.parse(now) }
}
let events = [{ id: 'tonight', slug: 'tonight', title: 'Tonight', space_id: sid, host_space_id: null, starts_at: '2026-08-20T19:00:00Z', status: 'published', visibility: 'public', is_cancelled: false, is_demo: false, removed_at: null }]
const admin = { from(table) {
  let rows = table === 'events' ? [...events] : table === 'spaces' ? [{ id: sid, time_zone: zone, visibility: 'network', status: 'active' }] : []
  const q = {
    select(cols) { if (table === 'spaces' && cols === 'time_zone') metadataReads++; return q },
    eq(col, val) { rows = rows.filter(row => row[col] === val); return q },
    in(col, vals) { rows = rows.filter(row => vals.includes(row[col])); return q },
    is(col, val) { rows = rows.filter(row => (row[col] ?? null) === val); return q },
    gte(col, val) { rows = rows.filter(row => Date.parse(row[col]) >= Date.parse(val)); return q },
    lt(col, val) { rows = rows.filter(row => Date.parse(row[col]) < Date.parse(val)); return q },
    or(filter) { assert.ok(filter.includes('host_space_id.eq.' + sid)); rows = rows.filter(row => row.host_space_id === sid); return q },
    order(col) { rows.sort((a, b) => String(a[col]).localeCompare(String(b[col]))); return q },
    limit(limit) { rows = rows.slice(0, limit); return q },
    range(from, to) { rows = rows.slice(from, to + 1); return q },
    maybeSingle: async () => ({ data: rows[0] ?? null, error: null }),
    then(resolve) { return Promise.resolve({ data: rows, error: null }).then(resolve) },
  }
  return q
} }
const stubs = {
  '@/lib/supabase/admin': { createAdminClient: () => admin },
  '@/lib/spaces/store': { loadRootSpaceId: async () => sid },
  '@/lib/events/cover-focus': { readEventCoverFocus: () => null },
  '@/lib/images/focal-point': { DEFAULT_OBJECT_POSITION: '50% 50%' },
  './calendar-repeats': { seriesAnchorIsLive: () => true },
}
const cache = new Map()
function load(file) {
  if (cache.has(file)) return cache.get(file).exports
  const mod = { exports: {} }; cache.set(file, mod)
  const source = fs.readFileSync(file, 'utf8')
  const code = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText
  const resolve = key => {
    if (Object.hasOwn(stubs, key)) return stubs[key]
    if (key === 'tz-lookup') return () => 'America/Los_Angeles'
    const target = key.startsWith('@/') ? key.slice(2) : path.posix.join(path.posix.dirname(file), key)
    assert.ok(target.startsWith('lib/'), 'Unexpected dependency: ' + key)
    return load(target + '.ts')
  }
  new vm.Script(`(function(require,module,exports){${code}\n})`, { filename: file }).runInNewContext({ Date: ClockDate, Intl, Map, Set, Object, Array, JSON, Number, String, Promise })(resolve, mod, mod.exports)
  return mod.exports
}
const store = load('lib/events/store.ts')
assert.equal((await store.listSpaceCalendarEvents(sid)).length, 1, 'Pacific tonight remains visible after UTC midnight')
assert.equal(await store.spaceHasPublicUpcomingEvents(sid), true, 'Calendar tab agrees')
zone = 'Asia/Tokyo'
assert.equal((await store.listSpaceCalendarEvents(sid)).length, 0, 'Space zone wins over HOME')
assert.equal(await store.spaceHasPublicUpcomingEvents(sid), false)
zone = 'Not/AZone'
assert.equal((await store.listSpaceCalendarEvents(sid)).length, 1, 'Invalid metadata uses HOME')
metadataReads = 0
assert.equal((await store.listSpaceCalendarEvents(sid, { fromDay: '2026-08-20', toDay: '2026-08-21', exhaustive: true })).length, 1)
assert.equal(metadataReads, 0, 'Explicit windows do not read a current zone')
now = '2026-08-21T07:00:00Z'
assert.equal(await store.spaceHasPublicUpcomingEvents(sid), false, 'Rolls at local midnight')
now = '2026-08-21T02:00:00Z'
events = events.map(row => ({ ...row, visibility: 'private' }))
assert.equal((await store.listSpaceCalendarEvents(sid)).length, 0, 'Date repair never relaxes event visibility')
assert.equal(await store.spaceHasPublicUpcomingEvents(sid), false)
console.log('Actual calendar/list-presence readers agree across UTC midnight, Tokyo, invalid zones and local midnight; explicit windows and private-event denial preserved (inert DB).')
