// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { BlockPicker } from './block-picker'
;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

// A Space with no services yet still sees Services in the picker, as a link to where the first one is made.

let root: Root, container: HTMLDivElement
beforeEach(() => { container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container) })
afterEach(async () => { await act(async () => root.unmount()); container.remove() })

describe('BlockPicker setup links', () => {
  it('offers Services as a link to the offerings settings when it has no data yet', () => {
    act(() =>
      root.render(
        <BlockPicker
          palette={[]}
          taken={new Set()}
          onPick={() => {}}
          onClose={() => {}}
          setup={[{ id: 'offerings', label: 'Offerings', description: 'Add your first one to put it on your page.', href: '/spaces/a/settings/offerings' }]}
        />,
      ),
    )
    const link = container.querySelector('a[href="/spaces/a/settings/offerings"]')
    expect(link?.textContent).toContain('Offerings')
    expect(container.textContent).toContain('Set up first')
    expect(container.textContent).not.toContain('Every block is already on your page')
  })

  it('shows no setup group without setup links', () => {
    act(() => root.render(<BlockPicker palette={[]} taken={new Set()} onPick={() => {}} onClose={() => {}} />))
    expect(container.textContent).not.toContain('Set up first')
  })
})
