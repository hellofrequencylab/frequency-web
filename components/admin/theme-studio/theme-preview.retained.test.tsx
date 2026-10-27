// @vitest-environment jsdom
import React, { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, expect, it } from 'vitest'
import { ThemePreview } from './theme-preview'
import { validateThemeTokens } from '@/lib/theme/validate'
let root: Root | undefined
afterEach(() => { if (root) act(() => root!.unmount()); root = undefined; document.body.innerHTML = '' })
it('the actual janitor preview retains validated light/dark and feel tokens without the old formatter', () => {
  const tokens = validateThemeTokens({ light: { '--color-canvas': '#ffffff', '--color-text': '#111111' }, dark: { '--color-canvas': '#111111', '--color-text': '#ffffff' }, feel: { '--radius-card': '20px' } })
  const container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
  act(() => root!.render(<ThemePreview tokens={tokens} />))
  const wrapper = () => [...container.querySelectorAll<HTMLElement>('[style]')].find(e => e.style.getPropertyValue('--color-canvas'))!
  expect(wrapper().style.getPropertyValue('--color-canvas')).toBe('#ffffff')
  expect(wrapper().style.getPropertyValue('--color-text')).toBe('#111111')
  expect(wrapper().style.getPropertyValue('--radius-card')).toBe('20px')
  act(() => [...container.querySelectorAll('button')].find(e => e.textContent?.includes('Dark'))!.click())
  expect(wrapper().style.getPropertyValue('--color-canvas')).toBe('#111111')
  expect(wrapper().style.getPropertyValue('--color-text')).toBe('#ffffff')
  expect(wrapper().style.getPropertyValue('--radius-card')).toBe('20px')
  act(() => [...container.querySelectorAll('button')].find(e => e.textContent?.includes('Light'))!.click())
  expect(wrapper().style.getPropertyValue('--color-canvas')).toBe('#ffffff')
})
