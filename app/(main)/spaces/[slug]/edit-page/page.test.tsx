import { beforeEach, expect, it, vi } from 'vitest'

const fake = vi.hoisted(() => ({
  caller: vi.fn(), space: vi.fn(), access: vi.fn(), load: vi.fn(),
  redirect: vi.fn((href: string) => { throw new Error(`redirect:${href}`) }),
  notFound: vi.fn(() => { throw new Error('not found') }),
}))
vi.mock('next/navigation', () => ({ redirect: fake.redirect, notFound: fake.notFound }))
vi.mock('@/lib/auth', () => ({ getCallerProfile: fake.caller }))
vi.mock('@/lib/spaces/store', () => ({ getVisibleSpaceBySlug: fake.space }))
vi.mock('@/lib/spaces/entitlements', () => ({ resolveSpaceManageAccess: fake.access }))
vi.mock('@/lib/spaces/active-space', () => ({ setActiveSpace: vi.fn() }))
vi.mock('@/lib/page-editor/config', () => ({ config: { components: {} } }))
vi.mock('@/lib/page-editor/block-render', () => ({ BlockRender: () => null }))
vi.mock('@/lib/page-editor/templates/space-blocks', () => ({ withVisibleBlocks: (doc: unknown) => doc }))
vi.mock('@/lib/spaces/profile-pages', () => ({ HOME_SLUG: 'home', hasPage: (_prefs: unknown, page: string) => ['home', 'about'].includes(page), readPageDoc: () => ({ root: {}, content: [] }) }))
vi.mock('@/lib/spaces/page-doc', () => ({ loadSpacePageDoc: fake.load }))
vi.mock('@/lib/spaces/profile-data', () => ({ readProfileData: () => ({}) }))
vi.mock('@/lib/spaces/profile-config', () => ({ defaultPrimaryCtaLabel: () => 'Visit' }))
vi.mock('@/lib/spaces/content-data', () => ({ getSpaceContentData: async () => ({}) }))
vi.mock('@/lib/spaces/team-picks', () => ({ resolveTeamPicksForDoc: async () => [] }))
vi.mock('@/components/spaces/staff-preview-banner', () => ({ StaffPreviewBanner: () => null }))
vi.mock('@/components/spaces/space-landing-editor', () => ({ SpaceLandingEditor: () => null }))

import Page from './page'
const doc = { root: {}, content: [{ type: 'Text', props: { id: 'story', body: 'Saved story' } }] }
const space = { id: 'space-id', slug: 'willow', name: 'Willow', preferences: { pageDocs: { home: doc, about: doc }, profileLayout: { order: ['about'] } } }
const render = (page?: string) => Page({ params: Promise.resolve({ slug: 'willow' }), searchParams: Promise.resolve({ page }) })
beforeEach(() => {
  vi.clearAllMocks()
  fake.caller.mockResolvedValue({ id: 'owner', webRole: 'none' })
  fake.space.mockResolvedValue(structuredClone(space))
  fake.access.mockResolvedValue({ canManage: true, staffViewing: false })
  fake.load.mockResolvedValue(doc)
})
it.each([undefined, 'home', ' HOME ', ''])('redirects the authorized Home entry %s to the canonical profile sidebar', async (page) => {
  const before = structuredClone(space)
  await expect(render(page)).rejects.toThrow('redirect:/spaces/willow?edit=page')
  expect(fake.load).not.toHaveBeenCalled()
  expect(space).toEqual(before)
  expect((await fake.space.mock.results[0].value).preferences).toEqual(before.preferences)
})
it('does not disclose the destination to a caller without edit or staff-preview access', async () => {
  fake.access.mockResolvedValue({ canManage: false, staffViewing: false })
  await expect(render()).rejects.toThrow('not found')
  expect(fake.redirect).not.toHaveBeenCalled()
})
it('rejects hidden Spaces and undeclared pages before redirecting or loading content', async () => {
  fake.space.mockResolvedValueOnce(null)
  await expect(render()).rejects.toThrow('not found')
  await expect(render('private-other-page')).rejects.toThrow('not found')
  expect(fake.redirect).not.toHaveBeenCalled()
  expect(fake.load).not.toHaveBeenCalled()
})
it('keeps the saved custom-page document editable under its original identity', async () => {
  const result = await render('about')
  expect(fake.redirect).not.toHaveBeenCalled()
  expect(fake.load).toHaveBeenCalledWith(space.preferences, 'Willow', 'about')
  expect(result.props).toMatchObject({ pageSlug: 'about', data: doc, customized: true })
})
it('keeps custom-page staff preview read-only and sends staff Home to the gated owner preview', async () => {
  fake.access.mockResolvedValue({ canManage: false, staffViewing: true })
  const result = await render('about')
  expect(result.props.pageSlug).toBeUndefined()
  expect(fake.redirect).not.toHaveBeenCalled()
  await expect(render()).rejects.toThrow('redirect:/spaces/willow?edit=page')
})
