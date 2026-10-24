import assert from 'node:assert/strict'
import * as zod from 'zod'
import { loadProbeModule } from '../lib/probe-module.mjs'

let caller = { id: 'member-a', webRole: 'member' }, manage = false, memberStatus = 'active', reads = 0, failRead = false
const data = {
  space_memberships: [{ space_id: 'space-a', member_profile_id: 'visible', tier_id: 'tier-a', status: 'active' }, { space_id: 'space-a', member_profile_id: 'ghost', tier_id: 'tier-a', status: 'active' }, { space_id: 'space-a', member_profile_id: 'cancelled', tier_id: 'tier-a', status: 'cancelled' }, { space_id: 'space-b', member_profile_id: 'private-b', tier_id: 'tier-b', status: 'active' }],
  profiles: [{ id: 'visible', display_name: 'Visible member', handle: 'visible', ghost_mode: false }, { id: 'ghost', display_name: 'Hidden member', handle: 'ghost', ghost_mode: true }, { id: 'cancelled', display_name: 'Cancelled member', handle: 'cancelled', ghost_mode: false }, { id: 'private-b', display_name: 'Private B', handle: 'private-b', ghost_mode: false }],
  space_membership_tiers: [{ id: 'tier-a', name: 'A tier' }, { id: 'tier-b', name: 'B private tier' }],
}
function query(table) {
  assert.ok(Object.hasOwn(data, table))
  const filters = []
  const q = {
    select: () => q, order: () => q, limit: () => q,
    eq: (key, value) => { filters.push(row => row[key] === value); return q },
    in: (key, values) => { filters.push(row => values.includes(row[key])); return q },
    then: (yes, no) => Promise.resolve(failRead ? { data: null, error: { message: 'synthetic read failure' } } : { data: data[table].filter(row => filters.every(filter => filter(row))), error: null }).then(yes, no),
  }
  return q
}
const directory = loadProbeModule('lib/spaces/member-directory.ts', {
  '@/lib/supabase/admin': { createAdminClient: () => { reads++; return { from: query } } },
  '@/lib/auth': { getCallerProfile: async () => caller },
  '@/lib/spaces/entitlements': { resolveSpaceManageAccess: async (space, viewerId) => ({ canManage: manage && viewerId === 'member-a' && ['space-a', 'root'].includes(space.id), staffViewing: false }) },
  '@/lib/spaces/store': { getSpaceById: async id => ['space-a', 'space-b', 'root'].includes(id) ? { id, type: id === 'root' ? 'root' : 'business' } : null },
  '@/lib/spaces/memberships': { getMyMembership: async id => caller?.id === 'member-a' && id === 'space-a' ? { status: memberStatus } : null },
})
async function denied(id) { reads = 0; assert.deepEqual(await directory.listSpaceMemberDirectory(id), []); assert.equal(reads, 0, 'Deny before privileged roster reads') }
await denied('space-b')
caller = null; await denied('space-a')
caller = { id: 'member-a', webRole: 'member' }; memberStatus = 'waitlist'; await denied('space-a')
manage = true; await denied('root')
const expected = [{ profileId: 'visible', displayName: 'Visible member', handle: 'visible', avatarUrl: null, tierName: 'A tier' }]
assert.deepEqual(await directory.listSpaceMemberDirectory('space-a'), expected, 'An A manager gets no B, ghost or cancelled members')
manage = false; memberStatus = 'active'
assert.deepEqual(await directory.listSpaceMemberDirectory('space-a'), expected, 'An A member gets only its active visible roster')
failRead = true; assert.deepEqual(await directory.listSpaceMemberDirectory('space-a'), []); failRead = false

let auth = { ok: true, via: 'cookie', caller: { id: 'member-a' } }, impersonating = false, limited = false, exports = [], authCalls = 0, exportFailure = false
const contract = loadProbeModule('lib/contract/index.ts', { zod })
const respond = loadProbeModule('lib/contract/respond.ts', {
  'server-only': {}, '@/lib/contract': contract, '@/lib/validation': { parseInput: () => { throw Error('Unexpected input parse') } },
  '@/lib/rate-limit': { clientIp: () => 'fixture-ip', rateLimitOk: async (key, ip, limit, window) => { assert.equal(key, 'v1:account-export'); assert.equal(ip, 'fixture-ip'); assert.equal(limit, 5); assert.equal(window, '10 m'); return !limited } },
})
function privateResponse(response) {
  assert.ok(response.headers.get('cache-control')?.includes('no-store')); assert.ok(response.headers.get('cache-control')?.includes('private'))
  assert.ok(response.headers.get('vary')?.includes('Authorization')); assert.ok(response.headers.get('vary')?.includes('Cookie'))
  assert.equal(response.headers.has('access-control-allow-origin'), false)
}
const route = loadProbeModule('app/api/v1/account/export/route.ts', {
  '@/lib/contract/caller': { authorizeCaller: async () => { authCalls++; return auth } },
  '@/lib/contract/respond': respond,
  '@/lib/impersonation': { readImpersonation: async () => impersonating },
  '@/lib/privacy/export': { buildMemberExport: async id => { exports.push(id); if (exportFailure) throw Error('synthetic-sensitive-detail'); return { owner: id } } },
})
const request = () => new Request('https://fixture.invalid/api/v1/account/export?profileId=member-b&id=member-b', { headers: { 'x-profile-id': 'member-b' } })
let response = await route.GET(request())
privateResponse(response); assert.equal(response.status, 200); assert.deepEqual(exports, ['member-a']); assert.equal((await response.json()).data.export.owner, 'member-a')
exports = []; impersonating = true
assert.equal((await route.GET(request())).status, 403); assert.deepEqual(exports, [])
auth = { ok: false, code: 'unauthorized', message: 'Sign in' }; impersonating = false
assert.equal((await route.GET(request())).status, 401); assert.deepEqual(exports, [])
limited = true; authCalls = 0
assert.equal((await route.GET(request())).status, 429); assert.equal(authCalls, 0); assert.deepEqual(exports, [])
limited = false; auth = { ok: true, via: 'cookie', caller: { id: 'member-a' } }; exportFailure = true
response = await route.GET(request()); assert.equal(response.status, 500); privateResponse(response); assert.equal((await response.text()).includes('synthetic-sensitive-detail'), false)
console.log('Actual Space directory and native account-export functions deny outsiders before privileged reads, preserve owner scoping/redaction, ignore target-profile injection and keep exports/errors private and uncacheable; synthetic data/dependencies only')
