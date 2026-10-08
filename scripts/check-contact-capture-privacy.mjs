// LIVE-881: actual request read model, synthetic permission-sensitive rows, no production reads.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import ts from 'typescript'
import { invokedDirectly } from './lib/invoked-directly.mjs'
const U1 = '00000000-0000-0000-0000-000000000001', U2 = '00000000-0000-0000-0000-000000000002'
const S1 = '10000000-0000-0000-0000-000000000001', S2 = '10000000-0000-0000-0000-000000000002'
const EMAIL = 'person_%@example.test'
function load(path, resolve) {
  const output = ts.transpileModule(readFileSync(path, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText
  const exports = {}
  new Function('require', 'exports', output)(resolve, exports)
  return exports
}
export async function verifyContactCapturePrivacy() {
  const state = { viewer: U1, staff: false, team: true, teamThrows: false, captureError: false, captures: [], calls: [], editorSpaces: new Set([S1]) }
  const spaces = { [S1]: { id: S1, owner_profile_id: U1 }, [S2]: { id: S2, owner_profile_id: U2 } }
  const contact = (spaceId, id) => ({ id, space_id: spaceId, email: EMAIL, display_name: 'Synthetic contact', custom: {}, created_at: '2026-01-01', consent_state: 'unknown' })
  const contacts = { c1: contact(S1, 'c1'), c2: contact(S2, 'c2') }
  const admin = { from(table) {
    state.calls.push(['from', table])
    let rows = table === 'network_contacts' ? state.captures : []
    const query = {
      select(columns) { state.calls.push(['select', table, columns]); return query },
      eq(key, value) { rows = rows.filter(row => row[key] === value); return query },
      ilike(key, value) {
        const escape = character => character.replace(/[.*+?^$()|[\]\\{}]/g, '\\$&')
        let pattern = '^'
        for (let i = 0; i < value.length; i++) {
          const character = value[i]
          if (character === '\\' && i + 1 < value.length) pattern += escape(value[++i])
          else if (character === '%') pattern += '.*'
          else if (character === '_') pattern += '.'
          else pattern += escape(character)
        }
        const matcher = new RegExp(pattern + '$', 'i')
        rows = rows.filter(row => matcher.test(String(row[key])))
        return query
      },
      or(expression) {
        const match = /^owner_id.eq.([0-9a-f-]+),and\(visibility.eq.shared,shared_space_id.eq.([0-9a-f-]+)\)$/.exec(expression)
        assert.ok(match, 'authorization expression has only owner OR exact-Space sharing')
        rows = rows.filter(row => row.owner_id === match[1] || row.visibility === 'shared' && row.shared_space_id === match[2])
        return query
      },
      order(key, options) { rows = [...rows].sort((a, b) => options.ascending ? String(a[key]).localeCompare(String(b[key])) : String(b[key]).localeCompare(String(a[key]))); return query },
      async limit(count) { return { data: rows.slice(0, count), error: state.captureError ? { message: 'synthetic read error' } : null } },
      async maybeSingle() { return { data: null, error: null } },
    }
    return query
  } }
  const sanitize = load('lib/search-sanitize.ts', name => { throw new Error(`Unexpected sanitizer dependency ${name}`) })
  const deps = {
    '@/lib/supabase/admin': { createAdminClient: () => admin }, '@/lib/search-sanitize': sanitize,
    '@/lib/auth': { getMyProfileId: async () => state.viewer },
    '@/lib/spaces/store': { getSpaceById: async id => spaces[id] ?? null },
    '@/lib/spaces/entitlements': { getSpaceCapabilities: async space => ({ canEditProfile: state.staff || state.editorSpaces.has(space.id) }), autoExecutionAllowed: () => false },
    '@/lib/spaces/operated': { isSpaceTeamMember: async () => { if (state.teamThrows) throw new Error('synthetic authorization failure'); return state.team } },
    '@/lib/crm/pipeline': { getContact: async (id, spaceId) => contacts[id]?.space_id === spaceId ? contacts[id] : null, getDeals: async () => [] },
    '@/lib/crm/client-notes': { listClientNotes: async () => [] }, '@/lib/crm/interactions': { listInteractionsForPerson: async () => [] },
    '@/lib/crm/timeline': { buildTimeline: () => [] },
    '@/lib/dashboard/scores': { getMemberScores: async () => ({ resonanceTier: null, lifecycleStage: null }) },
    '@/lib/dashboard/person-band': { draftContextLine: async () => 'Synthetic context', explainMemberScores: () => ({}) },
    '@/lib/playbooks/resolve': { resolvePlaybookForScores: () => null }, '@/lib/playbooks/registry': { effectiveAutonomyTier: () => 'suggest' },
    '@/lib/crm/import/store': { listSpaceCustomFields: async () => [] }, '@/lib/crm/segment-fields': { templateFieldsForContact: async () => [] },
    '@/lib/crm/import/custom-fields': { humanizeFieldKey: key => key },
  }
  const module = load('lib/crm/space-contact-detail.ts', name => {
    assert.ok(deps[name], `Every request dependency is explicitly synthetic: ${name}`)
    return deps[name]
  })
  const read = (spaceId = S1, id = 'c1') => module.getSpaceContactDetail(spaceId, id)
  const capture = (owner, extra = {}) => ({ owner_id: owner, email: EMAIL, visibility: 'private', shared_space_id: null, phone: 'foreign private phone', company: 'foreign private company', city: 'foreign private city', notes: 'must never be selected', created_at: '2026-10-08T00:00:00Z', ...extra })
  const blank = detail => { assert.ok(detail); assert.equal(detail.identity.phone, null); assert.equal(detail.identity.company, null); assert.equal(detail.identity.city, null); assert.equal(detail.insight.facts, null) }
  // Same email across two owners: person stitching conveys no source permission.
  state.captures = Array.from({ length: 25 }, () => capture(U2))
  blank(await read())
  state.captures.push(capture(U2, { visibility: 'shared', shared_space_id: S2 }), capture(U2, { visibility: 'network' }), capture(U1, { email: 'personXYZ@example.test' }))
  blank(await read())
  // Newer forbidden captures cannot beat the older deliberately shared exact-Space card.
  state.captures.push(capture(U2, { visibility: 'shared', shared_space_id: S1, phone: 'authorized shared phone', company: 'authorized shared company', city: 'authorized shared city', created_at: '2026-01-01T00:00:00Z' }))
  let detail = await read()
  assert.equal(detail.identity.phone, 'authorized shared phone'); assert.equal(detail.identity.company, 'authorized shared company'); assert.equal(detail.identity.city, 'authorized shared city')
  state.viewer = U2; state.editorSpaces = new Set([S2])
  detail = await read(S2, 'c2')
  assert.equal(detail.identity.phone, 'foreign private phone', 'owner keeps access to their own private capture')
  // Cross-Space editor and global staff edit privileges are not Space-team sharing grants.
  state.viewer = U1; state.editorSpaces = new Set([S2]); state.captures = [capture(U2)]
  blank(await read(S2, 'c2')) // A Space editor never inherits the Space owner's private book.
  state.captures = [capture(U2, { visibility: 'shared', shared_space_id: S1 })]
  blank(await read(S2, 'c2'))
  state.staff = true; state.team = false; state.captures = [capture(U2, { visibility: 'shared', shared_space_id: S2 })]
  blank(await read(S2, 'c2'))
  state.team = true; state.teamThrows = true
  blank(await read(S2, 'c2'))
  state.teamThrows = false; state.captureError = true
  blank(await read(S2, 'c2'))
  state.captureError = false; state.staff = false; state.editorSpaces = new Set([S1]); state.calls = []
  assert.equal(await read(S2, 'c2'), null); assert.equal(await read(S1, 'c2'), null)
  state.viewer = null
  assert.equal(await read(), null); assert.equal(state.calls.length, 0, 'denied requests never query captures')
  assert.ok(!readFileSync('lib/crm/space-contact-detail.ts', 'utf8').includes('getMemberContext('), 'Vera memory remains private')
  state.viewer = U1; state.calls = []; state.team = true
  await read()
  assert.equal(state.calls.find(call => call[0] === 'select' && call[1] === 'network_contacts')?.[2], 'phone, company, city, created_at', 'capture notes/tags/media are never selected')
  return 'viewer-owned or explicitly shared exact-Space card fields; request gates and private sources preserved'
}
if (invokedDirectly(import.meta.url)) console.log(`LIVE-881: ${await verifyContactCapturePrivacy()}`)
