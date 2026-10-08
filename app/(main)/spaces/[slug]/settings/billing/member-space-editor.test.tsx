import { describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }))
vi.mock('@/lib/collective/member-spaces-actions', () => ({ setCollectiveMemberSpace: vi.fn(), setCollectiveExtraSpaces: vi.fn() }))
import { MemberSpaceEditor } from './member-space-editor'
const space = { id: 'child', name: 'My studio', slug: 'my-studio', parent_id: 'parent', status: 'active' }
describe('Collective owner controls', () => {
  it('keeps detach available after cancellation and suppresses new attachment', () => {
    const html = renderToStaticMarkup(<MemberSpaceEditor parentId="parent" management={{ active: false, capacity: 0, members: [space], candidates: [] }} />)
    expect(html).toContain('Detach My studio')
    expect(html).toContain('Your Collective is inactive')
    expect(html).not.toContain('Attach Space')
    expect(html).not.toContain('Your Collective is full')
  })
  it('shows the exact yearly price and quantity floor before an extra-Space purchase', () => {
    const html = renderToStaticMarkup(<MemberSpaceEditor parentId="parent" management={{ active: true, capacity: 7, members: [space], candidates: [] }} quote={{ quantity: 2, minQuantity: 1, priceId: 'price_year', unitCents: 29000, interval: 'year' }} />)
    expect(html).toContain('$580.00 per year')
    expect(html).toContain('min="1"')
    expect(html).toContain('Save extra Spaces')
    expect(html).not.toContain('per month')
  })
  it('labels the native Space picker and makes a full Collective explain its capacity', () => {
    const html = renderToStaticMarkup(<MemberSpaceEditor parentId="parent" management={{ active: true, capacity: 1, members: [space], candidates: [{ ...space, id: 'other', parent_id: null }] }} />)
    expect(html).toContain('1 of 1 Spaces attached')
    expect(html).toContain('for="collective-member-space"')
    expect(html).toContain('id="collective-member-space"')
    expect(html).toContain('Your Collective is full')
    expect(html).toMatch(/<button[^>]*disabled[^>]*>Attach Space<\/button>/)
  })
})
