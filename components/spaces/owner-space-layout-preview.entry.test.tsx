import { beforeEach, expect, it, vi } from 'vitest'
const fake = vi.hoisted(() => ({ caller: vi.fn(), space: vi.fn(), access: vi.fn(), content: vi.fn() }))
vi.mock('@/lib/auth', () => ({ getCallerProfile: fake.caller }))
vi.mock('@/lib/spaces/store', () => ({ getVisibleSpaceBySlug: fake.space }))
vi.mock('@/lib/spaces/entitlements', () => ({ resolveSpaceManageAccess: fake.access }))
vi.mock('@/lib/spaces/content-data', () => ({ getSpaceContentData: fake.content }))
vi.mock('@/lib/spaces/profile-config', () => ({ defaultPrimaryCtaLabel: () => 'Visit' }))
vi.mock('@/lib/spaces/page-doc', () => ({ loadSpaceAuthoredContent: async () => ({}) }))
vi.mock('@/lib/spaces/effective-block-content', () => ({ withEffectiveDataContent: () => ({}) }))
vi.mock('@/lib/spaces/profile-modules', () => ({ toProfileContext: (space: unknown) => space }))
vi.mock('@/lib/entity-blocks/layout', () => ({ parseEntityLayout: () => null, resolveRows: () => [] }))
vi.mock('@/components/widgets/space-profile/space-profile-modules', () => ({ renderSpaceBlockNodes: () => ({}) }))
vi.mock('@/components/entity-blocks/live-profile-grid', () => ({ LiveProfileGrid: () => null }))
vi.mock('./space-profile-editor-entry', () => ({ SpaceProfileEditorEntry: () => null }))
import { OwnerSpaceLayoutPreview } from './owner-space-layout-preview'
import { SpaceProfileEditorEntry } from './space-profile-editor-entry'

beforeEach(() => {
  vi.clearAllMocks()
  fake.caller.mockResolvedValue({ id: 'viewer', webRole: 'none' })
  fake.space.mockResolvedValue({ id: 'actual-space-id', slug: 'willow', type: 'business', preferences: { moduleMenu: { hidden: ['space.reviews'] } } })
  fake.access.mockResolvedValue({ canManage: false, staffViewing: false })
  fake.content.mockResolvedValue({})
})
it('never mounts the query-triggered editor entry for an unauthorized viewer', async () => {
  expect(await OwnerSpaceLayoutPreview({ slug: 'willow' })).toBeNull()
  expect(fake.content).not.toHaveBeenCalled()
  fake.space.mockResolvedValue(null)
  expect(await OwnerSpaceLayoutPreview({ slug: 'willow' })).toBeNull()
})
it.each([{ canManage: true, staffViewing: false }, { canManage: false, staffViewing: true }])('binds an authorized preview to the server-resolved Space (%j)', async (access) => {
  fake.access.mockResolvedValue(access)
  const result = await OwnerSpaceLayoutPreview({ slug: 'willow' })
  const entry = result!.props.children[0]
  expect(entry.type).toBe(SpaceProfileEditorEntry)
  expect(entry.props).toMatchObject({ slug: 'willow', spaceId: 'actual-space-id', spaceType: 'business', moduleMenu: { hidden: ['space.reviews'] } })
})
