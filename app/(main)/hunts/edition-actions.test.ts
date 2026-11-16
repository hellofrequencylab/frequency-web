import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  getCallerProfile: vi.fn(),
  requireAdmin: vi.fn(),
  proposeAndConfirmCreate: vi.fn(),
  releaseEdition: vi.fn(),
  loadRegularsImport: vi.fn(),
  loadQrCampaignImport: vi.fn(),
  createImportedDraft: vi.fn(),
}))
vi.mock('@/lib/auth', () => ({ getCallerProfile: mocks.getCallerProfile }))
vi.mock('@/lib/admin/guard', () => ({ requireAdmin: mocks.requireAdmin }))
vi.mock('@/lib/ai/vera/create-entity', () => ({ proposeAndConfirmCreate: mocks.proposeAndConfirmCreate }))
vi.mock('@/lib/hunts/edition-store', () => ({
  releaseEdition: mocks.releaseEdition, loadRegularsImport: mocks.loadRegularsImport, loadQrCampaignImport: mocks.loadQrCampaignImport,
  createImportedDraft: mocks.createImportedDraft,
}))

import { importQrCampaignAction, importRegularsHuntAction, releaseEditionAction } from './edition-actions'

const ID = '00000000-0000-4000-a044-0000000000a1'
const imported = {
  draft: { title: 'Harbor Hop', hook: '', area: 'Harbor Books', audience: '', stops: [], routeTestedAtRevision: null, permissionConfirmed: false },
  note: { source: 'regulars', sourceId: ID, importedAt: '2026-11-16T00:00:00Z' },
  notices: ['This is a new draft.'],
}

beforeEach(() => {
  vi.stubEnv('HUNTS_ENABLED', 'on')
  vi.stubEnv('HUNTS_AUTHORING_ENABLED', 'on')
  mocks.getCallerProfile.mockResolvedValue({ id: 'owner' })
  mocks.proposeAndConfirmCreate.mockImplementation(async (input: { commit: (ctx: { actorProfileId: string }) => Promise<unknown> }) => ({ data: await input.commit({ actorProfileId: 'owner' }) }))
  mocks.createImportedDraft.mockResolvedValue({ huntId: 'hunt-new' })
})
afterEach(() => {
  vi.unstubAllEnvs()
  vi.resetAllMocks()
})

describe('releaseEditionAction', () => {
  const input = { huntId: ID, baseRevision: 4, label: 'Summer', visibility: 'public', permissionConfirmed: true }

  it('releases with the derived profile and reports what happened to the printed codes and runs', async () => {
    mocks.releaseEdition.mockResolvedValue({ ok: true, versionNo: 2, carried: 3, retired: ['sign-a'], pinnedRuns: 5 })
    expect(await releaseEditionAction(input)).toEqual({ data: { released: true, versionNo: 2, carried: 3, retired: 1, pinnedRuns: 5 } })
    expect(mocks.releaseEdition).toHaveBeenCalledWith(ID, { profileId: 'owner' }, { baseRevision: 4, label: 'Summer', visibility: 'public', permissionConfirmed: true })
  })

  it('carries a stale tab, an open checklist and a refusal back in plain words', async () => {
    mocks.releaseEdition.mockResolvedValueOnce({ ok: false, reason: 'conflict', currentRevision: 9 })
    expect(await releaseEditionAction(input)).toEqual({ data: { conflict: true, currentRevision: 9 } })
    mocks.releaseEdition.mockResolvedValueOnce({ ok: false, reason: 'checklist', items: [] })
    expect(await releaseEditionAction(input)).toEqual({ data: { blocked: true, items: [] } })
    mocks.releaseEdition.mockResolvedValueOnce({ ok: false, reason: 'forbidden' })
    expect(await releaseEditionAction(input)).toEqual({ error: 'Only the trail owner or an admin can release an edition.' })
    mocks.releaseEdition.mockRejectedValueOnce(new Error('db'))
    expect(await releaseEditionAction(input)).toEqual({ error: 'The edition could not be released. Try again.' })
  })

  it('refuses a malformed request, a signed-out caller and everyone while authoring is off', async () => {
    expect(await releaseEditionAction({ ...input, huntId: 'nope' })).toHaveProperty('error')
    mocks.getCallerProfile.mockResolvedValueOnce(null)
    expect(await releaseEditionAction(input)).toEqual({ error: 'Sign in first.' })
    vi.stubEnv('HUNTS_AUTHORING_ENABLED', '')
    expect(await releaseEditionAction(input)).toEqual({ error: 'Trails are not open yet.' })
    expect(await importRegularsHuntAction({ spaceId: ID, legacyHuntId: ID })).toEqual({ error: 'Trails are not open yet.' })
    expect(await importQrCampaignAction({ challengeId: ID })).toEqual({ error: 'Trails are not open yet.' })
    expect(mocks.releaseEdition).not.toHaveBeenCalled()
    expect(mocks.requireAdmin).not.toHaveBeenCalled()
    expect(mocks.proposeAndConfirmCreate).not.toHaveBeenCalled()
  })
})

describe('import actions', () => {
  it('a Regulars import is a governed create of a private draft, with its notices', async () => {
    mocks.loadRegularsImport.mockResolvedValue(imported)
    expect(await importRegularsHuntAction({ spaceId: ID, legacyHuntId: ID })).toEqual({ data: { huntId: 'hunt-new', notices: ['This is a new draft.'] } })
    expect(mocks.proposeAndConfirmCreate.mock.calls[0][0]).toMatchObject({ entity: 'hunt', draft: { title: 'Harbor Hop', area: 'Harbor Books' } })
    expect(mocks.createImportedDraft).toHaveBeenCalledWith('owner', imported)
  })

  it('a hunt the caller may not read imports nothing', async () => {
    mocks.loadRegularsImport.mockResolvedValue(null)
    expect(await importRegularsHuntAction({ spaceId: ID, legacyHuntId: ID })).toEqual({ error: 'That hunt could not be found.' })
    expect(await importRegularsHuntAction({ spaceId: 'x', legacyHuntId: ID })).toEqual({ error: 'That hunt could not be found.' })
    expect(mocks.proposeAndConfirmCreate).not.toHaveBeenCalled()
  })

  it('a QR campaign import passes the host QR gate before it reads the campaign', async () => {
    mocks.loadQrCampaignImport.mockResolvedValue({ ...imported, note: { ...imported.note, source: 'qr_campaign' } })
    expect(await importQrCampaignAction({ challengeId: ID })).toEqual({ data: { huntId: 'hunt-new', notices: ['This is a new draft.'] } })
    expect(mocks.requireAdmin).toHaveBeenCalledWith('host', { staff: 'qr' })
    expect(mocks.requireAdmin.mock.invocationCallOrder[0]).toBeLessThan(mocks.loadQrCampaignImport.mock.invocationCallOrder[0])
    mocks.requireAdmin.mockRejectedValueOnce(new Error('NEXT_REDIRECT'))
    await expect(importQrCampaignAction({ challengeId: ID })).rejects.toThrow('NEXT_REDIRECT')
    expect(mocks.loadQrCampaignImport).toHaveBeenCalledTimes(1)
  })
})
