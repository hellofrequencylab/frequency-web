import assert from 'node:assert/strict'
import fs from 'node:fs'
import { buildNetworkReport } from '../lib/collective/network-report-policy.ts'
import { completeEarningsRead, assertUsdEarningsRows } from '../lib/commerce/complete-read.ts'
const parent = { id: 'p', name: 'Parent', slug: 'parent', parent_id: null, owner_profile_id: 'owner', status: 'active', plan: 'collective', type: 'business' }
const child = { ...parent, id: 'c', parent_id: 'p', plan: 'free' }
const amount = { grossCents: 100, feeCents: 5, netCents: 95, refundedCents: 0, orderCount: 1, networkGrossCents: 0, networkFeeCents: 0, networkOrderCount: 0 }
let reads = 0
const deps = { space: async id => id === 'p' ? parent : child, children: async () => [child, child, { ...child, id: 'x', owner_profile_id: 'stranger' }],
  members: async () => [{ member_profile_id: 'm', status: 'active' }, { member_profile_id: 'm', status: 'active' }],
  events: async () => [{ id: 'e', space_id: 'p', host_space_id: 'c' }, { id: 'e', space_id: 'p', host_space_id: 'c' }, { id: 'listing', space_id: 'p', host_space_id: 'stranger' }], earnings: async () => { reads++; return amount } }
assert.deepEqual(await buildNetworkReport('p', 'stranger', deps), { status: 'denied' }); assert.equal(reads, 0)
const report = await buildNetworkReport('p', 'owner', deps)
assert.equal(report.status, 'complete'); assert.equal(report.members, 1); assert.equal(report.events, 1); assert.equal(report.earnings.netCents, 190)
assert.deepEqual(await buildNetworkReport('p', 'owner', { ...deps, earnings: async () => { throw new Error('incomplete') } }), { status: 'unavailable' })
assert.deepEqual(await buildNetworkReport('p', 'owner', { ...deps, space: async id => id === 'p' ? { ...parent, plan: 'business' } : child }), { status: 'denied' })
let offset = 0
const query = { order: () => query, range: from => { offset = from; return query }, then: resolve => Promise.resolve(resolve({ data: offset === 0 ? [1, 2] : [3], error: null })) }
assert.deepEqual((await completeEarningsRead(query, 2, 6)).data, [1, 2, 3])
await assert.rejects(completeEarningsRead({ ...query, order() { return this }, range() { return this }, then: resolve => Promise.resolve(resolve({ data: [1, 2], error: null })) }, 2, 4), /bound/)
assert.throws(() => assertUsdEarningsRows([{ currency: 'eur' }]), /currency/)
const read = path => fs.readFileSync(path, 'utf8')
assert.match(read('lib/collective/network-report.ts'), /spaceEarningsSummary\(id, undefined, true\)/)
assert.match(read('lib/collective/network-report.ts'), /eq\('is_active', true\).*eq\('is_demo', false\).*eq\('is_system', false\)/)
assert.match(read('app/(main)/spaces/[slug]/settings/reach/page.tsx'), /caller\?\.id === space\.ownerProfileId/)
assert.match(read('components/spaces/collective-network-report.tsx'), /report\.status === 'unavailable'/)
console.log('✓ collective report: owner gate, real source dedupe, complete totals, pagination and Reach wiring')
