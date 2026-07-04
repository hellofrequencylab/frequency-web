import { describe, it, expect } from 'vitest'
import { APPS, appById } from './catalog'
import { toAdminModule } from './adapters'
import { ADMIN_MODULES } from '@/lib/admin/modules/registry'

// ADR-516 Phase B — the per-module SURFACE predicate. The personal "You" editors mount inline ONLY where
// their subject lives; everything else keeps today's "anywhere" behavior (absent predicate).

/** Whether an editor App's surface predicate matches a path (absent = matches anywhere). */
function matches(id: string, path: string): boolean {
  const surfaces = appById(id)?.surfaces.editor?.surfaces
  if (!surfaces || surfaces.length === 0) return true
  return surfaces.some((re) => re.test(path))
}

describe('the personal-editor surface predicate', () => {
  it('mounts the Profile editor on the profile page and the profile settings page, NOT /settings or a content page', () => {
    expect(matches('account.profile', '/people/ada')).toBe(true)
    expect(matches('account.profile', '/settings/profile')).toBe(true)
    expect(matches('account.profile', '/settings')).toBe(false)
    expect(matches('account.profile', '/settings/appearance')).toBe(false)
    expect(matches('account.profile', '/feed')).toBe(false)
  })

  it('mounts Spotlight like Profile, and Layout only on the profile page', () => {
    expect(matches('account.spotlight', '/people/ada')).toBe(true)
    expect(matches('account.spotlight', '/settings/profile')).toBe(true)
    expect(matches('account.spotlight', '/settings')).toBe(false)

    expect(matches('account.layout', '/people/ada')).toBe(true)
    expect(matches('account.layout', '/settings/profile')).toBe(false) // Layout edits the profile page only
    expect(matches('account.layout', '/settings')).toBe(false)
  })

  it('leaves scope-gated management editors unpredicated (they mount anywhere their scope matches)', () => {
    expect(matches('circle.settings', '/circles/sunrise-sit')).toBe(true)
    expect(appById('circle.settings')?.surfaces.editor?.surfaces).toBeUndefined()
  })
})

describe('surfaces round-trips through the catalog ⇄ adapter (App ⇄ AdminModule)', () => {
  it('carries `surfaces` byte-for-byte both directions, keeping the whole round-trip green', () => {
    for (const m of ADMIN_MODULES) {
      const app = APPS.find((a) => a.id === m.id && a.surfaces.editor)!
      expect(app.surfaces.editor?.surfaces, m.id).toEqual(m.surfaces)
      expect(toAdminModule(app), m.id).toEqual(m)
    }
  })
})
