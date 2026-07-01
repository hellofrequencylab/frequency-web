import { describe, it, expect } from 'vitest'
import { canSeeMenuItem, type MenuViewer } from './menu-role'
import type { ResolvedItem } from '@/lib/menus/types'

// The runtime menu gate (components/layout/menu-role). These lock the DATA predicate added for the
// operator "My Spaces" nav item: `requiresOperatedSpaces` is a HARD veto — an item that opts in is
// hidden unless the viewer's context carries `operatesSpaces: true`, regardless of role/staff. An
// item WITHOUT the flag is unaffected (the usual role/staff gate alone decides).

// A minimal active leaf item at the given access floor; spread overrides to set the data predicate.
function item(over: Partial<ResolvedItem> = {}): ResolvedItem {
  return {
    id: 'operated-spaces',
    label: 'My Spaces',
    href: '/spaces/operating',
    position: 0,
    colSpan: 1,
    mode: 'active',
    roleModes: {},
    minAccess: 'member',
    ...over,
  }
}

const member: MenuViewer = { viewerRole: 'member', staffRole: null }

describe('canSeeMenuItem — requiresOperatedSpaces data gate', () => {
  it('shows a requiresOperatedSpaces item when the viewer operates a Space', () => {
    const viewer: MenuViewer = { ...member, operatesSpaces: true }
    expect(canSeeMenuItem(item({ requiresOperatedSpaces: true }), viewer)).toBe(true)
  })

  it('hides a requiresOperatedSpaces item when the viewer operates none', () => {
    const viewer: MenuViewer = { ...member, operatesSpaces: false }
    expect(canSeeMenuItem(item({ requiresOperatedSpaces: true }), viewer)).toBe(false)
  })

  it('treats a missing operatesSpaces flag as "does not operate" (hidden)', () => {
    // No operatesSpaces key at all — the default is a hidden veto, never a leak.
    expect(canSeeMenuItem(item({ requiresOperatedSpaces: true }), member)).toBe(false)
  })

  it('is a HARD veto: even a janitor-level viewer is hidden without an operated Space', () => {
    const janitor: MenuViewer = { viewerRole: 'janitor', staffRole: null, operatesSpaces: false }
    expect(canSeeMenuItem(item({ requiresOperatedSpaces: true }), janitor)).toBe(false)
  })

  it('leaves an item WITHOUT the flag unaffected by operatesSpaces', () => {
    expect(canSeeMenuItem(item(), { ...member, operatesSpaces: false })).toBe(true)
    expect(canSeeMenuItem(item(), { ...member, operatesSpaces: true })).toBe(true)
  })
})
