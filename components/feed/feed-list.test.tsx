import { describe, it, expect, beforeEach, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import type { ReactElement } from 'react'

// scan2 L5-03 (2026-09-05): a failing feed RPC renders the feed's ERROR pane, never its EMPTY
// pane. Before this, both `feed_for_viewer` and `scoped_feed_for_viewer` were read as
// `const { data } = ...; data ?? []`, so a statement timeout showed every member "nothing posted
// yet" on /feed and on every Circle and Channel page, with nothing logged.

const { rpc, createAdminClient } = vi.hoisted(() => ({
  rpc: vi.fn(),
  createAdminClient: vi.fn(),
}))

vi.mock('@/lib/supabase/server', () => ({ createClient: async () => ({ rpc }) }))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient }))
vi.mock('@/lib/demo-preference', () => ({ viewerHidesDemo: async () => false }))
vi.mock('@/lib/feed/viewer-resonance', () => ({ getViewerResonanceMap: async () => new Map() }))
vi.mock('@/lib/connections/resonance', () => ({ getMyOrbit: async () => [] }))
vi.mock('@/lib/feed/post-origin', () => ({ buildScopeContextResolver: async () => () => null }))
vi.mock('@/lib/events/dispatch-audience', () => ({
  viewerInEventDispatchArea: () => false,
  viewerHasActiveRsvp: async () => false,
}))
vi.mock('./feed-people-strip', () => ({ FeedPeopleStrip: () => null }))
vi.mock('./post-card', () => ({ PostCard: () => null }))
vi.mock('next/link', () => ({
  default: ({ href, children }: { href: string; children: React.ReactNode }) => <a href={href}>{children}</a>,
}))

const { FeedList } = await import('./feed-list')

const ERROR_COPY = 'The feed could not load.'
const EMPTY_COPY = 'Nothing posted yet.'

async function render(props: Parameters<typeof FeedList>[0]): Promise<string> {
  // FeedList is an async Server Component; await it for its element, then render statically.
  const el = (await FeedList(props)) as ReactElement
  return renderToStaticMarkup(el)
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.spyOn(console, 'error').mockImplementation(() => {})
  createAdminClient.mockReturnValue({})
})

describe('FeedList on a failed feed RPC', () => {
  it('renders the error pane with a retry link on the main feed, never the empty pane', async () => {
    rpc.mockResolvedValue({ data: null, error: { message: 'canceling statement due to statement timeout', code: '57014' } })
    const html = await render({ myProfileId: 'p1', retryHref: '/feed?sort=relevant' })
    expect(rpc).toHaveBeenCalledWith('feed_for_viewer', expect.any(Object))
    expect(html).toContain(ERROR_COPY)
    expect(html).toContain('href="/feed?sort=relevant"')
    expect(html).not.toContain(EMPTY_COPY)
    expect(console.error).toHaveBeenCalledWith('[feed] rpc failed', expect.objectContaining({ rpc: 'feed_for_viewer' }))
  })

  it('renders the error pane on a Circle or Channel page (the scoped RPC)', async () => {
    rpc.mockResolvedValue({ data: null, error: { message: 'permission denied', code: '42501' } })
    const html = await render({
      myProfileId: 'p1',
      circleIds: ['c1'],
      showPublicLayer: false,
      emptyMessage: 'No posts yet. Start the conversation.',
      retryHref: '/channels/breathwork?tab=feed',
    })
    expect(rpc).toHaveBeenCalledWith('scoped_feed_for_viewer', expect.objectContaining({ _scope_ids: ['c1'] }))
    expect(html).toContain(ERROR_COPY)
    expect(html).not.toContain('No posts yet.')
  })

  it('still renders the empty pane when the RPC succeeds with no rows', async () => {
    rpc.mockResolvedValue({ data: [], error: null })
    const html = await render({
      myProfileId: 'p1',
      circleIds: ['c1'],
      showPublicLayer: false,
      emptyMessage: 'No posts yet. Start the conversation.',
    })
    expect(html).toContain('No posts yet.')
    expect(html).not.toContain(ERROR_COPY)
    expect(console.error).not.toHaveBeenCalled()
  })
})
