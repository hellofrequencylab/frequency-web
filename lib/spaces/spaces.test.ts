import { describe, it, expect } from 'vitest'
import { activeVerticalsForSpace } from './index'
import { VERTICALS } from '@/lib/verticals'
import type { Space } from './types'

function makeSpace(over: Partial<Space>): Space {
  return {
    id: 's1',
    slug: 'demo',
    name: 'Demo',
    type: 'business',
    status: 'active',
    entityId: 'e1',
    skin: 'default',
    domain: null,
    networkConnected: false,
    enabledVerticals: [],
    ownerProfileId: null,
    brandName: null,
    brandLogoUrl: null,
    brandAccent: null,
    entitlements: {},
    featureRoles: {},
    ...over,
  }
}

describe('spaces ↔ verticals join (ADR-250 step 6)', () => {
  it('the root space exposes every registered vertical', () => {
    const root = makeSpace({ type: 'root', slug: 'frequency' })
    expect(activeVerticalsForSpace(root).map((v) => v.id).sort()).toEqual(
      VERTICALS.map((v) => v.id).sort(),
    )
  })

  it('a non-root space exposes only the verticals it switched on', () => {
    const off = makeSpace({ enabledVerticals: [] })
    expect(activeVerticalsForSpace(off)).toHaveLength(0)

    const on = makeSpace({ enabledVerticals: ['market'] })
    expect(activeVerticalsForSpace(on).map((v) => v.id)).toEqual(['market'])
  })
})
