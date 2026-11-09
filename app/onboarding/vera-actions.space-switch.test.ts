import { describe, it, expect, vi, beforeEach } from 'vitest'

// LIVE-2157. A tapped Space switch goes through the Module Manager's own guarded action (which re-checks the
// caller is the Space's owner or an admin), money and the team list are refused whatever the request
// carries, and a member's other confirms are untouched.

const mocks = vi.hoisted(() => ({ setSpaceFeatureEnabled: vi.fn(), setSpaceFeatureMinRole: vi.fn(), setSpaceTimeZone: vi.fn(), setSpaceSkyMarkers: vi.fn(), setSpaceCoverScrim: vi.fn(), setSpaceLogoBackdrop: vi.fn(), setSpaceHeroLook: vi.fn(), profileId: 'p1' as string | null }))

vi.mock('next/headers', () => ({ headers: async () => new Headers() }))
vi.mock('next/cache', () => ({ revalidatePath: () => {} }))
vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: mocks.profileId ? { id: 'u1' } : null } }) },
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: mocks.profileId ? { id: mocks.profileId } : null }) }) }) }),
  }),
}))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({}) }))
vi.mock('@/lib/ai/vera/turn', () => ({ runConciergeTurn: vi.fn() }))
vi.mock('@/lib/ai/vera/execute', () => ({ executeConfirmedTool: vi.fn() }))
vi.mock('@/app/(main)/circles/actions', () => ({ joinCircle: vi.fn() }))
vi.mock('@/app/(main)/spaces/[slug]/manage/modules/actions', () => ({ setSpaceFeatureEnabled: mocks.setSpaceFeatureEnabled, setSpaceFeatureMinRole: mocks.setSpaceFeatureMinRole }))

vi.mock('@/app/(main)/spaces/[slug]/settings/calendar/entry-actions', () => ({ setSpaceTimeZone: mocks.setSpaceTimeZone, setSpaceSkyMarkers: mocks.setSpaceSkyMarkers }))
vi.mock('@/app/(main)/spaces/[slug]/manage/layout/actions', () => ({
  setSpaceCoverScrim: mocks.setSpaceCoverScrim,
  setSpaceLogoBackdrop: mocks.setSpaceLogoBackdrop,
  setSpaceHeroLook: mocks.setSpaceHeroLook,
}))

import { confirmProposal } from './vera-actions'

beforeEach(() => {
  mocks.setSpaceFeatureEnabled.mockReset()
  mocks.setSpaceFeatureMinRole.mockReset()
  mocks.setSpaceTimeZone.mockReset()
  mocks.setSpaceSkyMarkers.mockReset()
  mocks.setSpaceCoverScrim.mockReset()
  mocks.setSpaceLogoBackdrop.mockReset()
  mocks.setSpaceHeroLook.mockReset()
  mocks.profileId = 'p1'
})

describe('confirming a Space switch (LIVE-2157)', () => {
  it('runs the Module Manager action and says where to switch it back', async () => {
    mocks.setSpaceFeatureEnabled.mockResolvedValue({ data: undefined })
    const res = await confirmProposal('set_space_feature', JSON.stringify({ space: 'sunrise', feature: 'reviews', on: false }))
    expect(mocks.setSpaceFeatureEnabled).toHaveBeenCalledWith('sunrise', 'reviews', false)
    expect(res).toEqual({ ok: true, message: 'Done. Reviews is off. You can switch it back any time at /spaces/sunrise/manage/modules.' })
  })

  it('passes the action refusal through when the caller does not run the Space', async () => {
    mocks.setSpaceFeatureEnabled.mockResolvedValue({ error: 'You do not have access to manage this space.' })
    const res = await confirmProposal('set_space_feature', JSON.stringify({ space: 'someone-else', feature: 'reviews', on: true }))
    expect(res).toEqual({ ok: false, error: 'You do not have access to manage this space.' })
  })

  it('refuses money, the team list and malformed args without writing', async () => {
    for (const args of [
      { space: 'sunrise', feature: 'memberships', on: false },
      { space: 'sunrise', feature: 'members', on: false },
      { space: 'sunrise', feature: 'reviews', on: 'yes' },
      { space: 'sunrise', feature: 'reviews' },
    ]) {
      const res = await confirmProposal('set_space_feature', JSON.stringify(args))
      expect(res.ok).toBe(false)
    }
    expect(mocks.setSpaceFeatureEnabled).not.toHaveBeenCalled()
  })

  it('needs a signed-in caller', async () => {
    mocks.profileId = null
    const res = await confirmProposal('set_space_feature', JSON.stringify({ space: 'sunrise', feature: 'reviews', on: false }))
    expect(res).toEqual({ ok: false, error: 'Not signed in.' })
    expect(mocks.setSpaceFeatureEnabled).not.toHaveBeenCalled()
  })
})

describe('confirming who can use an area (LIVE-2185)', () => {
  it('runs the Module Manager role action and says where to change it back', async () => {
    mocks.setSpaceFeatureMinRole.mockResolvedValue({ data: undefined })
    const res = await confirmProposal('set_space_role', JSON.stringify({ space: 'sunrise', feature: 'reviews', role: 'editor' }))
    expect(mocks.setSpaceFeatureMinRole).toHaveBeenCalledWith('sunrise', 'reviews', 'editor')
    expect(res).toEqual({ ok: true, message: 'Done. You can change who can use Reviews any time at /spaces/sunrise/manage/modules.' })
  })

  it('passes the action refusal through when the caller does not run the Space', async () => {
    mocks.setSpaceFeatureMinRole.mockResolvedValue({ error: 'You do not have access to manage this space.' })
    const res = await confirmProposal('set_space_role', JSON.stringify({ space: 'someone-else', feature: 'reviews', role: 'admin' }))
    expect(res).toEqual({ ok: false, error: 'You do not have access to manage this space.' })
  })

  it('refuses money, the team list, a role off the ladder and malformed args without writing', async () => {
    for (const args of [
      { space: 'sunrise', feature: 'memberships', role: 'admin' },
      { space: 'sunrise', feature: 'members', role: 'viewer' },
      { space: 'sunrise', feature: 'reviews', role: 'owner' },
      { space: 'sunrise', feature: 'reviews', role: 3 },
      { space: 'sunrise', feature: 'reviews' },
    ]) {
      const res = await confirmProposal('set_space_role', JSON.stringify(args))
      expect(res.ok).toBe(false)
    }
    expect(mocks.setSpaceFeatureMinRole).not.toHaveBeenCalled()
  })
})

describe('confirming a Space setting (LIVE-2186)', () => {
  it('runs the calendar page own actions and says where to change it back', async () => {
    mocks.setSpaceTimeZone.mockResolvedValue({ data: undefined })
    mocks.setSpaceSkyMarkers.mockResolvedValue({ data: undefined })
    const zone = await confirmProposal('set_space_setting', JSON.stringify({ space: 'sunrise', setting: 'calendar.time_zone', value: 'America/Chicago' }))
    expect(mocks.setSpaceTimeZone).toHaveBeenCalledWith('sunrise', 'America/Chicago')
    expect(zone).toEqual({ ok: true, message: 'Done. You can change it back any time at /spaces/sunrise/settings/calendar.' })
    await confirmProposal('set_space_setting', JSON.stringify({ space: 'sunrise', setting: 'calendar.sky_markers', value: 'off' }))
    expect(mocks.setSpaceSkyMarkers).toHaveBeenCalledWith('sunrise', false)
  })

  it('passes the page action refusal through', async () => {
    mocks.setSpaceSkyMarkers.mockResolvedValue({ error: 'You do not have access to this calendar.' })
    const res = await confirmProposal('set_space_setting', JSON.stringify({ space: 'someone-else', setting: 'calendar.sky_markers', value: 'on' }))
    expect(res).toEqual({ ok: false, error: 'You do not have access to this calendar.' })
  })

  it('refuses a setting or value off the list and malformed args without writing', async () => {
    for (const args of [
      { space: 'sunrise', setting: 'payments.payouts', value: 'on' },
      { space: 'sunrise', setting: 'calendar.time_zone', value: 'Mars/Olympus' },
      { space: 'sunrise', setting: 'calendar.sky_markers', value: true },
      { space: 'sunrise', setting: 'calendar.sky_markers' },
    ]) {
      const res = await confirmProposal('set_space_setting', JSON.stringify(args))
      expect(res.ok).toBe(false)
    }
    expect(mocks.setSpaceTimeZone).not.toHaveBeenCalled()
    expect(mocks.setSpaceSkyMarkers).not.toHaveBeenCalled()
  })
})

describe('confirming a Space page look setting (LIVE-2187)', () => {
  it('runs the page look actions with the checked value', async () => {
    for (const m of [mocks.setSpaceCoverScrim, mocks.setSpaceLogoBackdrop, mocks.setSpaceHeroLook]) m.mockResolvedValue({ data: undefined })
    const cover = await confirmProposal('set_space_setting', JSON.stringify({ space: 'sunrise', setting: 'page.cover_style', value: 'blend' }))
    expect(mocks.setSpaceCoverScrim).toHaveBeenCalledWith('sunrise', 'blend')
    expect(cover).toEqual({ ok: true, message: 'Done. You can change it back any time at /spaces/sunrise/manage/layout.' })
    await confirmProposal('set_space_setting', JSON.stringify({ space: 'sunrise', setting: 'page.logo_backdrop', value: 'none' }))
    expect(mocks.setSpaceLogoBackdrop).toHaveBeenCalledWith('sunrise', 'none')
    await confirmProposal('set_space_setting', JSON.stringify({ space: 'sunrise', setting: 'page.hero_height', value: 'tall' }))
    expect(mocks.setSpaceHeroLook).toHaveBeenCalledWith('sunrise', { height: 'tall' })
    await confirmProposal('set_space_setting', JSON.stringify({ space: 'sunrise', setting: 'page.hero_buttons', value: 'stacked' }))
    expect(mocks.setSpaceHeroLook).toHaveBeenCalledWith('sunrise', { buttonOrientation: 'stacked' })
  })

  it('refuses a value off the closed list without writing', async () => {
    for (const args of [
      { space: 'sunrise', setting: 'page.cover_style', value: 'dark' },
      { space: 'sunrise', setting: 'page.hero_height', value: 'medium' },
      { space: 'sunrise', setting: 'toString', value: 'on' },
    ]) {
      const res = await confirmProposal('set_space_setting', JSON.stringify(args))
      expect(res.ok).toBe(false)
    }
    expect(mocks.setSpaceCoverScrim).not.toHaveBeenCalled()
    expect(mocks.setSpaceHeroLook).not.toHaveBeenCalled()
  })
})
