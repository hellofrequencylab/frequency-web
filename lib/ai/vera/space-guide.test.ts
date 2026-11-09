import { describe, expect, it } from 'vitest'
import { SPACE_MODULES } from '@/lib/admin/modules/space-modules'
import { veraSpaceGuide, veraSwitchable, veraRoleCard, veraSwitchCard, veraSwitchName } from './space-guide'

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

describe('Vera proposes a Space switch to its owner or an admin (LIVE-2157)', () => {
  const admin = { isOwner: false, role: 'admin', canEditProfile: true, canManageMembers: true }

  it('offers the switch tool and lists each switch with its state, for an owner or admin only', () => {
    const guide = veraSpaceGuide({ ...space, entitlements: { reviews: false } }, admin)
    expect(guide).toContain('set_space_feature tool (space "sunrise")')
    expect(guide).toContain('nothing changes until they tap it')
    expect(guide).not.toContain('You cannot change a setting from this chat')
    expect(guide).toMatch(/Switches you may propose \(feature: now\): .*reviews: off/)
    expect(guide).toMatch(/crm: on/)
  })

  it('keeps an editor on explain only', () => {
    const guide = veraSpaceGuide(space, { isOwner: false, role: 'editor', canEditProfile: true, canManageMembers: false })
    expect(guide).toContain('You cannot change a setting from this chat')
    expect(guide).not.toContain('set_space_feature')
    expect(guide).not.toContain('Switches you may propose')
  })

  it('never offers money, the plan, the team list or an unknown key', () => {
    for (const fn of ['memberships', 'donations', 'shop', 'availability', 'billing', 'members', 'nope']) expect(veraSwitchable(fn), fn).toBe(false)
    for (const fn of ['reviews', 'crm', 'circles', 'email']) expect(veraSwitchable(fn), fn).toBe(true)
    const guide = veraSpaceGuide(space, admin)
    const line = guide.split('\n').find((l) => l.startsWith('Switches you may propose'))!
    for (const fn of ['memberships', 'donations', 'shop', 'availability', 'billing', 'members']) expect(line).not.toMatch(new RegExp(`\\b${fn}: `))
  })

  it('words the card from the catalog, naming every area the same switch carries', () => {
    expect(veraSwitchName('reviews')).toBe('Reviews')
    expect(veraSwitchCard('reviews', false)).toBe('Turn Reviews off in this Space?')
    const crm = veraSwitchCard('crm', false)
    expect(crm).toMatch(/^Turn CRM off in this Space\? This also turns off /)
    expect(crm).toContain('Automation')
  })
})

describe('Vera proposes who can use an area of a Space (LIVE-2185)', () => {
  const admin = { isOwner: false, role: 'admin', canEditProfile: true, canManageMembers: true }
  const withRoles = { ...space, minRoles: { reviews: 'viewer', crm: 'admin', members: 'editor', memberships: 'admin' } }

  it('offers the role tool with the Module Manager ladder and each area role now, for an owner or admin only', () => {
    const guide = veraSpaceGuide(withRoles, admin)
    expect(guide).toContain('set_space_role tool (roles, lowest first: viewer = Member, editor = Editor, moderator = Moderator, admin = Admin)')
    const line = guide.split('\n').find((l) => l.startsWith('Who can use each now'))!
    expect(line).toMatch(/reviews: viewer/)
    expect(line).toMatch(/crm: admin/)
    expect(line).not.toMatch(/\bmembers: /)
    expect(line).not.toMatch(/\bmemberships: /)
  })

  it('keeps an editor on explain only, and leaves the line out when the turn carries no roles', () => {
    const editor = veraSpaceGuide(withRoles, { isOwner: false, role: 'editor', canEditProfile: true, canManageMembers: false })
    expect(editor).not.toContain('set_space_role')
    expect(editor).not.toContain('Who can use each')
    expect(veraSpaceGuide(space, admin)).not.toContain('Who can use each')
  })

  it('words the card by who gets in, and has no card for a role off the ladder', () => {
    expect(veraRoleCard('reviews', 'viewer')).toBe('Let every member use Reviews in this Space?')
    expect(veraRoleCard('reviews', 'editor')).toBe('Let editors and up use Reviews in this Space?')
    expect(veraRoleCard('crm', 'moderator')).toBe('Let moderators and up use CRM in this Space?')
    expect(veraRoleCard('crm', 'admin')).toBe('Let only admins use CRM in this Space?')
    for (const role of ['owner', 'member', '', 'toString']) expect(veraRoleCard('crm', role), role).toBeNull()
  })
})
