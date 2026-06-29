import { describe, it, expect, beforeEach, vi } from 'vitest'
import { makeSupabaseRecorder, recorded, makeTwoSpaceDb, SPACE_A, SPACE_B, type SupabaseRecorder } from './tenancy'

// ════════════════════════════════════════════════════════════════════════════════════════════════
// SEC-02 - THE /spaces DIRECTORY leak contract. The directory (app/(main)/spaces/directory/page.tsx) lists
// Spaces via lib/spaces/discovery.ts → listNetworkedSpaces. Unlike an entity module it is INTENTIONALLY
// cross-space (it browses many Spaces), so its tenancy boundary is NOT a space_id filter but a
// VISIBILITY filter: only `visibility = 'network'` + `status = 'active'`, never the root. A PRIVATE
// Space must therefore NEVER appear to a non-member through the directory. These lock that boundary so
// a refactor that drops the visibility gate (and starts listing private Spaces) fails CI.
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
  it('listNetworkedSpaces binds visibility=network AND status=active AND excludes the root', async () => {
    const { listNetworkedSpaces } = await import('@/lib/spaces/discovery')
    await listNetworkedSpaces()
    // The three boundary filters that keep a Private (or suspended, or root) Space out of the directory.
    expect(recorded(rec(), 'eq', 'visibility', 'network')).toBe(true)
    expect(recorded(rec(), 'eq', 'status', 'active')).toBe(true)
    expect(recorded(rec(), 'neq', 'type', 'root')).toBe(true)
  })

  it('LEAK ORACLE: a private Space never appears in the directory for a non-member', async () => {
    // Seed one networked + one private Space; the fake honors the .eq('visibility','network') filter
    // the reader applies, so a reader that DROPPED the visibility gate would surface the private row.
    h.client = makeTwoSpaceDb({
      spaces: [
        { space_id: SPACE_A, id: SPACE_A, slug: 'public-a', name: 'Public A', type: 'practitioner', status: 'active', visibility: 'network', brand_name: null, brand_logo_url: null, tagline: null },
        { space_id: SPACE_B, id: SPACE_B, slug: 'private-b', name: 'Private B', type: 'practitioner', status: 'active', visibility: 'private', brand_name: null, brand_logo_url: null, tagline: null },
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

  it('LEAK ORACLE: a suspended networked Space is also excluded (status gate)', async () => {
    h.client = makeTwoSpaceDb({
      spaces: [
        { space_id: SPACE_A, id: SPACE_A, slug: 'active-a', name: 'Active A', type: 'business', status: 'active', visibility: 'network', brand_name: null, brand_logo_url: null, tagline: null },
        { space_id: SPACE_B, id: SPACE_B, slug: 'suspended-b', name: 'Suspended B', type: 'business', status: 'suspended', visibility: 'network', brand_name: null, brand_logo_url: null, tagline: null },
      ],
      space_members: [],
    })
    const { listNetworkedSpaces } = await import('@/lib/spaces/discovery')
    const rows = await listNetworkedSpaces()
    expect(rows.map((r) => r.id)).toEqual([SPACE_A])
  })
})
