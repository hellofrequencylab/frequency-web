import { describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { FqEventHost } from './event-panels'
const context = vi.hoisted(() => ({ value: {} as Record<string, unknown> }))
vi.mock('@/lib/events/active-event', () => ({ getEventContext: () => context.value }))
vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }))
vi.mock('./message-host', () => ({ FqMessageHost: () => null }))
vi.mock('./event-map', () => ({ FqEventMap: () => null }))
describe('the event team keeps roles distinct', () => {
 it('credits host, venue, collaborating Space, and accepted person cohost separately', async () => {
  context.value = {
   spaceHost: { id: 'host', slug: 'home', name: 'Home Space', logoUrl: null },
   venueSpace: { slug: 'garden', name: 'The Garden' },
   host: null, myProfileId: null, isHost: false,
   collaboratorSpaces: [{ id: 'partner', slug: 'partner', name: 'Partner Space', logoUrl: null }],
   cohosts: [{ id: 'person', handle: 'alex', displayName: 'Alex', avatarUrl: null }],
  }
  const html = renderToStaticMarkup(await FqEventHost())
  expect(html).toContain('Behind this event')
  expect(html).toContain('Venue')
  expect(html).toContain('Collaborator')
  expect(html).toContain('Co host')
  for (const href of ['/spaces/home','/spaces/garden','/spaces/partner','/people/alex']) expect(html).toContain(href)
 })
 it('does not manufacture a venue or collaborators when absent', async () => {
  context.value = { spaceHost: { id:'host',slug:'home',name:'Home',logoUrl:null }, host:null, collaboratorSpaces:[],cohosts:[] }
  const html = renderToStaticMarkup(await FqEventHost())
  expect(html).not.toContain('Venue')
  expect(html).not.toContain('Collaborator')
 })
})
