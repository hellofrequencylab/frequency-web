import { describe, expect, it } from 'vitest'
import { NAV_AREAS } from '@/lib/nav-areas'
import { STUDIO_LEAVES, STUDIO_WORLDS } from './studio'
// Both catalogs still feed runtime menus. Preserve the meaningful permission drift contract;
// historical nesting geometry is retired with its unused implementation.
function normalize(href: string) { return href.split(/[?#]/)[0]!.replace(/\/$/, '') }
function shared(nav = NAV_AREAS, studio = [...STUDIO_WORLDS, ...STUDIO_LEAVES]) {
  return nav.filter(a => a.section === 'Admin').flatMap(a => {
    const leaf = studio.find(l => normalize(l.href) === normalize(a.href))
    return leaf ? [{ key: a.key, navMin: a.defaultAccess, navDomain: a.staffDomain, leafMin: leaf.min, leafDomain: leaf.staffDomain }] : []
  })
}
const divergences = (rows: { key: string; navMin: string; navDomain?: string; leafMin: string; leafDomain?: string }[]) => rows.filter(r => r.navMin !== r.leafMin || r.navDomain !== r.leafDomain).map(r => r.key)
describe('the actual runtime catalogs agree on shared operator destinations', () => {
  it('compares a nontrivial overlap and allows no unreviewed permission divergence', () => {
    expect(shared().length).toBeGreaterThanOrEqual(10)
    expect(divergences(shared())).toEqual([])
  })
  it('detects an actual page minimum or staff-domain mismatch', () => {
    const rows = shared()
    expect(divergences([{ ...rows[0]!, leafMin: 'impossible' }, ...rows.slice(1)])).toContain(rows[0]!.key)
    expect(divergences([{ ...rows[0]!, leafDomain: 'other-domain' }, ...rows.slice(1)])).toContain(rows[0]!.key)
  })
})

// Persisted area_permissions keys are a real storage contract, independent of retired geometry.
const PINNED_KEYS = ['admin-home', 'admin-community', 'lead', 'admin-programs', 'admin-growth', 'admin-crm', 'admin-vera-ai', 'admin-operations', 'admin-qr', 'admin-library', 'admin-spaces', 'admin-marketplace']
it('preserves exactly the persisted operator permission keys and live overrides', () => {
  const areas = NAV_AREAS.filter(a => a.section === 'Admin')
  expect(areas.map(a => a.key)).toEqual(PINNED_KEYS)
  for (const key of ['admin-growth', 'admin-operations', 'admin-vera-ai', 'admin-programs']) expect(areas.some(a => a.key === key)).toBe(true)
  const matched = new Set(shared().map(r => r.key))
  expect(areas.filter(a => !matched.has(a.key)).map(a => a.key)).toEqual(['lead'])
})
