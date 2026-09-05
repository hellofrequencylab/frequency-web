import { describe, it, expect, beforeEach, vi } from 'vitest'
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'

// THE OPERATOR CHANNEL CONSOLE READS AND WRITES THE LIVE TABLE (L9-01, 2026-09-05).
//
// /admin/channels used to list the retired `channels` table (0 rows in production), mount a
// New Channel form that inserted into it and redirected to `/channels/<uuid>` (a 404: the
// Channel page reads `topical_channels` only), and hide/show rows nobody could see. Locked here:
//   1. getChannelsAdminData reads `topical_channels`, splits shown/hidden on `is_active` (the
//      flag the Channel page checks), and loads the Pillar options the live create dialog needs.
//   2. The page mounts THE live create dialog (app/(main)/channels/new-channel-compose), and the
//      legacy form under components/compose is gone, not merely orphaned.
//   3. The hide / show / rename actions in app/(main)/admin/actions.ts write `topical_channels`
//      with `is_active`, and never the retired table.

const { fromSpy, rows } = vi.hoisted(() => ({
  fromSpy: vi.fn(),
  rows: vi.fn(),
}))

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: (table: string) => {
      fromSpy(table)
      const chain = {
        select: () => chain,
        eq: () => chain,
        order: async () => ({ data: rows(table) }),
      }
      return chain
    },
  }),
}))

import { getChannelsAdminData } from './load-channels'

const ROOT = process.cwd()
const read = (rel: string) => readFileSync(path.join(ROOT, rel), 'utf8')

beforeEach(() => {
  vi.clearAllMocks()
  rows.mockImplementation((table: string) => {
    if (table === 'pillars') return [{ id: 'p-mind', name: 'Mind' }]
    if (table === 'topical_channels') {
      return [
        { id: 'c1', name: 'Breathwork', slug: 'breathwork', category: 'mind', description: null, is_active: true, created_at: '2026-01-02', pillar: { name: 'Mind' } },
        { id: 'c2', name: 'Old Thing', slug: 'old-thing', category: 'body', description: 'x', is_active: false, created_at: '2026-01-01', pillar: null },
      ]
    }
    return []
  })
})

describe('getChannelsAdminData reads the live table', () => {
  it('lists topical_channels split on is_active, plus the Pillar options', async () => {
    const { pillars, visible, hidden } = await getChannelsAdminData()
    expect(fromSpy.mock.calls.map((c) => c[0]).sort()).toEqual(['pillars', 'topical_channels'])
    expect(fromSpy).not.toHaveBeenCalledWith('channels')
    expect(pillars).toEqual([{ id: 'p-mind', name: 'Mind' }])
    expect(visible.map((c) => c.slug)).toEqual(['breathwork'])
    expect(hidden.map((c) => c.slug)).toEqual(['old-thing'])
  })

  it('survives an empty read', async () => {
    rows.mockReturnValue(null)
    const { pillars, visible, hidden } = await getChannelsAdminData()
    expect(pillars).toEqual([])
    expect(visible).toEqual([])
    expect(hidden).toEqual([])
  })
})

describe('the console mounts the live create dialog', () => {
  it('imports NewChannelCompose from the /channels page, not the retired form', () => {
    const page = read('app/(main)/admin/channels/page.tsx')
    expect(page).toContain("from '@/app/(main)/channels/new-channel-compose'")
    expect(page).not.toContain('components/compose/new-channel-compose')
  })

  it('the retired form is deleted, so nothing can call the retired creator', () => {
    expect(existsSync(path.join(ROOT, 'components/compose/new-channel-compose.tsx'))).toBe(false)
  })

  it('the live dialog posts to createTopicalChannel', () => {
    const compose = read('app/(main)/channels/new-channel-compose.tsx')
    expect(compose).toContain("import { createTopicalChannel } from './actions'")
    expect(compose).toContain('await createTopicalChannel(fd)')
  })
})

describe('hide / show / rename write topical_channels', () => {
  const src = read('app/(main)/admin/actions.ts')
  const start = src.indexOf('// ── Channels ──')
  const end = src.indexOf('// ── Hubs ──')
  const section = src.slice(start, end)

  it('the Channels section exists and is bounded', () => {
    expect(start).toBeGreaterThan(-1)
    expect(end).toBeGreaterThan(start)
  })

  it('never writes the retired table', () => {
    expect(section).not.toContain(".from('channels')")
    // And nowhere else in the file either: the retired table has no live writer left.
    expect(src).not.toContain(".from('channels')")
  })

  it('archive / update / unarchive each hit topical_channels, with is_active as the visibility flag', () => {
    expect(section.match(/\.from\('topical_channels'\)/g)?.length).toBe(3)
    expect(section).toContain('is_active: false')
    expect(section).toContain('is_active: true')
  })

  it('revalidates the channel page under both handles it resolves by', () => {
    expect(section).toContain('revalidatePath(`/channels/${id}`)')
    expect(section).toContain('revalidatePath(`/channels/${slug}`)')
  })
})
