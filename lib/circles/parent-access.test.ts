import { describe, expect, it } from 'vitest'
import { canReadCircleParentSpace, type CircleParentSpace } from './parent-access'
const parent = (over: Partial<CircleParentSpace> = {}): CircleParentSpace => ({ id: 'space', status: 'active', visibility: 'network', owner_profile_id: 'owner', entitlements: {}, ...over })
const viewer = { role: 'viewer', canEditProfile: false }
const writer = { role: 'editor', canEditProfile: true }
describe('pure parent Space wall', () => {
  it('allows enabled network Spaces, but never treats missing metadata as legacy', () => { expect(canReadCircleParentSpace(parent())).toBe(true); expect(canReadCircleParentSpace(null)).toBe(false) })
  it('denies a private parent to an outsider even when its Circle is open', () => { expect(canReadCircleParentSpace(parent({ visibility: 'private' }))).toBe(false) })
  it('allows private Space viewers only while the module is enabled', () => { expect(canReadCircleParentSpace(parent({ visibility: 'private' }), viewer)).toBe(true); expect(canReadCircleParentSpace(parent({ visibility: 'private', entitlements: { circles: false } }), viewer)).toBe(false) })
  it('preserves canonical writer/staff stewardship of disabled modules', () => { expect(canReadCircleParentSpace(parent({ entitlements: { circles: false } }), writer)).toBe(true); expect(canReadCircleParentSpace(parent({ visibility: 'private', entitlements: { circles: false } }), writer)).toBe(true) })
  it.each(['suspended', 'draft', 'archived'])('denies %s parents even for writers', status => { expect(canReadCircleParentSpace(parent({ status }), writer)).toBe(false) })
  it('fails closed on unexpected visibility', () => { expect(canReadCircleParentSpace(parent({ visibility: 'broken' }), writer)).toBe(false) })
})
