import { describe, it, expect } from 'vitest'
import * as Y from 'yjs'
import { Schema } from '@tiptap/pm/model'
import { textFragment, seedTextFragment, readTextFragment } from './text-binding'
import { applyRemote, encodeState } from './node-ydoc'

const schema = new Schema({
  nodes: {
    doc: { content: 'paragraph+' },
    paragraph: { content: 'text*', toDOM: () => ['p', 0] },
    text: {},
  },
})
const para = (t: string) => ({ type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: t }] }] })

describe('text binding', () => {
  it('refuses an address that could collide', () => {
    const d = new Y.Doc()
    expect(textFragment(d, 'a/b', 'body')).toBeNull()
    expect(textFragment(d, 'a', '')).toBeNull()
  })
  it('returns the same fragment for the same block field', () => {
    const d = new Y.Doc()
    expect(textFragment(d, 'n1', 'body')).toBe(textFragment(d, 'n1', 'body'))
    expect(textFragment(d, 'n1', 'body')).not.toBe(textFragment(d, 'n1', 'title'))
  })
  it('seeds once and reads back', () => {
    const d = new Y.Doc()
    const f = textFragment(d, 'n1', 'body')!
    expect(seedTextFragment(f, schema, para('hello'))).toBe(true)
    expect(seedTextFragment(f, schema, para('again'))).toBe(false)
    expect(JSON.stringify(readTextFragment(f))).toContain('hello')
    expect(JSON.stringify(readTextFragment(f))).not.toContain('again')
  })
  it('two docs converge on one text edit', () => {
    const a = new Y.Doc()
    seedTextFragment(textFragment(a, 'n1', 'body')!, schema, para('hello'))
    const b = new Y.Doc()
    applyRemote(b, encodeState(a))
    const fb = textFragment(b, 'n1', 'body')!
    expect(JSON.stringify(readTextFragment(fb))).toContain('hello')
    // b edits the paragraph's text node; a hears it
    const para0 = fb.get(0) as Y.XmlElement
    ;(para0.get(0) as Y.XmlText).insert(5, ' world')
    applyRemote(a, encodeState(b))
    expect(JSON.stringify(readTextFragment(textFragment(a, 'n1', 'body')!))).toContain('hello world')
  })
})
