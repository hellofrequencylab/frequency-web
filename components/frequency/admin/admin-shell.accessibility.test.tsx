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
describe('visible console identity names', () => {
  it('includes the Space name and role in the switcher and phone home link', () => {
    const space = { ...props.space, name: 'Maya Studio', role: 'Owner', switchTo: [{ key: 'other', label: 'Other Studio', href: '/spaces/other/manage', avatarUrl: null }] }
    const doc = documentFor(<AdminShell {...props} space={space}><h1>Space management</h1></AdminShell>)
    for (const selector of ['summary.ad-space', 'a.ad-top-id']) {
      const control = doc.querySelector(selector)!
      expect(control.getAttribute('aria-label')).toBeNull()
      expect(control.textContent).toContain('Maya Studio')
      expect(control.textContent).toContain('Owner')
    }
    expect(doc.querySelector('summary.ad-space .sr-only')?.textContent).toBe('Switch console')
    expect(doc.querySelector('a.ad-top-id .sr-only')?.textContent).toBe('Console home')
  })
})
