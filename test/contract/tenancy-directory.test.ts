import { describe, it, expect, beforeEach, vi } from 'vitest'
import { makeSupabaseRecorder, recorded, makeTwoSpaceDb, SPACE_A, SPACE_B, type SupabaseRecorder } from './tenancy'

// ════════════════════════════════════════════════════════════════════════════════════════════════
// SEC-02 - THE /spaces DIRECTORY leak contract. The directory (app/(main)/spaces/directory/page.tsx) lists
// Spaces via lib/spaces/discovery.ts → listNetworkedSpaces. Unlike an entity module it is INTENTIONALLY
// cross-space (it browses many Spaces), so its tenancy boundary is NOT a space_id filter but a
// VISIBILITY filter: only `visibility = 'network'` + `network_connected = true` (ADR-811 §3, the collective
// world gate) + `status = 'active'`, never the root. A PRIVATE or a DISCONNECTED (standalone / Independent)
// Space must therefore NEVER appear to a non-member through the directory. These lock that boundary so a
// refactor that drops the visibility OR the network_connected gate (and starts listing walled Spaces) fails CI.
// ════════════════════════════════════════════════════════════════════════════════════════════════

const h = vi.hoisted(() => ({ client: null as unknown }))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => h.client }))
// discovery imports follows for the "Following" filter; stub the follow read so the default
// (unfiltered) path doesn't touch a real follows table.
vi.mock('@/lib/spaces/follows', () => ({ listFollowedSpaceIds: async () => new Set<string>() }))

const rec = () => h.client as SupabaseRecorder

beforeEach(() => {
  h.client = makeSupabaseRecorder({ data: [], error: null })
})

describe('directory: the discovery query is walled to networked, active, non-root Spaces', () => {
  it('listNetworkedSpaces binds visibility=network AND network_connected=true AND status=active AND excludes the root', async () => {
    const { listNetworkedSpaces } = await import('@/lib/spaces/discovery')
    await listNetworkedSpaces()
    // The boundary filters that keep a Private / disconnected / suspended / root Space out of the directory.
    expect(recorded(rec(), 'eq', 'visibility', 'network')).toBe(true)
    expect(recorded(rec(), 'eq', 'network_connected', true)).toBe(true)
    expect(recorded(rec(), 'eq', 'status', 'active')).toBe(true)
    expect(recorded(rec(), 'neq', 'type', 'root')).toBe(true)
  })

  it('LEAK ORACLE: a private Space never appears in the directory for a non-member', async () => {
    // Seed one networked + one private Space; the fake honors the .eq('visibility','network') filter
    // the reader applies, so a reader that DROPPED the visibility gate would surface the private row.
    h.client = makeTwoSpaceDb({
      spaces: [
        { space_id: SPACE_A, id: SPACE_A, slug: 'public-a', name: 'Public A', type: 'practitioner', status: 'active', visibility: 'network', network_connected: true, brand_name: null, brand_logo_url: null, tagline: null },
        { space_id: SPACE_B, id: SPACE_B, slug: 'private-b', name: 'Private B', type: 'practitioner', status: 'active', visibility: 'private', network_connected: true, brand_name: null, brand_logo_url: null, tagline: null },
      ],
      // member-count read targets space_members; empty is fine (counts default to null).
      space_members: [],
    })
    const { listNetworkedSpaces } = await import('@/lib/spaces/discovery')
    const rows = await listNetworkedSpaces()
    const ids = rows.map((r) => r.id)
    expect(ids).toContain(SPACE_A) // the networked Space is listed
    expect(ids).not.toContain(SPACE_B) // the PRIVATE Space is walled off (no leak)
  })

  it('LEAK ORACLE: a DISCONNECTED networked Space is walled off (the collective world gate, ADR-811 §3)', async () => {
    // Both are visibility=network + active; only SPACE_A is network_connected. A reader that DROPPED the
    // network_connected gate would surface the standalone (Independent) Space B in the collective directory.
    h.client = makeTwoSpaceDb({
      spaces: [
        { space_id: SPACE_A, id: SPACE_A, slug: 'connected-a', name: 'Connected A', type: 'business', status: 'active', visibility: 'network', network_connected: true, brand_name: null, brand_logo_url: null, tagline: null },
        { space_id: SPACE_B, id: SPACE_B, slug: 'standalone-b', name: 'Standalone B', type: 'business', status: 'active', visibility: 'network', network_connected: false, brand_name: null, brand_logo_url: null, tagline: null },
      ],
      space_members: [],
    })
    const { listNetworkedSpaces } = await import('@/lib/spaces/discovery')
    const rows = await listNetworkedSpaces()
    expect(rows.map((r) => r.id)).toEqual([SPACE_A]) // only the connected Space lists; the standalone is walled off
  })

  it('LEAK ORACLE: a suspended networked Space is also excluded (status gate)', async () => {
    h.client = makeTwoSpaceDb({
      spaces: [
        { space_id: SPACE_A, id: SPACE_A, slug: 'active-a', name: 'Active A', type: 'business', status: 'active', visibility: 'network', network_connected: true, brand_name: null, brand_logo_url: null, tagline: null },
        { space_id: SPACE_B, id: SPACE_B, slug: 'suspended-b', name: 'Suspended B', type: 'business', status: 'suspended', visibility: 'network', network_connected: true, brand_name: null, brand_logo_url: null, tagline: null },
      ],
      space_members: [],
    })
    const { listNetworkedSpaces } = await import('@/lib/spaces/discovery')
    const rows = await listNetworkedSpaces()
    expect(rows.map((r) => r.id)).toEqual([SPACE_A])
  })
})
