import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { newWorldBlocks } from './new-world'

// LIVE-2053: every New World function block is bound to the Space's own rows exactly as the Space content blocks are (off
// metadata.space), a function the Space has switched off renders nothing, and an empty function keeps its honest empty state.

const links = { origin: 'https://frequency.example', slug: 'danieltyack', siteBase: '', pages: ['home'], contactHref: '/contact', bookHref: null, email: null }
function draw(type: string, props: Record<string, unknown>, space: Record<string, unknown> | undefined = {}) {
  const cfg = newWorldBlocks[type]
  const el = (cfg.render as (p: Record<string, unknown>) => React.ReactNode)({ ...cfg.defaultProps, id: 'x', ...props, puck: { metadata: { links, space } } })
  return renderToStaticMarkup(<>{el}</>)
}
const list = (on: boolean, rows: Record<string, unknown>[] = []) => ({ on, rows })
const row = (name: string, o: Record<string, unknown> = {}) => ({ id: name, name, body: '', price: '', meta: '', href: null, image: null, featured: false, ...o })

describe('the New World blocks read the Space rows', () => {
  it('draws the team from the Space team, each name a link to the person', () => {
    const html = draw('NewWorldTeam', { rows: [{ name: 'Placeholder', role: 'Owner' }] }, { team: [{ profileId: 'p', name: 'Daniel Tyack', handle: 'danieltyack', avatarUrl: null, role: 'admin' }] })
    expect(html).toContain('Daniel Tyack')
    expect(html).toContain('href="https://frequency.example/people/danieltyack"')
    expect(html).toContain('>Host<')
    expect(html).not.toContain('Placeholder')
  })

  it('draws the groups from the Space circles with their member count and a link into the app', () => {
    const html = draw('NewWorldGroups', {}, { community: [{ id: 'c', slug: 'tuesday-quiet', name: 'Tuesday Quiet', about: 'Same faces.', memberCount: 14, memberCap: 20, type: 'in-person', status: 'active', access: 'open', imageUrl: null, neighborhood: 'Oceanside' }] })
    expect(html).toContain('Tuesday Quiet')
    expect(html).toContain('14 members')
    expect(html).toContain('Oceanside')
    expect(html).toContain('https://frequency.example/circles/tuesday-quiet')
    expect(html).not.toContain('No group yet')
  })

  it('draws where to find us from the business info when the owner left the fields blank', () => {
    const html = draw('NewWorldWhere', {}, { profile: { address: '1 Main St', phone: '555 0100', email: 'hi@x.io', hours: 'Mon to Fri: 9am to 5pm\nSaturday: closed' } })
    expect(html).toContain('1 Main St')
    expect(html).toContain('555 0100')
    expect(html).toContain('<dt>Mon to Fri</dt><dd>9am to 5pm</dd>')
  })

  it('draws the plans from the Space memberships and renders nothing when memberships are off', () => {
    const live = { plans: list(true, [row('Member', { price: '$24 / mo', featured: true, href: '/spaces/danieltyack/memberships' })]), shop: list(true), posts: list(true) }
    const html = draw('NewWorldPlans', { rows: [{ name: 'Owner plan' }] }, { newWorld: live })
    expect(html).toContain('Member')
    expect(html).toContain('$24 / mo')
    expect(html).toContain('Most chosen')
    expect(html).toContain('https://frequency.example/spaces/danieltyack/memberships')
    expect(html).not.toContain('Owner plan')
    expect(draw('NewWorldPlans', {}, { newWorld: { ...live, plans: list(false) } })).toBe('')
  })

  it('draws the shop from the Space products with their photo, and nothing when Sell is off', () => {
    const live = { plans: list(true), shop: list(true, [row('Tote', { price: '$18', href: '/market/p1', image: 'https://cdn/x.jpg' })]), posts: list(true) }
    const html = draw('NewWorldShop', {}, { newWorld: live })
    expect(html).toContain('Tote')
    expect(html).toContain('https://cdn/x.jpg')
    expect(html).toContain('https://frequency.example/market/p1')
    expect(draw('NewWorldShop', {}, { newWorld: { ...live, shop: list(false) } })).toBe('')
  })

  it('draws the posts from the Space library and nothing when journeys and practices are off', () => {
    const live = { plans: list(true), shop: list(true), posts: list(true, [row('Your first month', { meta: 'Journey', href: '/journeys/first-month' })]) }
    const html = draw('NewWorldPosts', {}, { newWorld: live })
    expect(html).toContain('Your first month')
    expect(html).toContain('>Journey<')
    expect(draw('NewWorldPosts', {}, { newWorld: { ...live, posts: list(false) } })).toBe('')
  })

  it('keeps the honest empty state for a function that is on with no rows yet, and the owner rows when no bag is attached', () => {
    const live = { plans: list(true), shop: list(true), posts: list(true) }
    expect(draw('NewWorldPlans', {}, { newWorld: live })).toContain('No plan yet')
    expect(draw('NewWorldShop', {}, { newWorld: live })).toContain('No way in yet')
    expect(draw('NewWorldPlans', { rows: [{ name: 'Owner plan' }] }, {})).toContain('Owner plan')
  })

  it('draws the community wall from the anonymous wall read, nothing when nobody outside may read it, and the samples with no bag (LIVE-2108)', () => {
    const post = { id: 'w1', name: 'Maya Torres', role: 'From the team', date: 'Nov 2', body: 'Saturday moves to the courtyard.', meta: '14 high fives · 3 replies', announcement: true }
    const live = { plans: list(true), shop: list(true), posts: list(true), wall: { on: true, href: '/spaces/danieltyack/community', rows: [post] } }
    const html = draw('NewWorldSpaceWall', {}, { newWorld: live })
    expect(html).toContain('Maya Torres')
    expect(html).toContain('Saturday moves to the courtyard.')
    expect(html).toContain('From the team · Nov 2')
    expect(html).toContain('14 high fives · 3 replies')
    expect(html).toContain('href="https://frequency.example/spaces/danieltyack/community"')
    expect(html).not.toContain('Jonah Park')
    expect(draw('NewWorldSpaceWall', {}, { newWorld: { ...live, wall: { on: false, href: null, rows: [] } } })).toBe('')
    expect(draw('NewWorldSpaceWall', {}, {})).toContain('Jonah Park')
  })

  it('draws nothing for the book page when booking is switched off and the owner wrote no ways in', () => {
    expect(draw('NewWorldBook', {}, { booking: { enabled: false, href: null }, events: [] })).toBe('')
    expect(draw('NewWorldBook', { ways: [{ name: 'First visit' }] }, { booking: { enabled: false, href: null } })).toContain('First visit')
  })
})
