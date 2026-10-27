// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import type { ReactNode } from 'react'
import { FqRailLayout } from './rail-layout'
import { MembersKitRoot } from './kit-root'

const route = vi.hoisted(() => ({ pathname: '/feed' }))
vi.mock('next/navigation', () => ({ usePathname: () => route.pathname, useSearchParams: () => new URLSearchParams() }))
// The editor mount and lazy operator island are outside the rail geometry contract.
vi.mock('@/components/entity-blocks/profile-layout-context', () => ({ EntityLayoutMount: ({ children }: { children: ReactNode }) => <>{children}</> }))
vi.mock('@/components/layout/admin-bar/lazy-admin-bar', () => ({ LazyAdminBar: () => null }))
const face = (name: string) => ({ full: <div>{name} full</div>, micro: <div>{name} micro</div>, tab: <button>{name} dock</button> })
function documentFor(pathname: string) {
  route.pathname = pathname
  return new DOMParser().parseFromString(renderToStaticMarkup(
    <MembersKitRoot profileHref="/people/test">
      <FqRailLayout left={face('left')} right={face('right')} footer={<footer>Footer</footer>}
        admin={{ role: 'member', staffRole: null, webRole: 'none', caps: [] }}>
        <h1>Current page</h1>
      </FqRailLayout>
    </MembersKitRoot>,
  ), 'text/html')
}
describe('the active Frequency member layout replaces legacy AppShell contracts', () => {
  it('renders one focusable main with page-owned content and no slug-derived breadcrumb', () => {
    const doc = documentFor('/events/renamed-event')
    expect(doc.querySelectorAll('main')).toHaveLength(1)
    expect(doc.querySelector('main#main')?.getAttribute('tabindex')).toBe('-1')
    expect(doc.querySelector('main h1')?.textContent).toBe('Current page')
    expect(doc.querySelector('[aria-label="Breadcrumb"]')).toBeNull()
  })
  it('renders both camera-hooked rail faces, their dock controls and auto responsive state', () => {
    const doc = documentFor('/feed')
    expect(doc.querySelector('.fqm-body')?.getAttribute('data-has')).toBe('lr')
    expect(doc.querySelector('.fqm-body')?.getAttribute('data-l')).toBe('auto')
    expect(doc.querySelector('.fqm-body')?.getAttribute('data-r')).toBe('auto')
    expect(doc.querySelectorAll('aside[data-rail-column]')).toHaveLength(2)
    expect(doc.querySelectorAll('.fqm-full')).toHaveLength(2)
    expect(doc.querySelectorAll('.fqm-micro')).toHaveLength(2)
    expect(doc.querySelector('aside[aria-label="Your shortcuts"]')?.textContent).toContain('left dock')
    expect(doc.querySelector('aside[aria-label="Your community"]')?.textContent).toContain('right dock')
    expect(doc.querySelector('footer')?.textContent).toBe('Footer')
  })
  it('rendered negative controls detect losing the main target or either camera hook', () => {
    const doc = documentFor('/feed')
    const valid = (page: Document) => page.querySelectorAll('main#main[tabindex="-1"]').length === 1 && page.querySelectorAll('aside[data-rail-column]').length === 2
    expect(valid(doc)).toBe(true)
    doc.querySelector('main')!.removeAttribute('id')
    expect(valid(doc)).toBe(false)
    const rails = documentFor('/feed')
    rails.querySelector('aside')!.removeAttribute('data-rail-column')
    expect(valid(rails)).toBe(false)
  })
  it('editor takeover removes global rails and footer while preserving the main page', () => {
    const doc = documentFor('/spaces/example/manage/website')
    expect(doc.querySelector('main h1')).not.toBeNull()
    // Route registry determines the exact builder path; the editor case must actually be edge.
    expect(doc.querySelector('.fqm-body')?.hasAttribute('data-edge')).toBe(true)
    expect(doc.querySelectorAll('aside[data-rail-column]')).toHaveLength(0)
    expect(doc.querySelector('footer')).toBeNull()
  })
})
