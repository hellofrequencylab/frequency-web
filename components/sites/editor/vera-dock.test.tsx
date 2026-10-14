// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterAll, beforeAll, expect, it } from 'vitest'
import { VeraDock } from './vera-dock'

beforeAll(() => { Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true }) })
afterAll(() => { Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: false }) })

it('keeps the command bar open in one labelled region, with its reply above the bar', () => {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  act(() => root.render(<VeraDock><p>Proposed rewrite</p><form><input aria-label="Ask Vera" /></form></VeraDock>))
  const region = container.querySelector<HTMLElement>('section[aria-label="Vera writing assistant"]')!
  expect(region.hidden).toBe(false)
  expect(region.querySelector('input[aria-label="Ask Vera"]')).not.toBeNull()
  expect(region.firstElementChild?.textContent).toBe('Proposed rewrite')
  act(() => root.unmount())
  container.remove()
})
