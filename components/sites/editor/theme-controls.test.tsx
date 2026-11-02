// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeAll, expect, it, vi } from 'vitest'
import { dialsFor, looksFor, type ThemeEditorDecl } from '@/lib/theme/dials'
import { ThemeControls } from './theme-controls'

beforeAll(() => { Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true }) })
const cleanups: (() => void)[] = []
afterEach(() => { cleanups.splice(0).forEach((c) => c()) })

const ids = ['accent', 'register', 'corners', 'spacing', 'type', 'motion', 'hero', 'header', 'footer', 'image']
const decl: ThemeEditorDecl = {
  dials: Object.fromEntries(ids.map((i) => [i, 'supported'])),
  looks: [{ id: 'paper', label: 'Paper', dials: { register: 'day', type: 'editorial' } }],
}
const own = { register: 'night', type: 'caps', motion: 'full', hero: 'glow', image: 'glow', corners: 'soft', spacing: 'airy', header: 'bar', footer: 'full' }
const accents = [{ id: 'tide', label: 'Tide', swatch: 'var(--th-accent)' }, { id: 'bloom', label: 'Bloom', swatch: 'var(--th-accent-deep)' }]

function mount(over: Partial<Parameters<typeof ThemeControls>[0]> = {}) {
  const dials = dialsFor(decl, 'Services')
  const props = { dials, values: { ...own }, own, looks: looksFor(decl, dials), accents, accent: null, onChange: vi.fn(), onAccent: vi.fn(), onPreset: vi.fn(), onReset: vi.fn(), ...over }
  const host = document.createElement('div')
  document.body.append(host)
  const root = createRoot(host)
  act(() => root.render(<ThemeControls {...props} />))
  cleanups.push(() => { act(() => root.unmount()); host.remove() })
  return { host, props }
}
const click = (el: Element | undefined | null) => act(async () => { el?.dispatchEvent(new MouseEvent('click', { bubbles: true })) })
const radio = (host: HTMLElement, group: string, text: string) => [...host.querySelectorAll(`[role=radiogroup][aria-label="${group}"] [role=radio]`)].find((b) => b.textContent === text || b.getAttribute('aria-label') === text)

it('draws nothing for a theme with only the four legacy dials', () => {
  const { host } = mount({ dials: dialsFor(null) })
  expect(host.innerHTML).toBe('')
})

it('shows Simple at once: accent and register, and nothing from Advanced', () => {
  const { host } = mount()
  expect(host.querySelector('[role=radiogroup][aria-label=Accent]')).not.toBeNull()
  expect(host.querySelector('[role=radiogroup][aria-label=Register]')).not.toBeNull()
  expect(host.querySelector('[aria-label="Advanced controls"]')).toBeNull()
  expect(radio(host, 'Register', 'Night')?.getAttribute('aria-checked')).toBe('true')
})

it('stores nothing for the theme\'s own value and the choice otherwise', async () => {
  const { host, props } = mount()
  await click(radio(host, 'Register', 'Day'))
  expect(props.onChange).toHaveBeenLastCalledWith('register', 'day')
  await click(radio(host, 'Register', 'Night'))
  expect(props.onChange).toHaveBeenLastCalledWith('register', null)
  await click(radio(host, 'Accent', 'Bloom accent'))
  expect(props.onAccent).toHaveBeenLastCalledWith('bloom')
  await click(radio(host, 'Accent', 'Theme accent'))
  expect(props.onAccent).toHaveBeenLastCalledWith(null)
})

it('opens Advanced one tap down, grouped, with Looks first and Reset only after a change', async () => {
  const { host, props } = mount()
  const more = [...host.querySelectorAll('button')].find((b) => b.textContent?.startsWith('More'))!
  expect(more.querySelector('[data-changed]')).toBeNull()
  await click(more)
  const dialog = host.querySelector('[aria-label="Advanced controls"]')!
  expect([...dialog.querySelectorAll('section')].map((s) => s.getAttribute('aria-label'))).toEqual(['Shape', 'Type', 'Motion', 'Layout'])
  expect(radio(host, 'Looks', "Theme's own")?.getAttribute('aria-checked')).toBe('true')
  expect([...dialog.querySelectorAll('button')].some((b) => b.textContent === 'Reset to theme')).toBe(false)
  await click(radio(host, 'Looks', 'Paper'))
  expect(props.onPreset).toHaveBeenCalledWith(expect.objectContaining({ id: 'paper' }))
  await click(radio(host, 'Motion', 'Calm'))
  expect(props.onChange).toHaveBeenLastCalledWith('motion', 'calm')
})

it('marks a hidden change on More, shows Reset, and calls it', async () => {
  const { host, props } = mount({ values: { ...own, type: 'quiet' } })
  const more = [...host.querySelectorAll('button')].find((b) => b.textContent?.startsWith('More'))!
  expect(more.querySelector('[data-changed]')).not.toBeNull()
  await click(more)
  expect(radio(host, 'Looks', 'Paper')?.getAttribute('aria-checked')).toBe('false')
  await click([...host.querySelectorAll('button')].find((b) => b.textContent === 'Reset to theme'))
  expect(props.onReset).toHaveBeenCalledOnce()
})
