// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { SpaceProfileMenuView } from './space-profile-menu-view'
import type { SpaceProfileTab } from '@/components/spaces/space-profile-tabs'

// THE SPACE MENU RAIL, MEASURED IN A DOM (LIVE-744).
//
// The menu is one horizontal scroll rail holding EVERY tab, with the owner's Manage entry pinned
// outside it. There is no browser in `pnpm test`, so this asserts structure, not pixels: every
// destination is a real link in the rail exactly once, nothing is folded behind a popup, and Manage
// is not a child of the box that scrolls.

let container: HTMLDivElement | null = null
let root: Root | null = null

afterEach(() => {
  if (root) act(() => root!.unmount())
  if (container) container.remove()
  root = null
  container = null
})

function mount(node: React.ReactNode) {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  act(() => root!.render(node))
  return container!
}

const base = '/spaces/temple'

/** Every dedicated tab a Space can earn, plus both UNBOUNDED sources (Home anchors, custom pages). */
const FULL: SpaceProfileTab[] = [
  { href: base, label: 'Home' },
  { href: `${base}#book`, label: 'Book' },
  { href: `${base}#offerings`, label: 'Offerings' },
  { href: `${base}#practices`, label: 'Practices' },
  { href: `${base}#faq`, label: 'FAQ' },
  { href: `${base}/calendar`, label: 'Calendar' },
  { href: `${base}/memberships`, label: 'Memberships' },
  { href: `${base}/collaborators`, label: 'Collaborators' },
  { href: `${base}/circles`, label: 'Circles' },
  { href: `${base}/people`, label: 'People' },
  { href: `${base}/contact`, label: 'Contact' },
  { href: `${base}/reviews`, label: 'Reviews' },
  { href: `${base}/shop`, label: 'The Apothecary' },
  { href: `${base}/retreats`, label: 'Retreats' },
  { href: `${base}/teachers`, label: 'Our teachers' },
]

const rail = (el: HTMLElement) => el.querySelector('[data-space-menu-rail]') as HTMLElement
const railHrefs = (el: HTMLElement) => [...rail(el).querySelectorAll('a[href]')].map((a) => a.getAttribute('href'))

describe('the rail holds every destination', () => {
  it('renders every tab as a link in the rail, exactly once, in order', () => {
    const el = mount(<SpaceProfileMenuView tabs={FULL} pathname={base} />)
    expect(railHrefs(el)).toEqual(FULL.map((t) => t.href))
  })

  it('folds nothing behind a popup', () => {
    const el = mount(<SpaceProfileMenuView tabs={FULL} pathname={base} canManage />)
    expect(el.querySelector('details')).toBeNull()
    expect(el.textContent).not.toMatch(/More in this Space/)
  })

  it('is the box that scrolls', () => {
    const el = mount(<SpaceProfileMenuView tabs={FULL} pathname={base} />)
    expect(rail(el).className).toContain('overflow-x-auto')
    expect(rail(el).className).toContain('min-w-0')
  })
})

describe('the owner keeps Manage pinned', () => {
  it('renders Manage outside the rail, so it never scrolls with the tabs', () => {
    const el = mount(<SpaceProfileMenuView tabs={FULL} pathname={base} canManage />)
    const nav = el.querySelector('nav[aria-label="Space menu"]') as HTMLElement
    const manage = [...nav.querySelectorAll('a[href]')].find((a) =>
      (a.getAttribute('href') ?? '').includes('panel=manage'),
    )
    expect(manage, 'the owner lost their Manage entry').toBeTruthy()
    expect(rail(el).contains(manage!)).toBe(false)
  })

  it('shows no Manage to a visitor', () => {
    const el = mount(<SpaceProfileMenuView tabs={FULL} pathname={base} />)
    expect(el.innerHTML).not.toContain('panel=manage')
  })
})

describe('the menu still answers "where am I"', () => {
  it('marks the current page, and only it', () => {
    const el = mount(<SpaceProfileMenuView tabs={FULL} pathname={`${base}/teachers`} />)
    const lit = [...el.querySelectorAll('[aria-current="page"]')].map((a) => a.getAttribute('href'))
    expect(lit).toEqual([`${base}/teachers`])
  })
})

// THE SAVED MENU (lib/spaces/site-menu.ts): a dropdown is a button that opens the mega panel outside
// the scroll rail, and a custom link off the Space opens in a new tab.
describe('the saved menu in the rail', () => {
  const tabs: SpaceProfileTab[] = [
    { href: `${base}/calendar`, label: 'Calendar' },
    { key: 'home', href: base, label: 'Home' },
    {
      href: `${base}/circles`,
      label: 'Sessions',
      mega: {
        links: [{ label: 'Circles', desc: 'Weekly groups', href: `${base}/circles` }],
        feature: { title: 'Book a call', desc: null, href: 'https://cal.test/a', img: null, pos: null },
      },
    },
    { href: 'https://etsy.test/shop', label: 'Shop', external: true },
  ]

  it('draws the dropdown closed, then opens its panel with the links and the card', () => {
    const el = mount(<SpaceProfileMenuView tabs={tabs} canManage pathname={base} homeHref={base} />)
    const button = [...el.querySelectorAll('button')].find((b) => b.textContent?.includes('Sessions'))!
    expect(button.getAttribute('aria-expanded')).toBe('false')
    act(() => button.click())
    expect(button.getAttribute('aria-expanded')).toBe('true')
    const panel = document.getElementById(button.getAttribute('aria-controls')!)!
    expect(panel.textContent).toContain('Weekly groups')
    expect(panel.querySelector('a[href="https://cal.test/a"]')?.getAttribute('target')).toBe('_blank')
  })

  it('opens a custom link in a new tab, finds Home by its key, and pins Manage to the Space index', () => {
    const el = mount(<SpaceProfileMenuView tabs={tabs} canManage pathname={base} homeHref={base} />)
    expect(el.querySelector('a[href="https://etsy.test/shop"]')?.getAttribute('target')).toBe('_blank')
    expect(el.querySelector(`a[href="${base}"]`)?.getAttribute('aria-current')).toBe('page')
    expect(el.querySelector(`a[href="${base}?panel=manage"]`)).not.toBeNull()
  })
})
