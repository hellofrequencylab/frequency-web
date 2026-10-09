#!/usr/bin/env node
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import ts from 'typescript'
import { invokedDirectly } from '../lib/invoked-directly.mjs'

// Exercise shipped enqueue/provider code in-process. Only external transports are replaced;
// never scan the full repository or start a test runner inside a per-row consequence probe.
export async function verifyEmailDeliveryContract() {
  const queued = [], sent = []
  let suppressed = false
  const oldKey = process.env.RESEND_API_KEY
  const oldFlags = ['EMAIL_PROVIDER_ACCEPTANCE_ENABLED','EMAIL_DISPATCH_POLICY_ENABLED'].map(key => [key, process.env[key]])
  for (const [key] of oldFlags) process.env[key] = 'false'
  process.env.RESEND_API_KEY = 'fixture-only-no-network'
  const modules = new Map()
  const transports = new Map([
    ['@/lib/supabase/admin', { createAdminClient: () => { throw Error('Unexpected database transport in contract probe') } }],
    ['resend', { Resend: class { emails = { send: async payload => { sent.push(payload); return { data:{id:'provider-fixture'},error:null } } } } }],
    ['@/lib/queue/outbox', { enqueue: async (kind,payload,options) => { queued.push({kind,payload,options}) } }],
    ['@/lib/suppression', { isSuppressed: async () => suppressed }],
    ['@/lib/unsubscribe-tokens', { buildUnsubscribeUrl: () => { throw Error('Unexpected unsubscribe transport') } }],
    ['@/lib/env/string', { envString: (_key,fallback) => fallback }],
    ['@/lib/email-studio/postal', { PLATFORM_POSTAL_LINE:'Fixture address' }],
  ])
  const load = file => {
    if (modules.has(file)) return modules.get(file).exports
    const compiledModule = { exports:{} }; modules.set(file,compiledModule)
    const compiled = ts.transpileModule(readFileSync(resolve(file),'utf8'), { compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022} }).outputText
    const localRequire = name => {
      if (transports.has(name)) return transports.get(name)
      if (name === '@/lib/comms/email-provider-acceptance') return load('lib/comms/email-provider-acceptance.ts')
      if (name === '@/lib/queue/terminal-error') return load('lib/queue/terminal-error.ts')
      if (name === '@/lib/comms/email-delivery-contract') return load('lib/comms/email-delivery-contract.ts')
      throw Error(`Unexpected probe dependency: ${name}`)
    }
    new Function('module','exports','require',compiled)(compiledModule,compiledModule.exports,localRequire)
    return compiledModule.exports
  }
  try {
    const { readEmailDeliveryContext } = load('lib/comms/email-delivery-contract.ts')
    const { enqueueEmail, sendRawEmail } = load('lib/email.ts')
    const context = {version:1,logicalSendKey:'reply:fixture',recipientKey:'contact:fixture',spaceId:'space:fixture',purpose:'human-reply',topic:null,identity:{kind:'frequency',identityId:null,revision:null},source:{kind:'conversation',id:'conversation:fixture'}}
    assert.equal(readEmailDeliveryContext(undefined),undefined,'Legacy purpose must not be invented')
    const parsed = readEmailDeliveryContext({...context,secret:'discard'})
    assert.deepEqual(parsed,context); assert.notEqual(parsed.identity,context.identity)
    const payload = {to:'fixture@example.test',subject:'Controlled fixture',html:'<p>Fixture</p>',deliveryContext:context}
    await enqueueEmail(payload,{dedupeKey:'reply:fixture'})
    assert.equal(queued.length,1); assert.equal(queued[0].kind,'email')
    assert.deepEqual(queued[0].payload.deliveryContext,context)
    assert.equal(queued[0].options.dedupeKey,'reply:fixture')
    assert.deepEqual(await sendRawEmail(queued[0].payload),{id:'provider-fixture'})
    assert.equal(sent.length,1); assert.equal(sent[0].subject,payload.subject)
    assert.equal(Object.hasOwn(sent[0],'deliveryContext'),false,'Internal provenance cannot leak to provider')
    for (const invalid of [null,{}, {...context,version:2}, {...context,logicalSendKey:''}, {...context,purpose:'transactional-bypass'}, {...context,spaceId:null,identity:{kind:'space',identityId:'identity',revision:'1'}}, {...context,purpose:'platform-security'}]) {
      assert.throws(()=>readEmailDeliveryContext(invalid))
      await assert.rejects(()=>enqueueEmail({...payload,deliveryContext:invalid}))
      await assert.rejects(()=>sendRawEmail({...payload,deliveryContext:invalid}))
    }
    assert.equal(queued.length,1); assert.equal(sent.length,1,'Malformed context cannot reach transports')
    const legacy = {...payload}; delete legacy.deliveryContext
    await enqueueEmail(legacy)
    assert.equal(Object.hasOwn(queued[1].payload,'deliveryContext'),false)
    suppressed = true
    assert.deepEqual(await sendRawEmail(legacy),{id:null}); assert.equal(sent.length,1)
    console.log('ok: real email enqueue preserves valid provenance; provider strips it; invalid context and suppression stop delivery')
    return 0
  } finally {
    for (const [key,value] of oldFlags) { if (value === undefined) delete process.env[key]; else process.env[key] = value }
    if (oldKey === undefined) delete process.env.RESEND_API_KEY
    else process.env.RESEND_API_KEY = oldKey
  }
}

if (invokedDirectly(import.meta.url)) process.exitCode = await verifyEmailDeliveryContract()
