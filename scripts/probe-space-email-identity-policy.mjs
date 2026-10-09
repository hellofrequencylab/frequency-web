import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import ts from 'typescript'
import { invokedDirectly } from './lib/invoked-directly.mjs'

function load(file, dependencies = {}) {
  const output = ts.transpileModule(readFileSync(file, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText
  const exports = {}
  new Function('require', 'exports', output)(name => {
    assert.ok(Object.hasOwn(dependencies, name), `Unexpected dependency ${name}`)
    return dependencies[name]
  }, exports)
  return exports
}

export function verifySpaceEmailIdentityPolicy() {
  const plans = load('lib/pricing/plans.ts')
  // Membership/role IO is deliberately unavailable; the real pure entitlement reader runs.
  const entitlements = load('lib/spaces/entitlements.ts', { './membership': {}, '@/lib/core/roles': {} })
  const { spaceEmailIdentityPolicy: policy } = load('lib/spaces/email-identity-policy.ts', {
    '@/lib/pricing/plans': plans, './entitlements': entitlements,
  })
  const identity = { id: 'sender', spaceId: 'space', sendingVerified: true, paused: false }
  const custom = { kind: 'space', identityId: 'sender' }
  const make = (plan, overrides = {}) => ({ id: 'space', plan,
    entitlements: { billing: Object.fromEntries(plans.planKeysWithAddons(plan, []).map(key => [key, true])), ...overrides } })
  for (const plan of plans.SPACE_PLANS) {
    const space = make(plan)
    assert.equal(plans.planKeysWithAddons(plan, []).includes(plans.SPACE_EMAIL_CUSTOM_IDENTITY_KEY), plan !== 'free')
    assert.equal(policy(space, custom, identity).allowed, plan !== 'free')
    assert.equal(policy(space, { kind: 'frequency' }).allowed, true)
  }
  assert.equal(policy(make('business', { [plans.SPACE_EMAIL_CUSTOM_IDENTITY_KEY]: false }), custom, identity).allowed, false)
  const paid = make('business')
  assert.equal(policy({ ...paid, plan: 'free' }, custom, identity).allowed, false)
  assert.equal(policy({ ...paid, plan: 'invented' }, custom, identity).allowed, false)
  assert.equal(policy(null, custom, identity).allowed, false)
  assert.equal(policy({ ...paid, entitlements: { custom_domain: true } }, custom, identity).allowed, false)
  for (const loaded of [null, { ...identity, id: 'other' }, { ...identity, spaceId: 'other' },
    { ...identity, paused: true }, { ...identity, sendingVerified: false }]) {
    assert.equal(policy(paid, custom, loaded).allowed, false)
  }
  console.log('ok: real paid identity policy, revocation, downgrade and tenant consequences')
}
if (invokedDirectly(import.meta.url)) verifySpaceEmailIdentityPolicy()
