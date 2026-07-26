import { describe, it, expect, vi, beforeEach } from 'vitest'

// Fixtures the mocked admin client returns, keyed by table. Each test seeds these
// before calling the resolver, so we exercise the precedence without a real DB.
const tableRows: Record<string, { id: string; [k: string]: unknown }[]> = {
  circles: [],
  events: [],
  channels: [],
  spaces: [],
  profiles: [],
}

// Minimal admin-client stub: `.from(table).select(...).in('id', ids)` resolves to
// the seeded rows for that table whose id is in the requested set, and
// `.storage.from(bucket).getPublicUrl(path)` builds a deterministic public URL.
// Mirrors the shape buildScopeContextResolver relies on (batch `.in` reads).
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from(table: string) {
      return {
        select() {
          return {
            in(_col: string, ids: string[]) {
              const rows = (tableRows[table] ?? []).filter((r) => ids.includes(r.id))
              return Promise.resolve({ data: rows, error: null })
            },
          }
        },
      }
    },
    storage: {
      from(bucket: string) {
        return {
          getPublicUrl(path: string) {
            return { data: { publicUrl: `https://cdn.test/${bucket}/${path}` } }
          },
        }
      },
    },
  }),
}))

import { buildScopeContextResolver } from './post-origin'

beforeEach(() => {
  tableRows.circles = []
  tableRows.events = []
  tableRows.channels = []
  tableRows.spaces = []
  tableRows.profiles = []
})

describe('buildScopeContextResolver', () => {
  it('resolves an event-scoped post to its event, with the public cover URL', async () => {
    tableRows.events = [{ id: 'evt-1', title: 'Sunrise Hike', slug: 'sunrise-hike', cover_image_path: 'covers/hike.jpg' }]
    const resolve = await buildScopeContextResolver(['evt-1'])
    expect(resolve('evt-1', 'author-1')).toEqual({
      type: 'event',
      name: 'Sunrise Hike',
      href: '/events/sunrise-hike',
      image_url: 'https://cdn.test/event-media/covers/hike.jpg',
    })
  })

  it('resolves every scope kind with its link + image', async () => {
    tableRows.circles = [{ id: 'c-1', name: 'Mind Circle', slug: 'mind', image_url: 'https://cdn.test/c.jpg' }]
    tableRows.events = [{ id: 'e-1', title: 'Beach Cleanup', slug: 'beach-cleanup', cover_image_path: null }]
    tableRows.channels = [{ id: 'ch-1', name: 'Book club' }]
    tableRows.spaces = [{ id: 's-1', name: 'Meld', brand_name: 'Meld - A Community Cowork', slug: 'meld', brand_logo_url: 'https://cdn.test/meld.png' }]
    tableRows.profiles = [{ id: 'p-1', display_name: 'Ada', handle: 'ada', avatar_url: 'https://cdn.test/ada.jpg#fp=30,68' }]

    const resolve = await buildScopeContextResolver(['c-1', 'e-1', 'ch-1', 's-1', 'p-1'])
    expect(resolve('c-1', 'author-1')).toEqual({ type: 'circle', name: 'Mind Circle', href: '/circles/mind', image_url: 'https://cdn.test/c.jpg' })
    expect(resolve('e-1', 'author-1')).toEqual({ type: 'event', name: 'Beach Cleanup', href: '/events/beach-cleanup', image_url: null })
    expect(resolve('ch-1', 'author-1')).toEqual({ type: 'channel', name: 'Book club', href: '/channels/ch-1', image_url: null })
    expect(resolve('s-1', 'author-1')).toEqual({ type: 'space', name: 'Meld - A Community Cowork', href: '/spaces/meld', image_url: 'https://cdn.test/meld.png' })
    expect(resolve('p-1', 'author-1')).toEqual({ type: 'wall', name: 'Ada', href: '/people/ada', image_url: 'https://cdn.test/ada.jpg#fp=30,68', handle: 'ada' })
  })

  it('resolves nothing for an unresolved scope or a post on the author’s own profile', async () => {
    tableRows.profiles = [{ id: 'me', display_name: 'Me', handle: 'me', avatar_url: null }]
    const resolve = await buildScopeContextResolver(['me', 'unknown', null])
    expect(resolve('me', 'me')).toBeUndefined() // own profile = just posting
    expect(resolve('unknown', 'me')).toBeUndefined()
    expect(resolve(null, 'me')).toBeUndefined()
  })

  it('still names another member’s wall when the author differs', async () => {
    tableRows.profiles = [{ id: 'aidi', display_name: 'Aidi Tampsaru', handle: 'aidi', avatar_url: null }]
    const resolve = await buildScopeContextResolver(['aidi'])
    expect(resolve('aidi', 'daniel')).toEqual({
      type: 'wall',
      name: 'Aidi Tampsaru',
      href: '/people/aidi',
      image_url: null,
      handle: 'aidi',
    })
  })
})
