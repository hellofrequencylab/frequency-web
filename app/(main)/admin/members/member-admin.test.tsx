import { describe, it, expect, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { sourceWithoutComments } from '@/test/source-shape'

// SCAN-755. /admin/members admits Operations / Support staff through the `members` domain
// (ADR-223), but edit profile, the sign-in link, deactivate / reactivate and delete are web_role
// janitor actions server-side. The row renders those buttons only for a janitor viewer
// (`canManageAccounts`), and every handler catches, because React 19 rethrows an error from an
// async transition to app/(main)/admin/error.tsx and one failed click replaced the whole page.

vi.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams('member=m1'),
}))
vi.mock('../actions', () => ({
  assignRole: vi.fn(), assignWebRole: vi.fn(), deactivateMember: vi.fn(), reactivateMember: vi.fn(),
  sendMagicLink: vi.fn(), updateMemberProfile: vi.fn(), deleteUserAccount: vi.fn(),
}))
vi.mock('./spotlight-actions', () => ({
  toggleSpotlightEnabled: vi.fn(), resetSpotlightToDefault: vi.fn(), forceUnpublishSpotlight: vi.fn(),
}))
vi.mock('./economy-panel', () => ({ EconomyPanel: () => <div data-economy /> }))

import { MemberAdmin } from './member-admin'

const member = (over: Partial<Parameters<typeof MemberAdmin>[0]['members'][number]> = {}) => ({
  id: 'm1',
  auth_user_id: 'auth-1',
  display_name: 'Mara Member',
  handle: 'mara',
  avatar_url: null,
  bio: null,
  community_role: 'member',
  web_role: 'none',
  is_active: true,
  is_system: false,
  created_at: '2026-09-14T18:00:00Z',
  current_season_rank: null,
  current_season_zaps: null,
  regionName: null,
  spotlightEnabled: false,
  ...over,
})

const html = (props: Partial<Parameters<typeof MemberAdmin>[0]> = {}) =>
  renderToStaticMarkup(<MemberAdmin members={[member(props.members?.[0] ?? {})]} emailMap={{}} {...props} />)

const JANITOR_ONLY = ['Edit profile', 'Send sign-in link', 'Deactivate', 'Delete account']

describe('member row actions are gated by the viewer, not by the page admit', () => {
  it('shows a support staffer the roster and Spotlight switch but none of the janitor-only buttons', () => {
    const h = html()
    expect(h).toContain('Mara Member')
    expect(h).toContain('Turn on Spotlight')
    for (const label of JANITOR_ONLY) expect(h).not.toContain(label)
    expect(h).not.toContain('Reactivate')
  })

  it('shows a janitor viewer every account button', () => {
    const h = html({ canManageAccounts: true })
    for (const label of JANITOR_ONLY) expect(h).toContain(label)
  })

  it('keeps Reactivate behind the same gate (inactive rows sit behind the Show inactive toggle, so this pins the source)', () => {
    const src = sourceWithoutComments('app/(main)/admin/members/member-admin.tsx', { imports: false })
    expect(src).toMatch(/\{!canManageAccounts \? null : !m\.is_active \? \(\s*<Button[^>]*onClick=\{handleReactivate\}/)
  })

  it('defaults to the gated view when the page passes no flag', () => {
    expect(html({ canManageAccounts: undefined })).not.toContain('Edit profile')
  })
})

describe('the page computes the flag from the janitor web_role and passes it down', () => {
  const page = sourceWithoutComments('app/(main)/admin/members/page.tsx', { imports: false })
  it('passes canManageAccounts from isJanitor(caller.webRole), not from the staff domain admit', () => {
    expect(page).toMatch(/isJanitorViewer = !!caller && isJanitor\(caller\.webRole\)/)
    expect(page).toMatch(/canManageAccounts = isJanitorViewer/)
    expect(page).toMatch(/canManageAccounts=\{canManageAccounts\}/)
  })
})

describe('every row handler catches its action so a throw lands in the status line', () => {
  const src = sourceWithoutComments('app/(main)/admin/members/member-admin.tsx', { imports: false })
  const body = (name: string) => {
    const start = src.indexOf(`function ${name}(`)
    expect(start, name).toBeGreaterThan(-1)
    const end = src.indexOf('\n  function ', start + 10)
    return src.slice(start, end < 0 ? src.length : end)
  }
  for (const name of [
    'handleRoleChange', 'handleWebRoleChange', 'handleSendMagicLink', 'handleDeactivate',
    'handleReactivate', 'handleDelete', 'handleProfileSave', 'handleToggleSpotlight',
  ]) {
    it(`${name} wraps the await in try/catch and reports the error`, () => {
      const b = body(name)
      expect(b).toMatch(/try\s*\{/)
      expect(b).toMatch(/catch \(err\)/)
      expect(b).toContain('setStatus(`Error: ')
    })
  }

  it('handleProfileSave closes the form only after the save succeeded', () => {
    const b = body('handleProfileSave')
    expect(b.indexOf('await updateMemberProfile')).toBeLessThan(b.indexOf('setEditMode(false)'))
    expect(b.indexOf('setEditMode(false)')).toBeLessThan(b.indexOf('catch (err)'))
  })

  it('carries no em dash in the copy it renders', () => {
    expect(html({ canManageAccounts: true })).not.toContain('—')
  })
})
