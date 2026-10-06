// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { PWYW_CONFIG_DEFAULT } from '@/lib/pricing/catalog-config'

// LIVE-755 (ADR-1709, Phase 4 done-when): the Crew picker shows the three catalog presets with the
// suggested one selected, says "contribute what you want" (ADR-1084), carries one impact line, and
// offers a real "Not right now".

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

vi.mock('./actions', () => ({ startMembershipCheckout: vi.fn(), settleMembershipCheckoutAction: vi.fn() }))
vi.mock('@/components/billing/checkout-panel', () => ({ default: () => null }))
vi.mock('@/lib/billing/stripe-browser', () => ({ warmStripeBrowser: () => {} }))

const { PwywPicker } = await import('./pwyw-picker')

let container: HTMLDivElement | null = null
let root: Root | null = null

afterEach(() => {
  if (root) act(() => root!.unmount())
  if (container) container.remove()
  root = null
  container = null
})

function mount() {
  const c = PWYW_CONFIG_DEFAULT
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  act(() =>
    root!.render(
      <PwywPicker presetCents={c.presetCents} suggestedCents={c.suggestedCents} minCents={c.minCents} maxCents={c.maxCents} />,
    ),
  )
  return container
}

describe('the Crew picker (LIVE-755)', () => {
  it('shows three presets with the suggested $10 selected', () => {
    const el = mount()
    const presets = [...el.querySelectorAll('button[aria-pressed]')]
    expect(presets.map((b) => b.textContent)).toEqual(['$4.99', '$10', '$25'])
    const selected = presets.filter((b) => b.getAttribute('aria-pressed') === 'true')
    expect(selected.map((b) => b.textContent)).toEqual(['$10'])
  })

  it('says contribute what you want, with one impact line and a Not right now way out', () => {
    const el = mount()
    expect(el.textContent).toContain('Contribute what you want.')
    expect(el.textContent).not.toMatch(/pay what/i)
    expect(el.querySelectorAll('[data-crew-impact]')).toHaveLength(1)
    const notNow = el.querySelector('[data-crew-not-now]')
    expect(notNow?.textContent).toBe('Not right now')
    expect(notNow?.getAttribute('href')).toBeTruthy()
  })
})
