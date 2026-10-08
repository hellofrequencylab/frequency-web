import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { memberSpaceCapacity, memberSpacePlan } from '../lib/collective/member-spaces.ts'

assert.equal(memberSpaceCapacity([]), 5)
assert.equal(memberSpaceCapacity([
  { item_key: 'collective_space', status: 'active', quantity: 3 },
  { item_key: 'collective_space', status: 'canceled', quantity: 9 },
  { item_key: 'operator_seat', status: 'active', quantity: 30 },
]), 8)
assert.equal(memberSpacePlan('free', { plan: 'collective', status: 'active' }), 'business')
assert.equal(memberSpacePlan('free', { plan: 'nonprofit_collective', status: 'active' }), 'business')
assert.equal(memberSpacePlan('free', { plan: 'collective', status: 'suspended' }), 'free')
assert.equal(memberSpacePlan('free', { plan: 'business', status: 'active' }), 'free')
assert.equal(memberSpacePlan('free', null), 'free')
assert.equal(memberSpacePlan('nonprofit', { plan: 'collective', status: 'active' }), 'nonprofit')
const sql = readFileSync('supabase/migrations/20270346006700_collective_member_spaces.sql', 'utf8')
assert.match(sql, /order by id for update/)
assert.match(sql, /v_parent.owner_profile_id is distinct from p_owner_id/)
assert.match(sql, /v_child.owner_profile_id is distinct from p_owner_id/)
assert.match(sql, /v_used >= v_capacity/)
assert.match(sql, /collective_space_change_until > clock_timestamp/)
const purchase = readFileSync('lib/collective/extra-space-billing.ts', 'utf8')
assert.match(purchase, /stripe.subscriptions.update/)
assert.match(purchase, /begin_collective_space_change/)
assert.match(purchase, /await reconcileSpacePlanSubscription/)
assert.match(purchase, /target < quote.minQuantity/)
assert.match(purchase, /quote.priceId !== expectedPriceId/)
assert.match(purchase, /fresh.sub/)
assert.match(readFileSync('app/(main)/spaces/[slug]/settings/billing/member-space-editor.tsx', 'utf8'), /Save extra Spaces/)
assert.match(sql, /revoke all on function[^;]+from public, anon, authenticated/)
assert.match(readFileSync('lib/spaces/store.ts', 'utf8'), /memberSpacePlan\(r.plan/)
assert.match(readFileSync('lib/pricing/payments-gate.ts', 'utf8'), /await inheritedSpacePlan\(spaceId, plan\)/)
assert.match(readFileSync('lib/pricing/space-allowance.ts', 'utf8'), /await inheritedSpacePlan\(id, row.plan/)
assert.match(readFileSync('app/(main)/spaces/[slug]/settings/billing/billing-body.tsx', 'utf8'), /<MemberSpaceEditor/)
console.log('ok: Collective ownership, capacity and cancellation-safe Business inheritance')
