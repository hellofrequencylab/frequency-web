// @vitest-environment jsdom
import { renderToStaticMarkup } from 'react-dom/server'
import { expect, it, vi } from 'vitest'
import { RailVaultTab, RailYouTab } from './rail-tabs'
vi.mock('next/navigation', () => ({ usePathname: () => '/feed' }))

it('lets the visible You standing participate in its native accessible name', () => {
  const doc = new DOMParser().parseFromString(renderToStaticMarkup(
    <RailYouTab label="You, Maya" face={<span>You <small>Explorer · Crew</small></span>} microFace={<span>M</span>} panel={<p>Account</p>} />,
  ), 'text/html')
  const full = doc.querySelector('.fqm-tab-you')!
  expect(full.getAttribute('aria-label')).toBeNull()
  expect(full.textContent).toContain('You Explorer · Crew')
  expect(doc.getElementById(full.getAttribute('aria-describedby')!)?.textContent).toBe('You, Maya')
  expect(doc.querySelector('.fqm-tab-micro')?.getAttribute('aria-label')).toBe('You, Maya')
})

it('names both Vault controls from their visible counters and contextual label', () => {
  const doc = new DOMParser().parseFromString(renderToStaticMarkup(
    <RailVaultTab label="The Vault" face={<><span>7</span><span>⚡ 42</span><span>💎 9</span></>} microFace={<span>⚡ 42</span>} panel={<p>Rewards</p>} />,
  ), 'text/html')
  const buttons = [...doc.querySelectorAll('.fqm-vault-btn')]
  expect(buttons).toHaveLength(2)
  for (const button of buttons) {
    expect(button.getAttribute('aria-label')).toBeNull()
    expect(button.querySelector('.sr-only')?.textContent).toBe('The Vault')
    expect(button.textContent).toContain('⚡ 42')
    expect(button.getAttribute('aria-expanded')).toBe('false')
  }
  expect(buttons[0].textContent).toContain('💎 9')
})
