import { beforeEach, describe, expect, it, vi } from 'vitest'
const mocks = vi.hoisted(() => ({ read: vi.fn(), caps: vi.fn(), enabled: vi.fn() }))
vi.mock('react', () => ({ cache: (fn: unknown) => fn }))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({ from: () => ({ select: () => ({ eq: () => ({ maybeSingle: mocks.read }) }) }) }) }))
vi.mock('@/lib/spaces/entitlements', () => ({ getSpaceCapabilities: mocks.caps }))
vi.mock('@/lib/spaces/functions', () => ({ spaceFunctionAvailable: mocks.enabled }))
import { canReadCircleParentSpace } from './parent-access'
beforeEach(() => { mocks.read.mockReset().mockResolvedValue({ data: { id: 'space', status: 'active', visibility: 'network' }, error: null }); mocks.enabled.mockReset().mockReturnValue(true); mocks.caps.mockReset().mockResolvedValue({ role: null, canEditProfile: false }) })
describe('parent Space wall before privileged Circle reads', () => {
  it('allows enabled network Spaces and legacy Circles', async () => { expect(await canReadCircleParentSpace('space', 'outsider')).toBe(true); expect(await canReadCircleParentSpace(null, null)).toBe(true) })
  it('denies a private parent to outsiders even when its Circle is open', async () => { mocks.read.mockResolvedValue({ data: { id: 'space', status: 'active', visibility: 'private' } }); expect(await canReadCircleParentSpace('space', 'outsider')).toBe(false) })
  it('allows an active private Space viewer only while the module is enabled', async () => { mocks.read.mockResolvedValue({ data: { id: 'space', status: 'active', visibility: 'private' } }); mocks.caps.mockResolvedValue({ role: 'viewer', canEditProfile: false }); expect(await canReadCircleParentSpace('space', 'viewer')).toBe(true); mocks.enabled.mockReturnValue(false); expect(await canReadCircleParentSpace('space', 'viewer')).toBe(false) })
  it('preserves canonical writer/staff stewardship of disabled modules', async () => { mocks.enabled.mockReturnValue(false); mocks.caps.mockResolvedValue({ role: 'admin', canEditProfile: true }); expect(await canReadCircleParentSpace('space', 'steward')).toBe(true) })
  it.each(['suspended', 'draft', 'archived'])('denies %s parents', async status => { mocks.read.mockResolvedValue({ data: { id: 'space', status, visibility: 'network' } }); expect(await canReadCircleParentSpace('space', 'owner')).toBe(false) })
  it('fails closed on lookup failures', async () => { mocks.read.mockRejectedValue(new Error('offline')); expect(await canReadCircleParentSpace('space', 'owner')).toBe(false) })
})
