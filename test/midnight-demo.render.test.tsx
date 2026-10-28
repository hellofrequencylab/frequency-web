import { describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { MidnightDemo } from '@/components/sites/midnight-demo'

vi.mock('@/components/sites/site-admin-gate', () => ({
  useSiteAdmin: () => false,
  SiteAdminOnly: () => null,
}))

describe('the Midnight demo site', () => {
  it('draws the kit home page inside the Midnight root, with no link out of the demo', () => {
    const html = renderToStaticMarkup(<MidnightDemo now={new Date(Date.UTC(2026, 9, 26, 20))} />)
    expect(html).toContain('data-house-theme="midnight"')
    expect(html).toContain('mn-logo-ring')
    expect(html).toContain('Nocturne Studio')
    expect(html).not.toMatch(/—/)
    const hrefs = [...html.matchAll(/href="([^"]*)"/g)].map((m) => m[1])
    expect(hrefs.filter((h) => h.startsWith('/') && !h.startsWith('/themes/nocturne/demo'))).toEqual([])
  })
})
