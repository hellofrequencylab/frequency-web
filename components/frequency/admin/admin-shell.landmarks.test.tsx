// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import type { ReactNode } from 'react'
import { AdminShell, type AdminShellProps } from './admin-shell'

// Navigation and motion are client islands; keep the actual shell's semantic markup.
vi.mock('./console-slide', () => ({ ConsoleSlide: ({ children }: { children: ReactNode }) => <div className="ad-slide">{children}</div> }))
vi.mock('./admin-nav', () => ({ AdminCrumb: () => null, AdminNav: () => null, AdminNavList: () => null, AdminPhoneBar: () => null, AdminPhoneStrip: () => null, AdminTopMenu: () => null }))

const props: Omit<AdminShellProps, 'children'> = {
  homeHref: '/admin', crumbRoot: 'Frequency', navLabel: 'Console',
  space: { name: 'Frequency', role: 'Staff', avatarUrl: null, switchTo: [] },
  items: [], search: { href: '/search', label: 'Search' }, alerts: { href: '/notifications', unread: 0 },
  me: { name: 'Staff', avatarUrl: null, href: '/profile' },
}
function documentFor(content: ReactNode) {
  return new DOMParser().parseFromString(renderToStaticMarkup(content), 'text/html')
}
describe('console main landmark ownership', () => {
  it('keeps the member rail main as the single landmark and skip-link target', () => {
    const doc = documentFor(<><a href="#main">Skip to content</a><main id="main" className="fqm-center"><AdminShell {...props} withinMain><h1>Space management</h1></AdminShell></main></>)
    const mains = doc.querySelectorAll('main, [role="main"]')
    expect(mains).toHaveLength(1)
    expect(mains[0].id).toBe('main')
    expect(doc.querySelector('.ad-main')?.tagName).toBe('DIV')
    expect(mains[0].querySelector('h1')?.textContent).toBe('Space management')
    expect(doc.querySelector('a[href="#main"]')).not.toBeNull()
  })
  it('retains one main landmark for a standalone console', () => {
    const doc = documentFor(<AdminShell {...props}><h1>Operator console</h1></AdminShell>)
    expect(doc.querySelectorAll('main, [role="main"]')).toHaveLength(1)
    expect(doc.querySelector('main.ad-main h1')?.textContent).toBe('Operator console')
  })
})
