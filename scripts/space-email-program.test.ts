import { expect, test } from 'vitest'
import { derivePackets } from './space-email-program.mjs'
const spec = { program: 'PROG-EMAIL1', packets: [{key:'a',dependsOn:[]},{key:'b',dependsOn:['a']}] }
const row = (key: string, status = 'done') => ({id:`ROW-${key}`,status,source:{ref:`PROG-EMAIL1 packet:${key}`}})
test('dependent work waits for canonical completion', () => {
  expect(derivePackets(spec, []).ready.map((p: { key: string }) => p.key)).toEqual(['a'])
  expect((derivePackets(spec, [row('a','open')]).waiting as Array<{ waitingFor: string[] }>)[0].waitingFor).toEqual(['a'])
  expect(derivePackets(spec, [row('a')]).ready.map((p: { key: string }) => p.key)).toEqual(['b'])
})
test('blocked and parked rows stay visible and are never silently replaced', () => {
  for (const status of ['blocked','parked']) {
    const result=derivePackets(spec,[row('a',status)])
    expect(result.active.length).toBe(0)
    expect((result.waiting as Array<{ canonicalStatus: string }>)[0].canonicalStatus).toBe(status)
  }
})
test('foreign programs and prefix matches cannot close a packet', () => {
  const foreign={...row('a'),source:{ref:'PROG-OTHER packet:a'}}
  const prefix={...row('a'),source:{ref:'PROG-EMAIL10 packet:a'}}
  expect(derivePackets(spec,[foreign,prefix,row('ab')]).complete.length).toBe(0)
})
test('duplicate claims and invalid dependency graphs stop coordination', () => {
  expect(() => derivePackets(spec,[row('a'),row('a')])).toThrow(/Multiple canonical/)
  expect(() => derivePackets({program:'P',packets:[{key:'x',dependsOn:['no']} ]},[])).toThrow(/Unknown dependency/)
  expect(() => derivePackets({program:'P',packets:[{key:'x',dependsOn:['y']},{key:'y',dependsOn:['x']}]},[])).toThrow(/cycle/)
})
