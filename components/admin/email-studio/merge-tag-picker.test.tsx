// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { MergeTagPicker, insertAtCursor } from './merge-tag-picker'
;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

// EMAIL-034. Picking a merge tag types it at the cursor of the field the operator was in.

let root: Root, container: HTMLDivElement
beforeEach(() => { container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container) })
afterEach(async () => { await act(async () => root.unmount()); container.remove() })

describe('insertAtCursor', () => {
  it('splices the text into the focused input at the caret', () => {
    const input = document.createElement('input')
    input.value = 'Hello !'
    document.body.appendChild(input)
    input.focus()
    input.setSelectionRange(6, 6)
    expect(insertAtCursor('{{ x }}')).toBe(true)
    expect(input.value).toBe('Hello {{ x }}!')
    input.remove()
  })

  it('reports false when nothing editable has focus', () => {
    ;(document.activeElement as HTMLElement | null)?.blur()
    expect(insertAtCursor('{{ x }}')).toBe(false)
  })
})

describe('MergeTagPicker', () => {
  it('hands the picked tag to onInsert and closes', async () => {
    const got: string[] = []
    await act(async () => root.render(<MergeTagPicker onInsert={(t) => { got.push(t); return true }} />))
    await act(async () => (container.querySelector('button') as HTMLButtonElement).click())
    const item = container.querySelector('[role="menuitem"]') as HTMLButtonElement
    const token = item.querySelector('.font-mono')!.textContent!
    await act(async () => item.click())
    expect(got).toEqual([token])
    expect(container.querySelector('[role="menu"]')).toBeNull()
  })
})
