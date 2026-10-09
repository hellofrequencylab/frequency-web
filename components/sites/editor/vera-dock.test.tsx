// @vitest-environment jsdom
import { act, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { afterAll, beforeAll, expect, it } from 'vitest'
import { VeraDock } from './vera-dock'

beforeAll(() => { Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true }) })
afterAll(() => { Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: false }) })

it('starts collapsed and retains a proposal when hidden and reopened by keyboard', () => {
  function Proposal() {
    const [text, setText] = useState('Proposed rewrite')
    return <><p>{text}</p><button onClick={() => setText('Applied to draft')}>Apply</button></>
  }
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  act(() => root.render(<VeraDock><Proposal /></VeraDock>))
  const toggle = container.querySelector<HTMLButtonElement>('.we-vera-toggle')!
  const panel = container.querySelector<HTMLElement>('section')!
  expect(toggle.getAttribute('aria-expanded')).toBe('false')
  expect(toggle.getAttribute('aria-controls')).toBe(panel.id)
  expect(panel.hidden).toBe(true)
  act(() => toggle.click())
  expect(panel.hidden).toBe(false)
  const apply = Array.from(panel.querySelectorAll('button')).find((button) => button.textContent === 'Apply')!
  act(() => apply.click())
  apply.focus()
  act(() => apply.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })))
  expect(panel.hidden).toBe(true)
  expect(document.activeElement).toBe(toggle)
  act(() => toggle.click())
  expect(panel.textContent).toContain('Applied to draft')
  act(() => panel.querySelector<HTMLButtonElement>('[aria-label="Hide Vera"]')!.click())
  expect(panel.hidden).toBe(true)
  expect(toggle.getAttribute('aria-expanded')).toBe('false')
  act(() => root.unmount())
  container.remove()
})
