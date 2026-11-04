import { describe, expect, it } from 'vitest'
import { SPACE_MODULES } from '@/lib/admin/modules/space-modules'
import { veraSpaceGuide } from './space-guide'

const space = { name: 'Sunrise Studio', slug: 'sunrise', entitlements: {} }
const owner = { isOwner: true, role: 'admin', canEditProfile: true }

describe('Vera knows the Space settings (LIVE-2147)', () => {
  it('lists every area from the Space module catalog, with what it does and where it lives', () => {
    const guide = veraSpaceGuide(space, owner)
    for (const m of SPACE_MODULES) expect(guide, m.id).toContain(`- ${m.label}: `)
    const basics = SPACE_MODULES.find((m) => m.id === 'space.basics')!
    expect(guide).toContain(`Where: ${basics.deepLink!('sunrise')}`)
    expect(guide).toContain('They help run it as its owner.')
  })

  it('says she cannot change a setting from chat, and money and deleting stay with the owner', () => {
    const guide = veraSpaceGuide(space, owner)
    expect(guide).toContain('You cannot change a setting from this chat')
    expect(guide).toContain('never say you changed one')
    expect(guide).toMatch(/- Danger zone: .*\(owner changes it by hand\)/)
  })

  it('names the areas turned off in this Space and where to turn them on', () => {
    const shop = SPACE_MODULES.find((m) => m.gate.kind === 'feature')!
    const fn = shop.gate.kind === 'feature' ? shop.gate.fn : 'shop'
    const guide = veraSpaceGuide({ ...space, entitlements: { [fn]: false } }, owner)
    expect(guide).not.toContain(`- ${shop.label}: `)
    expect(guide).toContain('Turned off in this Space (turn one on from /spaces/sunrise/manage/modules)')
    expect(guide).toContain(shop.label)
  })

  it('gives nothing to someone who cannot help run the Space', () => {
    expect(veraSpaceGuide(space, { isOwner: false, role: 'member', canEditProfile: false })).toBe('')
    expect(veraSpaceGuide(space, { isOwner: false, role: null, canEditProfile: false })).toBe('')
  })

  it('reads a malformed entitlements blob as everything on', () => {
    const guide = veraSpaceGuide({ ...space, entitlements: ['nope'] }, { isOwner: false, role: 'editor', canEditProfile: true })
    expect(guide).not.toContain('Turned off')
    expect(guide).toContain('as an editor')
  })
})
