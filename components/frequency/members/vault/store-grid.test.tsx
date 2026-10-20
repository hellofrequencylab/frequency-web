// @vitest-environment jsdom
import { readFileSync } from 'node:fs'
import { describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'

// LIVE-1104 (LIVE-938 area 4, Vault). The Vault Store draws its grid in the members kit instead of DAWN cards and
// `bg-primary` buttons that only fit because members-ui.css repainted them.
vi.mock('@/app/(main)/crew/store/actions', () => ({ redeemItem: vi.fn(), equipCosmetic: vi.fn() }))

const base = { slug: 's', description: 'd', category: 'cosmetic', icon: 'gem', stock: null, owned: false }

describe('Vault Store (LIVE-1104)', () => {
  it('the Vault body mounts the kit store, not the DAWN widget', () => {
    const src = readFileSync('components/frequency/members/vault/vault-body.tsx', 'utf8')
    expect(src).toContain("import { FqVaultStore, SHELVES } from './store'")
    expect(src).not.toContain("from '@/components/widgets/vault/vault-store'")
  })

  it('draws redeem, owned, equip and short-balance states with kit pieces', async () => {
    const { FqStoreGrid } = await import('./store-grid')
    const html = renderToStaticMarkup(
      <FqStoreGrid
        balance={100}
        items={[
          { ...base, id: 'a', name: 'Glow border', gem_cost: 50 },
          { ...base, id: 'b', name: 'Big crown', gem_cost: 400 },
          { ...base, id: 'c', name: 'Old flair', gem_cost: 10, owned: true },
          { ...base, id: 'd', name: 'Halo', gem_cost: 10, owned: true, cosmeticSlot: 'border' as never, equipped: false },
        ]}
      />,
    )
    expect(html).toContain('class="g3"')
    expect(html).toContain('class="btn sm pa"')
    expect(html).toContain('Redeem')
    expect(html).toContain('Need 300 more')
    expect(html).toContain('Owned')
    expect(html).toContain('Equip')
    expect(html).not.toMatch(/bg-primary|rounded-card/)
  })
})
