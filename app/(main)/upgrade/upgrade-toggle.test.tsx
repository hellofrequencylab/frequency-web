// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { sourceWithoutComments } from '@/test/source-shape'

// SCAN-773. The beta toggle calls toggleMembership, which refuses whenever billingLive() is true
// (LIVE-090). Two things used to hide that refusal: the page showed the toggle whenever Crew was
// not SELLABLE (billing on + tier switch off included), and the toggle acted only on success, so a
// refused tap was a spinner that stopped. Pinned here: the toggle renders the action's error, and
// the page gates the beta toggle on billing being off, the same condition the server checks.

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const toggleMembership = vi.fn()
const refresh = vi.fn()
vi.mock('./actions', () => ({ toggleMembership: () => toggleMembership() }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh }) }))

const { UpgradeToggle } = await import('./upgrade-toggle')

let container: HTMLDivElement | null = null
let root: Root | null = null

afterEach(() => {
  toggleMembership.mockReset()
  refresh.mockReset()
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
  return container
}

async function tap(el: HTMLElement) {
  await act(async () => {
    el.querySelector('button')!.click()
    await Promise.resolve()
  })
}

describe('UpgradeToggle surfaces a refused toggle', () => {
  it('renders the action error in a role=alert and does not refresh', async () => {
    toggleMembership.mockResolvedValue({ error: 'Manage your membership in billing.' })
    const el = mount(<UpgradeToggle isCrew={false} />)
    expect(el.querySelector('[role="alert"]')).toBeNull()
    await tap(el)
    const alert = el.querySelector('[role="alert"]')
    expect(alert?.textContent).toBe('Manage your membership in billing.')
    expect(alert?.className).toContain('text-danger')
    expect(refresh).not.toHaveBeenCalled()
  })

  it('shows the error for a Crew member switching back too', async () => {
    toggleMembership.mockResolvedValue({ error: 'Manage your membership in billing.' })
    const el = mount(<UpgradeToggle isCrew={true} />)
    await tap(el)
    expect(el.querySelector('[role="alert"]')?.textContent).toBe('Manage your membership in billing.')
  })

  it('refreshes on success and shows no alert', async () => {
    toggleMembership.mockResolvedValue({ data: { tier: 'crew' } })
    const el = mount(<UpgradeToggle isCrew={false} />)
    await tap(el)
    expect(el.querySelector('[role="alert"]')).toBeNull()
    expect(refresh).toHaveBeenCalledTimes(1)
  })
})

describe('the upgrade page gates the beta toggle on the same condition the action checks', () => {
  const page = sourceWithoutComments('app/(main)/upgrade/page.tsx', { imports: false })

  it('reads billingLive() and derives betaOpen from it, not from crewSellable', () => {
    expect(page).toMatch(/billingLive\(\)/)
    expect(page).toMatch(/const betaOpen = !chargingLive/)
    expect(page).not.toMatch(/\{!live \? \(\s*<UpgradeToggle/)
  })

  it('shows the beta banner and UpgradeToggle only while betaOpen', () => {
    expect(page).toMatch(/\{betaOpen && \(/)
    expect(page).toMatch(/\{betaOpen \? \(\s*<UpgradeToggle/)
  })

  it('shows a static opens-soon notice with no button when billing is on but Crew is not sellable', () => {
    expect(page).toMatch(/\) : live \? \(\s*<PwywPicker/)
    expect(page).toMatch(/data-crew-opens-soon/)
    expect(page).toMatch(/Crew opens soon\. You set the amount when it does\./)
  })
})
