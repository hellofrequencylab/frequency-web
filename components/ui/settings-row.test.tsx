// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { User } from 'lucide-react'
import { SettingsGroup, SettingsRow } from './settings-row'

let container: HTMLDivElement | null = null
let root: Root | null = null

afterEach(() => {
  if (root) act(() => root!.unmount())
  if (container) container.remove()
  root = null
  container = null
})

function render(node: React.ReactNode) {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  act(() => root!.render(node))
}

describe('SettingsRow', () => {
  it('renders a link with a trailing chevron when href is set', () => {
    render(
      <SettingsGroup title="Account">
        <SettingsRow href="/settings/profile" icon={User} title="Edit profile" description="Name and photo" />
      </SettingsGroup>,
    )
    const link = container!.querySelector('a')
    expect(link).not.toBeNull()
    expect(link!.getAttribute('href')).toBe('/settings/profile')
    expect(container!.textContent).toContain('Edit profile')
    // Group header renders.
    expect(container!.textContent).toContain('Account')
    // Navigational rows show a chevron (an svg in the trailing slot), not a check.
    expect(link!.querySelectorAll('svg').length).toBeGreaterThanOrEqual(2) // icon + chevron
  })

  it('renders a button that fires onClick when there is no href', () => {
    let clicks = 0
    render(
      <SettingsGroup>
        <SettingsRow title="Dark" onClick={() => { clicks++ }} />
      </SettingsGroup>,
    )
    const btn = container!.querySelector('button')
    expect(btn).not.toBeNull()
    act(() => btn!.dispatchEvent(new MouseEvent('click', { bubbles: true })))
    expect(clicks).toBe(1)
  })

  it('marks a selected option with aria-pressed', () => {
    render(
      <SettingsGroup>
        <SettingsRow title="System" onClick={() => {}} selected />
      </SettingsGroup>,
    )
    const btn = container!.querySelector('button')!
    expect(btn.getAttribute('aria-pressed')).toBe('true')
  })

  it('disables the row (no link, no click) when disabled', () => {
    let clicks = 0
    render(
      <SettingsGroup>
        <SettingsRow href="/x" title="Locked" disabled onClick={() => { clicks++ }} />
      </SettingsGroup>,
    )
    // Disabled + href should NOT render a navigable link.
    expect(container!.querySelector('a')).toBeNull()
    const btn = container!.querySelector('button')!
    expect(btn.disabled).toBe(true)
    act(() => btn.dispatchEvent(new MouseEvent('click', { bubbles: true })))
    expect(clicks).toBe(0)
  })
})
