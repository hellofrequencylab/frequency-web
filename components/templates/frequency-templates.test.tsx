// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'

// THE PAGE SHELLS AND CARDS UNDER FREQUENCY (ADR-1737). A Frequency build opens every templated page
// with the members kit's `.head` and lays its cards as kit `.card`s, so a route whose body was never
// rebuilt still reads as the design. DAWN's own markup is held by the tests beside this file.
vi.mock('@/lib/theme/design', async (orig) => ({ ...(await orig<object>()), SITE_DESIGN: 'frequency' }))
vi.mock('next/navigation', () => ({ usePathname: () => '/codes' }))
vi.mock('@/components/layout/page-admin-context', () => ({ usePageAdmin: () => ({ role: null, staffRole: null }) }))

const { PageHeading } = await import('./page-heading')
const { DashboardTemplate } = await import('./dashboard-template')
const { DetailTemplate } = await import('./detail-template')
const { WizardShell, wizardPrimaryClass, wizardSecondaryClass } = await import('./wizard-shell')
const { EntityCard } = await import('@/components/cards/entity-card')
const { RowCard } = await import('@/components/cards/row-card')

const doc = (node: React.ReactNode) => {
  const host = document.createElement('div')
  host.innerHTML = renderToStaticMarkup(<>{node}</>)
  return host
}

describe('PageHeading is the kit .head', () => {
  it('renders the eyebrow, Unbounded title, meta line and actions in the design lockup', () => {
    const h = doc(
      <PageHeading eyebrow="You" title="My codes" description="Every code you made." actions={<button>New</button>} back={{ href: '/you', label: 'You' }} />,
    )
    const head = h.querySelector('.head')!
    expect(head.querySelector('.k')?.textContent).toBe('You')
    expect(head.querySelector('h1')?.className).toBe('h1')
    expect(head.querySelector('h1')?.textContent).toBe('My codes')
    expect(head.querySelector('.meta')?.textContent).toBe('Every code you made.')
    expect(head.querySelector('.mu-actions button')?.textContent).toBe('New')
    expect(head.querySelector('a.mu-back')?.getAttribute('href')).toBe('/you')
    // No DAWN page-title role and no hairline rule under the head.
    expect(h.innerHTML).not.toMatch(/text-page-title|border-b border-border/)
  })
})

describe('the shells', () => {
  it('lays a dashboard stat row on the kit grid', () => {
    const d = doc(<DashboardTemplate title="Orders" stats={<div>s</div>}>body</DashboardTemplate>)
    expect(d.querySelector('.g4.mu-stats')).toBeTruthy()
    expect(d.querySelector('.mu-flow')?.textContent).toBe('body')
  })
  it('gives a detail page the kit title and .tabs strip', () => {
    const d = doc(
      <DetailTemplate title="Breathwork" subtitle="Daily" tabs={[{ href: '/practices/1', label: 'About', active: true }, { href: '/practices/1/log', label: 'Log' }]}>
        x
      </DetailTemplate>,
    )
    expect(d.querySelector('h1')?.className).toBe('h1')
    expect(d.querySelector('.meta')?.textContent).toBe('Daily')
    expect(d.querySelector('nav.tabs a.on')?.textContent).toBe('About')
  })
  it('stamps the wizard room with the kit and its buttons with .btn', () => {
    expect(wizardPrimaryClass).toBe('btn pa lg')
    expect(wizardSecondaryClass).toBe('btn lg')
    const w = doc(
      <WizardShell step={2} totalSteps={3} title="Name it" onNext={() => {}} onBack={() => {}}>
        x
      </WizardShell>,
    )
    expect(w.querySelector('main')?.getAttribute('data-kit')).toBe('members')
    expect(w.querySelectorAll('.mu-steps > span.on').length).toBe(2)
    expect(w.innerHTML).not.toContain('font-display')
  })
})

describe('the cards', () => {
  it('renders an entity card as a kit .card with the .h3 title', () => {
    const c = doc(<EntityCard href="/circles/a" title="Sunrise" context="La Jolla" meta={<span>12 members</span>} />).firstElementChild!
    expect(c.className).toBe('card mu-ecard')
    expect(c.querySelector('a')?.getAttribute('href')).toBe('/circles/a')
    expect(c.querySelector('.h3')?.textContent).toBe('Sunrise')
    expect(c.querySelector('.t2')?.textContent).toBe('La Jolla')
    expect(c.className).not.toMatch(/rounded-2xl|border-border/)
  })
  it('renders a row card as a kit .card row, linked or managed', () => {
    const linked = doc(<RowCard href="/orders/1" title="Order 1" context="Paid" />).firstElementChild!
    expect(linked.tagName).toBe('A')
    expect(linked.className).toBe('card mu-row')
    const managed = doc(<RowCard href="/orders/1" title="Order 1" actions={<button>Refund</button>} />).firstElementChild!
    expect(managed.className).toBe('card mu-row mu-managed')
    expect(managed.querySelector('a.t1')?.getAttribute('href')).toBe('/orders/1')
  })
})
