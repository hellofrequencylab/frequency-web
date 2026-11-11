// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import * as Y from 'yjs'
import { afterEach, expect, it } from 'vitest'
import { CollabTextEditor } from './collab-text-editor'
import { readTextFragment, textFragment } from '@/lib/editor-crdt/text-binding'
;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const seed = { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Hello' }] }] }
const mounted: { root: Root; el: HTMLDivElement }[] = []

async function mount(doc: Y.Doc, nid = 'n1', withSeed = true) {
  const el = document.createElement('div')
  document.body.appendChild(el)
  const root = createRoot(el)
  mounted.push({ root, el })
  await act(async () => {
    root.render(<CollabTextEditor doc={doc} nid={nid} field="body" seed={withSeed ? seed : undefined} label="Body" />)
  })
  await act(async () => { await new Promise((r) => setTimeout(r, 20)) })
  return el
}

afterEach(async () => {
  for (const { root, el } of mounted.splice(0)) { await act(async () => root.unmount()); el.remove() }
})

it('seeds the shared fragment and shows it', async () => {
  const doc = new Y.Doc()
  const el = await mount(doc)
  expect(el.textContent).toContain('Hello')
  expect(JSON.stringify(readTextFragment(textFragment(doc, 'n1', 'body')!))).toContain('Hello')
})

it('two docs joined by updates converge and the seed is not doubled', async () => {
  const a = new Y.Doc()
  const b = new Y.Doc()
  a.on('update', (u: Uint8Array, origin: unknown) => { if (origin !== 'b') Y.applyUpdate(b, u, 'a') })
  b.on('update', (u: Uint8Array, origin: unknown) => { if (origin !== 'a') Y.applyUpdate(a, u, 'b') })
  const left = await mount(a)
  const right = await mount(b)
  expect(right.textContent).toBe(left.textContent)
  expect(right.textContent?.match(/Hello/g)).toHaveLength(1)
})

it('renders nothing for an address containing a slash', async () => {
  const el = await mount(new Y.Doc(), 'a/b', false)
  expect(el.innerHTML).toBe('')
})
