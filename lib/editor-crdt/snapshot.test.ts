import { describe, it, expect } from 'vitest'
import * as Y from 'yjs'
import { upgradeLayout } from '../entity-blocks/node-tree'
import { snapshotForStorage } from './snapshot'
import { toYDoc } from './node-ydoc'
import { readPresence } from './awareness'

describe('snapshotForStorage', () => {
  it('returns a sanitized tree for a valid document', () => {
    const l = upgradeLayout({ rows: [{ id: 'r1', columns: 1, cells: [['about']] }] })!
    const s = snapshotForStorage(toYDoc(l), 'space')
    expect(s?.tree.rows[0].cells[0][0].type).toBe('about')
  })
  it('returns null for a corrupt or empty document instead of throwing', () => {
    expect(snapshotForStorage(new Y.Doc(), 'space')).toBeNull()
    const d = new Y.Doc()
    d.getMap('layout').set('rows', 42)
    expect(snapshotForStorage(d, 'space')).toBeNull()
  })
})

describe('readPresence', () => {
  it('clamps an untrusted payload', () => {
    const p = readPresence({ userId: 'u1', name: 'x'.repeat(200), color: 'red', selectedNid: '<script>' })
    expect(p).toEqual({ userId: 'u1', name: 'x'.repeat(40), color: '#888888', selectedNid: null })
  })
  it('rejects junk', () => {
    expect(readPresence(null)).toBeNull()
    expect(readPresence({ name: 'no id' })).toBeNull()
  })
})
