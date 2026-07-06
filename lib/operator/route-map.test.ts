import { describe, it, expect } from 'vitest'
import { OPERATOR_CONSOLE } from './console'
import { CONSOLE_ROUTE_MAP, resolveLegacyPath } from './route-map'

describe('route-map', () => {
  it('maps every legacy href declared in the registry (no orphan)', () => {
    for (const ws of OPERATOR_CONSOLE) {
      for (const tab of ws.subtabs) {
        for (const href of tab.legacyHrefs ?? []) {
          expect(CONSOLE_ROUTE_MAP.has(href), `${href} unmapped`).toBe(true)
          const target = CONSOLE_ROUTE_MAP.get(href)!
          expect(target.workspace).toBe(ws.id)
          expect(target.tab).toBe(tab.id)
        }
      }
    }
  })

  it('resolves a root legacy path to the console tab', () => {
    expect(resolveLegacyPath('/admin/members')).toBe('/admin/people?tab=roster')
    expect(resolveLegacyPath('/admin/crm')).toBe('/admin/people?tab=crm')
    expect(resolveLegacyPath('/admin/appearance')).toBe('/admin/site?tab=theme')
    expect(resolveLegacyPath('/admin/pricing')).toBe('/admin/settings?tab=billing')
  })

  it('resolves a space legacy path preserving the real slug', () => {
    expect(resolveLegacyPath('/spaces/acme/settings/email')).toBe('/spaces/acme/manage/marketing?tab=campaigns')
    expect(resolveLegacyPath('/spaces/acme/settings/members')).toBe('/spaces/acme/manage/people?tab=roster')
    expect(resolveLegacyPath('/spaces/acme/crm')).toBe('/spaces/acme/manage/people?tab=crm')
  })

  it('falls back to the longest mapped prefix for deeper legacy paths', () => {
    expect(resolveLegacyPath('/admin/marketing/campaigns/123')).toBe('/admin/marketing?tab=campaigns')
  })

  it('ignores query strings and trailing slashes', () => {
    expect(resolveLegacyPath('/admin/members/?foo=1')).toBe('/admin/people?tab=roster')
  })

  it('returns null for an unmapped path', () => {
    expect(resolveLegacyPath('/totally/unknown')).toBeNull()
    expect(resolveLegacyPath('/spaces/acme/unknown-surface')).toBeNull()
  })
})
