import fs from 'node:fs'
import vm from 'node:vm'
import path from 'node:path'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
const require = createRequire(path.join(process.cwd(), 'package.json'))
const ts = require('typescript')
function load(file, stubs = {}) {
  const loadedModule = { exports: {} }
  const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText
  new vm.Script(`(function(require,module,exports){${code}\n})`, { filename: file }).runInNewContext({ Date, Promise, Set, Map })(key => {
    assert.ok(Object.hasOwn(stubs, key), `Unexpected dependency: ${key}`)
    return stubs[key]
  }, loadedModule, loadedModule.exports)
  return loadedModule.exports
}
const market = { LISTING_KINDS: ['offer', 'free', 'lend', 'request'].map(key => ({ key })) }
const coerce = load('lib/listing-seeder/coerce.ts', {
  '@/lib/importer/extract/coerce': load('lib/importer/extract/coerce.ts'),
  '@/lib/marketplace': market,
  '@/lib/listings/housing': { toAmenities: () => [], toPropertyType: () => null },
})
const paste = 'Old bike, $40. Text 555-0142.'
const copied = field => ({ value: field, kind: 'fact', snippet: field })
const run = (title, description) => coerce.coerceListingExtraction({ kind: 'classifieds', title, description, priceNote: copied('$40'), contact: copied('555-0142') }, 'classifieds', paste)
const bad = run({ value: 'Perfect bike for your new life', kind: 'fact', snippet: 'bike' }, { value: 'A great deal', kind: 'generated' })
assert.equal(bad.draft.title, '')
assert.equal(bad.draft.description, null)
assert.equal(bad.draft.priceNote, '$40')
assert.equal(bad.draft.contact, '555-0142')
const exact = run(copied('Old bike'), copied('Old bike, $40.'))
assert.equal(exact.draft.title, 'Old bike')
assert.equal(exact.draft.description, 'Old bike, $40.')
let intake
const writes = []
const publisher = load('lib/listing-seeder/publish.ts', {
  './coerce': coerce,
  '@/lib/supabase/admin': { createAdminClient: () => ({ from: () => {
    const q = { select: () => q, eq: () => q, maybeSingle: async () => ({ data: intake }), update: () => q }
    return q
  } }) },
  '@/lib/marketplace': { createListing: async (_owner, payload) => { writes.push(payload); return { id: 'listing' } } },
  '@/lib/listings': { createListing: async () => { throw Error('Wrong vertical') } },
  '@/lib/listings/housing': { upsertHousingDetail: async () => { throw Error('Wrong vertical') } },
  '@/lib/events/geocode-provider': { nominatimGeocoder: async () => { throw Error('Unexpected geocode') } },
  './claim': { mintListingClaimToken: async () => 'claim' },
  './seed-owner': { resolveSeedOwnerProfileId: async () => 'seed-owner' },
})
intake = { id: 'intake', kind: 'classifieds', status: 'review', inputs: { pastedText: paste }, draft: { ...bad.draft, title: 'Invented legacy title' }, ledger: { title: [{ kind: 'generated', confidence: 1 }] } }
assert.equal((await publisher.publishListingIntake('intake')).ok, false)
assert.equal(writes.length, 0)
intake = { ...intake, draft: exact.draft, ledger: exact.ledger }
assert.equal((await publisher.publishListingIntake('intake')).ok, true)
assert.equal(writes[0].description, 'Old bike, $40.')
intake = { ...intake, draft: { ...bad.draft, title: 'My own title' }, ledger: { title: [{ kind: 'fact', confidence: 1, verifiedBy: 'human', snippet: 'My own title' }] } }
assert.equal((await publisher.publishListingIntake('intake')).ok, true)
assert.equal(writes[1].title, 'My own title')
assert.equal(writes[1].description, null)
console.log('ok: actual listing coercion and publisher reject new/legacy AI prose, preserve exact source excerpts and matching human edits; inert storage/claim/creator IO only')
