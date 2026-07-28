import { describe, it, expect, beforeEach, vi } from 'vitest'

// THE CHANNEL OPERATOR SURFACE (ADR-879). Topical channels are platform-curated, so every read and
// every write in this file gates on staff (admin+), re-checked server-side per ADR-274. Locked here:
//   1. AUTHZ: a non-staff caller (and an anonymous one) is refused by every exported action, and
//      nothing is written or revalidated on the way out.
//   2. PATCH DISCIPLINE: updateChannelSettings writes ONLY the fields the operator submitted. A form
//      that omits a field can never blank it, and an empty submission writes nothing at all.
//   3. The new fields land where they should: pillar_id (with "No Pillar" → null), display_order,
//      category, and the on/off visibility control.
//   4. The slug is slugified, an empty result is refused, a collision comes back as a SENTENCE (not a
//      throw), and a successful rename revalidates BOTH the old and the new path.

const {
  getCallerProfile,
  isStaff,
  revalidatePath,
  getPillars,
  updateSpy,
  maybeSingle,
  updateError,
  deleteSpy,
  deleteError,
} = vi.hoisted(() => ({
  getCallerProfile: vi.fn(),
  isStaff: vi.fn(),
  revalidatePath: vi.fn(),
  getPillars: vi.fn(),
  updateSpy: vi.fn(),
  maybeSingle: vi.fn(),
  updateError: vi.fn(),
  deleteSpy: vi.fn(),
  deleteError: vi.fn(),
}))

vi.mock('next/cache', () => ({ revalidatePath }))
vi.mock('@/lib/auth', () => ({ getCallerProfile }))
vi.mock('@/lib/core/roles', () => ({ isStaff }))
vi.mock('@/lib/pillars', () => ({ getPillars }))
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: (table: string) => ({
      select: () => {
        const chain = {
          eq: () => chain,
          neq: () => chain,
          maybeSingle: () => maybeSingle(table),
        }
        return chain
      },
      update: (patch: Record<string, unknown>) => ({
        eq: async (col: string, val: string) => {
          updateSpy({ table, patch, col, val })
          return { error: updateError() }
        },
      }),
      delete: () => ({
        eq: async (col: string, val: string) => {
          deleteSpy({ table, col, val })
          return { error: deleteError() }
        },
      }),
    }),
    rpc: async (fn: string, args: Record<string, unknown>) => {
      deleteSpy({ rpc: fn, args })
      return { error: deleteError() }
    },
  }),
}))

import {
  getChannelAdminData,
  updateChannelSettings,
  updateChannelSlug,
  setChannelCoverUrl,
  removeChannelCover,
  saveChannelEdits,
  deleteChannel,
} from './admin-actions'

const CHANNEL = '11111111-1111-4111-8111-111111111111'
const PILLAR = '22222222-2222-4222-8222-222222222222'
const LOOM_URL = 'https://abc.supabase.co/storage/v1/object/public/library/cover.jpg'

/** The FormData the rail actually snapshots, minus whatever the caller omits. */
function form(fields: Record<string, string>): FormData {
  const fd = new FormData()
  for (const [k, v] of Object.entries(fields)) fd.set(k, v)
  return fd
}

/** The single patch the action sent to `topical_channels`. */
function patch(): Record<string, unknown> {
  expect(updateSpy).toHaveBeenCalledTimes(1)
  return updateSpy.mock.calls[0][0].patch
}

beforeEach(() => {
  vi.clearAllMocks()
  getCallerProfile.mockResolvedValue({ id: 'p1', webRole: 'admin' })
  isStaff.mockImplementation((role: string) => role === 'admin')
  getPillars.mockResolvedValue([{ id: PILLAR, slug: 'mind', name: 'Mind', description: null, accent: null, order: 1 }])
  maybeSingle.mockResolvedValue({ data: null })
  updateError.mockReturnValue(null)
  deleteError.mockReturnValue(null)
})

// ── 1. AUTHZ ──────────────────────────────────────────────────────────────────

describe('authz: staff only, re-checked in every action', () => {
  const nonStaff = [
    ['a signed-in member', { id: 'p2', webRole: 'member' }],
    ['an anonymous visitor', null],
  ] as const

  for (const [who, caller] of nonStaff) {
    it(`refuses ${who} everywhere, writing nothing`, async () => {
      getCallerProfile.mockResolvedValue(caller)

      expect(await getChannelAdminData(CHANNEL)).toBeNull()
      await expect(updateChannelSettings(CHANNEL, 'meld', form({ name: 'Meld' }))).rejects.toThrow('Unauthorized')
      expect(await updateChannelSlug(CHANNEL, 'meld', 'new-meld')).toEqual({ error: 'Unauthorized' })
      expect(await setChannelCoverUrl(CHANNEL, 'meld', LOOM_URL)).toEqual({ error: 'Unauthorized' })
      await expect(removeChannelCover(CHANNEL, 'meld')).rejects.toThrow('Unauthorized')
      // The full editor's two actions gate on the SAME staff check (ADR-882).
      expect(await saveChannelEdits(CHANNEL, 'meld', form({ name: 'Meld' }))).toEqual({ error: 'Unauthorized' })
      expect(await deleteChannel(CHANNEL, 'meld')).toEqual({ error: 'Unauthorized' })

      expect(updateSpy).not.toHaveBeenCalled()
      expect(deleteSpy).not.toHaveBeenCalled()
      expect(revalidatePath).not.toHaveBeenCalled()
    })
  }

  it('loads the editable fields plus the Pillar options for staff', async () => {
    maybeSingle.mockResolvedValue({
      data: { id: CHANNEL, name: 'Meld', slug: 'meld', category: 'creative', description: null, cover_image: null, display_order: 3, is_active: true, pillar_id: null },
    })
    const data = await getChannelAdminData('meld')
    expect(data).toMatchObject({ id: CHANNEL, slug: 'meld', category: 'creative', display_order: 3 })
    expect(data!.pillars).toEqual([{ id: PILLAR, name: 'Mind' }])
  })
})

// ── 2. PATCH DISCIPLINE ───────────────────────────────────────────────────────

describe('updateChannelSettings writes only what the operator submitted', () => {
  it('a name-only submission patches name and nothing else', async () => {
    await updateChannelSettings(CHANNEL, 'meld', form({ name: 'Meld' }))
    expect(patch()).toEqual({ name: 'Meld' })
  })

  it('never touches is_active, pillar_id, display_order, category, or description when they are absent', async () => {
    await updateChannelSettings(CHANNEL, 'meld', form({ description: 'A place to make things.' }))
    const written = patch()
    expect(Object.keys(written)).toEqual(['description'])
    for (const col of ['is_active', 'pillar_id', 'display_order', 'category', 'name', 'slug', 'cover_image']) {
      expect(written).not.toHaveProperty(col)
    }
  })

  it('writes nothing at all (no update, no revalidate) for a submission with no known fields', async () => {
    await updateChannelSettings(CHANNEL, 'meld', form({ unrelated: 'x' }))
    expect(updateSpy).not.toHaveBeenCalled()
    expect(revalidatePath).not.toHaveBeenCalled()
  })

  it('refuses an empty name rather than blanking it', async () => {
    await expect(updateChannelSettings(CHANNEL, 'meld', form({ name: '   ' }))).rejects.toThrow('Name is required')
    expect(updateSpy).not.toHaveBeenCalled()
  })

  it('targets this channel by id and revalidates the page under both handles plus the directory', async () => {
    await updateChannelSettings(CHANNEL, 'meld', form({ name: 'Meld' }))
    expect(updateSpy.mock.calls[0][0]).toMatchObject({ table: 'topical_channels', col: 'id', val: CHANNEL })
    expect(revalidatePath).toHaveBeenCalledWith(`/channels/${CHANNEL}`)
    expect(revalidatePath).toHaveBeenCalledWith('/channels/meld')
    expect(revalidatePath).toHaveBeenCalledWith('/channels')
  })
})

// ── 3. THE NEW FIELDS ─────────────────────────────────────────────────────────

describe('the fields ADR-879 added', () => {
  it('writes pillar_id, and "No Pillar" clears it to null', async () => {
    await updateChannelSettings(CHANNEL, 'meld', form({ pillar_id: PILLAR }))
    expect(patch()).toEqual({ pillar_id: PILLAR })

    updateSpy.mockClear()
    await updateChannelSettings(CHANNEL, 'meld', form({ pillar_id: '' }))
    expect(patch()).toEqual({ pillar_id: null })
  })

  it('writes display_order as a number, and falls back to 0 for junk', async () => {
    await updateChannelSettings(CHANNEL, 'meld', form({ display_order: '12' }))
    expect(patch()).toEqual({ display_order: 12 })

    updateSpy.mockClear()
    await updateChannelSettings(CHANNEL, 'meld', form({ display_order: 'abc' }))
    expect(patch()).toEqual({ display_order: 0 })
  })

  it('writes an on-list category, and SKIPS an off-list one so the stored value is never rewritten', async () => {
    await updateChannelSettings(CHANNEL, 'meld', form({ category: 'creative' }))
    expect(patch()).toEqual({ category: 'creative' })

    // 'general' is off-list BY DESIGN (ADR-879: the old free-text default). The drawer surfaces a
    // stored off-list value as a marked <option> and autosaves the whole form, so this submission
    // is that legacy value coming back around, not an operator choice. The old behavior wrote it
    // verbatim (and defaulted empty to 'general'), which let arbitrary text past the closed
    // vocabulary the CREATE action enforces. The right move is to SKIP the field — not throw
    // (that would bounce the whole autosave over an unrelated edit) and not write — leaving the
    // stored value exactly as it was: preservation, on the write side.
    updateSpy.mockClear()
    revalidatePath.mockClear()
    await updateChannelSettings(CHANNEL, 'meld', form({ category: 'general' }))
    expect(updateSpy).not.toHaveBeenCalled() // category was the only field → nothing to write
    expect(revalidatePath).not.toHaveBeenCalled()
  })

  it('an EMPTY category submission leaves the stored value alone (no more silent "general" default)', async () => {
    // Before this change an empty submission wrote 'general' — an off-list value — into the row.
    // Empty now reads as "not chosen": the field is skipped and the stored category survives.
    await updateChannelSettings(CHANNEL, 'meld', form({ category: '' }))
    expect(updateSpy).not.toHaveBeenCalled()
    expect(revalidatePath).not.toHaveBeenCalled()
  })

  it('an off-list category submitted ALONGSIDE a real edit is skipped, not fatal — the rest still saves', async () => {
    await updateChannelSettings(CHANNEL, 'meld', form({ category: 'wellness', description: 'A calmer feed.' }))
    expect(patch()).toEqual({ description: 'A calmer feed.' })
  })

  it('archives and restores through the on/off visibility control', async () => {
    await updateChannelSettings(CHANNEL, 'meld', form({ is_active: 'off' }))
    expect(patch()).toEqual({ is_active: false })

    updateSpy.mockClear()
    await updateChannelSettings(CHANNEL, 'meld', form({ is_active: 'on' }))
    expect(patch()).toEqual({ is_active: true })
  })

  it('persists a Loom cover URL and refuses anything else', async () => {
    expect(await setChannelCoverUrl(CHANNEL, 'meld', LOOM_URL)).toBeUndefined()
    expect(patch()).toEqual({ cover_image: LOOM_URL })

    updateSpy.mockClear()
    expect(await setChannelCoverUrl(CHANNEL, 'meld', 'https://evil.example.com/x.jpg')).toEqual({
      error: 'That image could not be used.',
    })
    expect(updateSpy).not.toHaveBeenCalled()
  })

  it('clears the cover back to null', async () => {
    await removeChannelCover(CHANNEL, 'meld')
    expect(patch()).toEqual({ cover_image: null })
  })
})

// ── 4. THE URL ────────────────────────────────────────────────────────────────

describe('updateChannelSlug', () => {
  it('slugifies the typed value before writing it', async () => {
    const res = await updateChannelSlug(CHANNEL, 'meld', '  Meld & Make!  ')
    expect(res).toEqual({ slug: 'meld-make' })
    expect(patch()).toEqual({ slug: 'meld-make' })
  })

  it('refuses a collision with a plain sentence instead of throwing, and writes nothing', async () => {
    maybeSingle.mockResolvedValue({ data: { id: 'other-channel' } })
    const res = await updateChannelSlug(CHANNEL, 'meld', 'movement')
    expect(res).toEqual({ error: 'Another Channel already uses that URL. Try a different one.' })
    expect(updateSpy).not.toHaveBeenCalled()
    expect(revalidatePath).not.toHaveBeenCalled()
  })

  it('refuses an empty slug', async () => {
    expect(await updateChannelSlug(CHANNEL, 'meld', '   !!!  ')).toEqual({ error: 'The URL cannot be empty.' })
    expect(updateSpy).not.toHaveBeenCalled()
  })

  it('is a no-op when the slug did not change', async () => {
    expect(await updateChannelSlug(CHANNEL, 'meld', 'meld')).toEqual({ slug: 'meld' })
    expect(updateSpy).not.toHaveBeenCalled()
  })

  it('revalidates the OLD path as well as the new one, so the abandoned URL stops serving a cache', async () => {
    await updateChannelSlug(CHANNEL, 'meld', 'meld-space')
    const paths = revalidatePath.mock.calls.map((c) => c[0])
    expect(paths).toContain('/channels/meld')
    expect(paths).toContain('/channels/meld-space')
    expect(paths).toContain(`/channels/${CHANNEL}`)
    expect(paths).toContain('/channels')
  })
})

// ── 5. THE FULL EDITOR (ADR-882) ──────────────────────────────────────────────
//
// saveChannelEdits is the OPPOSITE contract to updateChannelSettings, and that difference is the
// whole point of these tests. The drawer patches only what it submitted (a form that omits a field
// must never blank it); the editor always renders every field, so a blanked textarea genuinely means
// "no description" and the save writes the WHOLE record, URL included, in one commit.

describe('saveChannelEdits writes the whole record in one commit', () => {
  const full = () =>
    form({
      name: 'Meld Community Cowork',
      slug: 'meld-community-cowork',
      description: 'This is the hub for all Meld Outposts',
      category: 'creative',
      pillar_id: PILLAR,
      display_order: '3',
      is_active: 'on',
    })

  it('writes every field, not just the changed ones', async () => {
    const res = await saveChannelEdits(CHANNEL, 'meld-community-cowork', full())
    expect(res).toEqual({ slug: 'meld-community-cowork' })
    expect(patch()).toEqual({
      name: 'Meld Community Cowork',
      slug: 'meld-community-cowork',
      description: 'This is the hub for all Meld Outposts',
      category: 'creative',
      pillar_id: PILLAR,
      display_order: 3,
      is_active: true,
    })
  })

  it('skips an off-list category rather than writing or throwing, while the rest of the record saves', async () => {
    // The editor always renders every field, but category is the ONE deliberate exception to
    // "a blanked field means clear it": the vocabulary is closed and an off-list stored value is
    // preserved, never rewritten (ADR-879). The editor surfaces a legacy off-list value as a
    // marked <option>, so submitting it back (or submitting empty) means "no new pick" — the
    // field is left unchanged in the row, and the save must not fail over it.
    const fd = full()
    fd.set('category', 'general') // off-list by design (the old free-text default)
    const res = await saveChannelEdits(CHANNEL, 'meld-community-cowork', fd)
    expect(res).toEqual({ slug: 'meld-community-cowork' })
    expect(patch()).not.toHaveProperty('category')
    expect(patch()).toMatchObject({ name: 'Meld Community Cowork', is_active: true })
  })

  it('a cleared description is written as null, not skipped', async () => {
    const fd = full()
    fd.set('description', '   ')
    await saveChannelEdits(CHANNEL, 'meld-community-cowork', fd)
    expect(patch().description).toBeNull()
  })

  it('"No Pillar" clears the Pillar, and Archived clears is_active', async () => {
    const fd = full()
    fd.set('pillar_id', '')
    fd.set('is_active', 'off')
    await saveChannelEdits(CHANNEL, 'meld-community-cowork', fd)
    expect(patch()).toMatchObject({ pillar_id: null, is_active: false })
  })

  it('a non-numeric display order falls back to 0 rather than writing NaN', async () => {
    const fd = full()
    fd.set('display_order', 'first')
    await saveChannelEdits(CHANNEL, 'meld-community-cowork', fd)
    expect(patch().display_order).toBe(0)
  })

  it('slugifies the URL and renames in the SAME save, revalidating both paths', async () => {
    const fd = full()
    fd.set('slug', 'Meld Cowork!!')
    const res = await saveChannelEdits(CHANNEL, 'meld-community-cowork', fd)
    expect(res).toEqual({ slug: 'meld-cowork' })
    expect(patch().slug).toBe('meld-cowork')
    const paths = revalidatePath.mock.calls.map((c) => c[0])
    expect(paths).toContain('/channels/meld-community-cowork')
    expect(paths).toContain('/channels/meld-cowork')
  })

  it('falls back to the name when the URL field was emptied, so a save can never strand the page', async () => {
    const fd = full()
    fd.set('slug', '')
    const res = await saveChannelEdits(CHANNEL, 'meld-community-cowork', fd)
    expect(res).toEqual({ slug: 'meld-community-cowork' })
  })

  it('refuses a blank name in words, writing nothing', async () => {
    const fd = full()
    fd.set('name', '  ')
    expect(await saveChannelEdits(CHANNEL, 'meld', fd)).toEqual({ error: 'Name is required.' })
    expect(updateSpy).not.toHaveBeenCalled()
  })

  it('refuses a URL another Channel already holds, in words, writing nothing', async () => {
    maybeSingle.mockResolvedValue({ data: { id: 'other-channel' } })
    const fd = full()
    fd.set('slug', 'movement')
    expect(await saveChannelEdits(CHANNEL, 'meld', fd)).toEqual({
      error: 'Another Channel already uses that URL. Try a different one.',
    })
    expect(updateSpy).not.toHaveBeenCalled()
    expect(revalidatePath).not.toHaveBeenCalled()
  })

  it('does not run the collision check when the URL did not change (a Channel never clashes with itself)', async () => {
    maybeSingle.mockResolvedValue({ data: { id: CHANNEL } })
    const res = await saveChannelEdits(CHANNEL, 'meld-community-cowork', full())
    expect(res).toEqual({ slug: 'meld-community-cowork' })
    expect(updateSpy).toHaveBeenCalledTimes(1)
  })

  it('returns a write failure as a sentence rather than throwing a 500 at the operator', async () => {
    updateError.mockReturnValue({ message: 'permission denied for table topical_channels' })
    const res = await saveChannelEdits(CHANNEL, 'meld-community-cowork', full())
    expect(res).toEqual({ error: 'permission denied for table topical_channels' })
    expect(revalidatePath).not.toHaveBeenCalled()
  })
})

describe('deleteChannel', () => {
  // NOT a bare table delete. A Channel owns an open room and a forum through POLYMORPHIC scope
  // columns that carry no FK, so a `.delete()` on the row would strand both (a live room still
  // postable by anyone with the link, pointing at a Channel that no longer exists). The RPC does
  // the whole thing in one transaction; asserting on the RPC is asserting we did not regress to
  // the orphan-making version.
  it('goes through the atomic RPC, not a bare table delete, and revalidates both handles', async () => {
    expect(await deleteChannel(CHANNEL, 'meld')).toEqual({})
    expect(deleteSpy).toHaveBeenCalledWith({
      rpc: 'delete_topical_channel',
      args: { p_channel_id: CHANNEL },
    })
    const paths = revalidatePath.mock.calls.map((c) => c[0])
    expect(paths).toContain('/channels/meld')
    expect(paths).toContain('/channels')
  })

  it('surfaces a failed delete as a sentence and does not revalidate as if it worked', async () => {
    deleteError.mockReturnValue({ message: 'update or delete violates foreign key constraint' })
    expect(await deleteChannel(CHANNEL, 'meld')).toEqual({
      error: 'update or delete violates foreign key constraint',
    })
    expect(revalidatePath).not.toHaveBeenCalled()
  })
})
