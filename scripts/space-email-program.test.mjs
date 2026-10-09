import { test } from 'node:test'
import assert from 'node:assert/strict'
import { derivePackets } from './space-email-program.mjs'
const spec = { program: 'PROG-EMAIL1', packets: [{key:'a',dependsOn:[]},{key:'b',dependsOn:['a']}] }
const row = (key,status='done') => ({id:`ROW-${key}`,status,source:{ref:`PROG-EMAIL1 packet:${key}`}})
test('dependent work waits for canonical completion', () => {
  assert.deepEqual(derivePackets(spec, []).ready.map(p=>p.key), ['a'])
  assert.deepEqual(derivePackets(spec, [row('a','open')]).waiting[0].waitingFor, ['a'])
  assert.deepEqual(derivePackets(spec, [row('a')]).ready.map(p=>p.key), ['b'])
})
test('blocked and parked rows stay visible and are never silently replaced', () => {
  for (const status of ['blocked','parked']) {
    const result=derivePackets(spec,[row('a',status)])
    assert.equal(result.active.length,0)
    assert.equal(result.waiting[0].canonicalStatus,status)
  }
})
test('foreign programs and prefix matches cannot close a packet', () => {
  const foreign={...row('a'),source:{ref:'PROG-OTHER packet:a'}}
  const prefix={...row('a'),source:{ref:'PROG-EMAIL10 packet:a'}}
  assert.equal(derivePackets(spec,[foreign,prefix,row('ab')]).complete.length,0)
})
test('duplicate claims and invalid dependency graphs stop coordination', () => {
  assert.throws(()=>derivePackets(spec,[row('a'),row('a')]),/Multiple canonical/)
  assert.throws(()=>derivePackets({program:'P',packets:[{key:'x',dependsOn:['no']} ]},[]),/Unknown dependency/)
  assert.throws(()=>derivePackets({program:'P',packets:[{key:'x',dependsOn:['y']},{key:'y',dependsOn:['x']}]},[]),/cycle/)
})
