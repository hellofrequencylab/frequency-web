// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { CrmViewTabs, crmConversationsHref } from './crm-view-tabs'

vi.mock('next/link', () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}))

// THE CONVERSATIONS DOOR (LIVE-897). The People board is where a manager goes to reach a contact, and
// the ticketed inbox at /crm/conversations used to be reachable only from the dashboard. The bar now
// carries a link-out tab to it when the caller hands in the href; it stays hidden otherwise (a viewer
// the Conversations page would 404), and it never claims aria-current (it is its own route).

let container: HTMLDivElement | null = null
let root: Root | null = null

afterEach(() => {
  if (root) act(() => root!.unmount())
  if (container) container.remove()
  root = null
  container = null
})

function mount(el: React.ReactNode) {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  act(() => root!.render(el))
}

const links = () => Array.from(document.querySelectorAll('a'))
const byText = (t: string) => links().find((a) => a.textContent?.trim() === t)

describe('CrmViewTabs', () => {
  it('keeps the four board views, People at the bare board href, the active one marked', () => {
    mount(<CrmViewTabs boardHref="/spaces/acme/crm" active="pipeline" />)
    expect(links().map((a) => a.textContent?.trim())).toEqual(['People', 'Pipeline', 'Cockpit', 'Import'])
    expect(byText('People')?.getAttribute('href')).toBe('/spaces/acme/crm')
    expect(byText('Pipeline')?.getAttribute('aria-current')).toBe('page')
    expect(byText('Conversations')).toBeUndefined()
  })

  it('opens the Conversations door when given its href, as a plain link out, never current', () => {
    mount(
      <CrmViewTabs boardHref="/spaces/acme/crm" active="people" conversationsHref="/spaces/acme/crm/conversations" />,
    )
    const door = byText('Conversations')
    expect(door?.getAttribute('href')).toBe('/spaces/acme/crm/conversations')
    expect(door?.getAttribute('aria-current')).toBeNull()
    expect(byText('People')?.getAttribute('aria-current')).toBe('page')
  })

  it('derives the door with the Conversations page gate: a manager of a console Space, nobody else', () => {
    expect(crmConversationsHref('acme', 'business', true)).toBe('/spaces/acme/crm/conversations')
    expect(crmConversationsHref('acme', 'nonprofit', true)).toBe('/spaces/acme/crm/conversations')
    expect(crmConversationsHref('acme', 'business', false)).toBeUndefined()
    expect(crmConversationsHref('acme', 'root', true)).toBeUndefined()
  })
})
