// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { FqTabBar, tabActive } from './tab-bar'

// THE FREQUENCY PHONE TAB BAR: DAWN's five slots in DAWN's order (Menu · Feed · Zap · Events ·
// Marketplace), the destinations from the one registry, the active tab marked for a screen reader, and
// Menu and Zap as the toggles for the header's drawer and Zap sheet.

let root: Root | null = null
let host: HTMLDivElement | null = null
afterEach(() => {
  act(() => root?.unmount())
  host?.remove()
  root = null
  host = null
})

function render(props: Partial<React.ComponentProps<typeof FqTabBar>> = {}) {
  host = document.createElement('div')
  document.body.appendChild(host)
  root = createRoot(host)
  const all = {
    pathname: '/events/abc',
    viewer: { role: 'member' as const, staffRole: null, operatesSpaces: false },
    menuOpen: false,
    zapOpen: false,
    onMenu: vi.fn(),
    onZap: vi.fn(),
    menuCount: 0,
    ...props,
  }
  act(() => root!.render(<FqTabBar {...all} />))
  return { host, ...all }
}

describe('FqTabBar', () => {
  it('draws Menu, Feed, Zap, Events and Marketplace in that order', () => {
    const { host } = render()
    const labels = Array.from(host.querySelectorAll('.fqm-tb-l')).map((e) => e.textContent)
    expect(labels).toEqual(['Menu', 'Feed', 'Zap', 'Events', 'Marketplace'])
    expect(host.querySelector('a[href="/feed"]')).not.toBeNull()
    expect(host.querySelector('a[href="/events"]')).not.toBeNull()
    expect(host.querySelector('a[href="/marketplace"]')).not.toBeNull()
  })

  it('marks the tab for the page you are on, and none while a menu is open', () => {
    expect(render().host.querySelector('[aria-current="page"]')?.getAttribute('href')).toBe('/events')
    act(() => root?.unmount())
    expect(render({ menuOpen: true }).host.querySelector('[aria-current="page"]')).toBeNull()
  })

  it('Menu and Zap call their toggles and report their state', () => {
    const { host, onMenu, onZap } = render({ zapOpen: true })
    const menu = host.querySelector<HTMLButtonElement>('button[aria-controls="fqm-drawer"]')!
    const zap = host.querySelector<HTMLButtonElement>('button[aria-controls="fqm-zap"]')!
    expect(zap.getAttribute('aria-expanded')).toBe('true')
    expect(menu.getAttribute('aria-expanded')).toBe('false')
    act(() => menu.click())
    act(() => zap.click())
    expect(onMenu).toHaveBeenCalledOnce()
    expect(onZap).toHaveBeenCalledOnce()
  })

  it('tabActive matches the route and the pages under it, not a lookalike prefix', () => {
    expect(tabActive('/events', '/events')).toBe(true)
    expect(tabActive('/events/x', '/events')).toBe(true)
    expect(tabActive('/eventsy', '/events')).toBe(false)
  })
})
