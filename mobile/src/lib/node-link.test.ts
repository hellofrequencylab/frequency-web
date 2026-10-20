/// <reference types="node" />
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parseNodeLink } from './node-link.ts'

const HOSTS = ['frequencylocal.com']
const ID = '4b3f1c2e-8d7a-4c1b-9e2f-1a2b3c4d5e6f'

test('the site link, the app scheme and a bare path all parse', () => {
  assert.deepEqual(parseNodeLink(`https://frequencylocal.com/n/${ID}?s=v1.k2.abc_-`, HOSTS), { nodeId: ID, secret: 'v1.k2.abc_-' })
  assert.deepEqual(parseNodeLink(`https://www.frequencylocal.com/n/${ID}/`, HOSTS), { nodeId: ID, secret: null })
  assert.deepEqual(parseNodeLink(`frequency://n/${ID}?x=1&s=v1.a.b`, HOSTS), { nodeId: ID, secret: 'v1.a.b' })
  assert.deepEqual(parseNodeLink(`/n/${ID.toUpperCase()}?s=v1.a.b`, HOSTS), { nodeId: ID, secret: 'v1.a.b' })
})

test('anything else is not a check-in', () => {
  assert.equal(parseNodeLink(`https://evil.example/n/${ID}?s=x`, HOSTS), null)
  assert.equal(parseNodeLink('https://frequencylocal.com/n/not-a-uuid', HOSTS), null)
  assert.equal(parseNodeLink(`https://frequencylocal.com/events/${ID}`, HOSTS), null)
  assert.equal(parseNodeLink('hello', HOSTS), null)
})
