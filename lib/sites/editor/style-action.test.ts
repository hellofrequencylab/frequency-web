import { beforeEach, describe, expect, it, vi } from 'vitest'

// ADR-1728: the editor's Theme tab saves the site's global styles, the same setting Identity and branding
// edits. The editor autosaves its draft into the same preferences row, so a style write must only land
// while the draft revision it read is still the stored one.
const mocks = vi.hoisted(() => ({ host: 'hearts.example', allowed: true, preferences: {} as unknown, updates: [] as { value: Record<string, unknown>; filter: [string, string, string] }[], landed: [] as boolean[], refresh: vi.fn() }))
vi.mock('next/headers', () => ({ headers: async () => ({ get: () => mocks.host }), cookies: async () => ({ get: () => ({ value: 'token' }) }) }))
vi.mock('@/lib/sites/hosted', () => ({ resolveHostedSpace: async () => ({ id: 'space', slug: 'hearts' }) }))
vi.mock('@/lib/sites/site-admin-pass', () => ({ SITE_ADMIN_COOKIE: 'admin', readSiteAdminPass: () => ({ staff: false, profileId: 'owner' }), passOpensSite: () => true }))
vi.mock('@/lib/sites/site-admin', () => ({ siteAdminAllowed: async () => mocks.allowed, readSiteAdminAuthor: async () => ({ name: 'Owner' }) }))
vi.mock('@/lib/sites/site-cache', () => ({ refreshSite: mocks.refresh }))
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: () => ({
      select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { preferences: mocks.preferences, owner_profile_id: 'owner' }, error: null }) }) }),
      update: (value: Record<string, unknown>) => ({
        eq: () => ({
          filter: (column: string, op: string, v: string) => ({
            select: async () => {
              mocks.updates.push({ value, filter: [column, op, v] })
              const landed = mocks.landed.shift() ?? true
              return { data: landed ? [{ id: 'space' }] : [], error: null }
            },
          }),
        }),
      }),
    }),
  }),
}))
import { saveWebsiteStyle } from './actions'

describe('saving the global styles from the website editor', () => {
  beforeEach(() => {
    mocks.host = 'hearts.example'
    mocks.allowed = true
    mocks.preferences = { theme: 'classic', websiteEditor: { revision: 7 }, profileLayout: { rows: [] } }
    mocks.updates = []
    mocks.landed = []
    mocks.refresh.mockReset()
  })

  it('writes the shared setting, keeps every other key and guards on the draft revision it read', async () => {
    const result = await saveWebsiteStyle('hearts.example', { look: { corners: 'square', header: 'bar' } })
    expect(result).toMatchObject({ ok: true, style: { theme: 'frequency', look: { corners: 'square', header: 'bar' } } })
    const [write] = mocks.updates
    expect(write.filter).toEqual(['preferences->websiteEditor->>revision', 'eq', '7'])
    const prefs = write.value.preferences as Record<string, unknown>
    expect(prefs.profileLayout).toEqual({ rows: [] })
    expect(prefs.websiteEditor).toEqual({ revision: 7 })
    expect(prefs.siteStyle).toMatchObject({ corners: 'square', header: 'bar' })
    expect(mocks.refresh).toHaveBeenCalledWith('hearts')
  })

  it("switches the theme with that theme's fonts", async () => {
    const result = await saveWebsiteStyle('hearts.example', { theme: 'bold' })
    expect(result).toMatchObject({ ok: true, style: { theme: 'bold', fonts: 'menswork' } })
  })

  it('retries on a fresh read when an autosave landed in between, and gives up after three tries', async () => {
    mocks.landed = [false, true]
    expect((await saveWebsiteStyle('hearts.example', { look: { spacing: 'compact' } })).ok).toBe(true)
    expect(mocks.updates).toHaveLength(2)
    mocks.updates = []
    mocks.landed = [false, false, false]
    expect(await saveWebsiteStyle('hearts.example', { look: { spacing: 'compact' } })).toMatchObject({ ok: false })
    expect(mocks.updates).toHaveLength(3)
    expect(mocks.refresh).toHaveBeenCalledTimes(1)
  })

  it('guards on "no draft yet" when the site has never been edited', async () => {
    mocks.preferences = {}
    await saveWebsiteStyle('hearts.example', { look: { footer: 'full' } })
    expect(mocks.updates[0].filter).toEqual(['preferences->websiteEditor->>revision', 'is', 'null'])
  })

  it('refuses an unknown value, a retired theme and a signed-out editor before writing', async () => {
    expect(await saveWebsiteStyle('hearts.example', { theme: 'Midnight' })).toMatchObject({ ok: false })
    expect(await saveWebsiteStyle('hearts.example', { look: { corners: 'wobbly' } })).toMatchObject({ ok: false })
    expect(await saveWebsiteStyle('hearts.example', { look: { border: 'thick' } })).toMatchObject({ ok: false })
    mocks.allowed = false
    expect(await saveWebsiteStyle('hearts.example', { look: { corners: 'square' } })).toMatchObject({ ok: false })
    expect(mocks.updates).toEqual([])
  })
})
