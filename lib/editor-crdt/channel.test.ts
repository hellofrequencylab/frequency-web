import { describe, it, expect } from 'vitest'
import * as Y from 'yjs'
import { upgradeLayout } from '../entity-blocks/node-tree'
import { toYDoc, encodeState, applyRemote, serializeLayout } from './node-ydoc'
import { editorTopic, parseEditorTopic, encodeUpdate, decodeUpdate, MAX_UPDATE_BYTES } from './channel'

const ID = '0b6a3c1e-6b7e-4c1e-9a53-1d2f3a4b5c6d'

describe('editor topic', () => {
  it('round trips kind and id', () => {
    const t = editorTopic('site', ID)
    expect(t).toBe(`editor:site:${ID}`)
    expect(parseEditorTopic(t!)).toEqual({ kind: 'site', entityId: ID })
  })
  it('refuses a bad kind or id, and a topic that is not an editor topic', () => {
    expect(editorTopic('space', "x'; drop")).toBeNull()
    expect(editorTopic('nope' as never, ID)).toBeNull()
    expect(parseEditorTopic('member:' + ID)).toBeNull()
    expect(parseEditorTopic('editor:nope:' + ID)).toBeNull()
    expect(parseEditorTopic(`editor:space:${ID}:extra`)).toBeNull()
  })
})

describe('update envelope', () => {
  it('carries a real Yjs state to a second doc', () => {
    const l = upgradeLayout({ rows: [{ id: 'r1', columns: 1, cells: [['about']] }] })!
    const a = toYDoc(l)
    const env = encodeUpdate(encodeState(a))!
    const b = new Y.Doc()
    applyRemote(b, decodeUpdate(JSON.parse(JSON.stringify(env)))!)
    expect(serializeLayout(b).rows[0].cells[0][0].type).toBe('about')
  })
  it('drops oversize, empty, malformed and wrong-version payloads', () => {
    expect(encodeUpdate(new Uint8Array(0))).toBeNull()
    expect(encodeUpdate(new Uint8Array(MAX_UPDATE_BYTES + 1))).toBeNull()
    expect(decodeUpdate(null)).toBeNull()
    expect(decodeUpdate({ v: 2, u: 'AAAA' })).toBeNull()
    expect(decodeUpdate({ v: 1, u: 'not base64!!' })).toBeNull()
    expect(decodeUpdate({ v: 1, u: 'A'.repeat(MAX_UPDATE_BYTES * 2) })).toBeNull()
    expect(decodeUpdate({ v: 1, u: '' })).toBeNull()
  })
})
