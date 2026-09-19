import { describe, it, expect, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { renderToStaticMarkup } from 'react-dom/server'
import type { Space } from '@/lib/spaces/types'

// LIVE-410 moved the memberships gate to the free floor (ADR-1403 Q3). A free Space with the
// role now sees the tier editor, the same way a Business Space always did. The GateNotice from
// LIVE-231 stays in source for an operator override that raises the wall; it is not what a free
// Space reads on the code default. Three branches:
//   * a FREE Space with the gates live gets the editor (the new product truth);
//   * a Space ABOVE any remaining wall gets the editor (unchanged);
//   * a free Space while the gates are NOT live gets the editor (the beta grace window, unchanged).
// Then two source-shape facts the LIVE-231 probe still measures: no Lock glyph is imported
// anywhere on the tier-creation path, and the wall's name reaches the sentence through
// featureWallLabel, not a literal.

const state = {
  gatesLive: true,
  tiers: [] as { id: string; name: string }[],
  canManageMembers: true,
}

vi.mock('next/link', () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}))
vi.mock('@/lib/spaces/entitlements', async (orig) => ({
  ...(await orig<typeof import('@/lib/spaces/entitlements')>()),
  getSpaceCapabilities: async () => ({
    isOwner: true,
    isAdmin: true,
    role: 'admin',
    canEditProfile: true,
    canManageMembers: state.canManageMembers,
    canInvite: true,
  }),
}))
vi.mock('@/lib/spaces/memberships', () => ({
  listAllMembershipTiers: async () => state.tiers,
}))
vi.mock('@/lib/pricing/settings', () => ({
  featureGatesLive: async () => state.gatesLive,
  getPricingValues: async () => ({ take_rate: {} }),
}))
// One chainable stub stands in for every admin read on this surface: the gate-override table
// (loadFeatureGateOverrides, so the CODE gate map stands) and the tier/circle link read.
vi.mock('@/lib/supabase/admin', () => {
  const chain: Record<string, unknown> = {}
  for (const m of ['from', 'select', 'eq', 'order']) chain[m] = () => chain
  chain.then = (resolve: (v: unknown) => void) => resolve({ data: [], error: null })
  return { createAdminClient: () => chain }
})
vi.mock('@/lib/events/space-event-access', () => ({
  listSpaceEventAccess: async () => ({ data: { rows: [] } }),
}))
vi.mock('@/lib/circles/store', () => ({ listCirclesForSpace: async () => [] }))
vi.mock('@/components/spaces/membership-tier-form', () => ({
  MembershipTierForm: () => <form data-tier-editor="" />,
}))
vi.mock('@/components/spaces/membership-owner-list', () => ({ MembershipOwnerList: () => null }))
vi.mock('@/components/spaces/membership-event-access', () => ({ MembershipEventAccess: () => null }))
vi.mock('@/components/spaces/membership-circle-access', () => ({ MembershipCircleAccess: () => null }))
vi.mock('@/components/pricing/meter-upsell', () => ({ MeterUpsell: () => null }))
vi.mock('@/lib/spaces/benefits-store', () => ({ listSpaceBenefits: async () => [] }))
vi.mock('@/components/spaces/membership-benefits-form', () => ({
  MembershipBenefitsForm: () => null,
}))

import { MembershipsSection } from './section'
import { SPACE_PLAN_LABEL } from '@/lib/pricing/plans'

function space(plan: Space['plan']): Space {
  return {
    id: 'space-1',
    slug: 'moon-studio',
    name: 'Moon Studio',
    brandName: null,
    type: 'business',
    plan,
  } as unknown as Space
}

async function render(plan: Space['plan'], staffViewing = false): Promise<string> {
  const tree = await MembershipsSection({ space: space(plan), viewerProfileId: 'p1', staffViewing })
  return renderToStaticMarkup(tree)
}

const SENTENCE = `Charging your members is part of ${SPACE_PLAN_LABEL.business}`

describe('a free Space at the point of tier creation (LIVE-410)', () => {
  it('gets the editor on the code default, with no Business wall and no padlock', async () => {
    state.gatesLive = true
    state.tiers = []
    state.canManageMembers = true
    const html = await render('free')
    expect(html).toContain('data-tier-editor')
    expect(html).not.toContain(SENTENCE)
    expect(html).not.toContain('data-kind="gated"')
    expect(html).not.toMatch(/lucide-lock/)
    expect(html).not.toContain('—')
  })
})

describe('above the wall, and while the gates are not live, nothing changed', () => {
  it('a Business Space gets the editor and never sees the sentence', async () => {
    state.gatesLive = true
    state.tiers = []
    const html = await render('business')
    expect(html).toContain('data-tier-editor')
    expect(html).not.toContain(SENTENCE)
    expect(html).not.toContain('data-kind="gated"')
  })

  it('a Non Profit Space clears the floor', async () => {
    state.gatesLive = true
    const html = await render('nonprofit')
    expect(html).toContain('data-tier-editor')
    expect(html).not.toContain(SENTENCE)
  })

  it('a free Space in the grace window (gates not live) keeps the editor', async () => {
    state.gatesLive = false
    const html = await render('free')
    expect(html).toContain('data-tier-editor')
    expect(html).not.toContain(SENTENCE)
    state.gatesLive = true
  })

  it('a staff preview keeps the read-only editor whatever the plan', async () => {
    state.gatesLive = true
    const html = await render('free', true)
    expect(html).toContain('data-tier-editor')
    expect(html).not.toContain(SENTENCE)
  })
})

// ── Source shape: the two facts the LIVE-231 probe measures ─────────────────────────────────────
const PATH = [
  'app/(main)/spaces/[slug]/settings/memberships/section.tsx',
  'app/(main)/spaces/[slug]/settings/memberships/memberships-body.tsx',
  'components/spaces/membership-tier-form.tsx',
]

/** The named specifiers a file imports from lucide-react, or [] when it imports none. */
function lucideSpecifiers(src: string): string[] {
  const stmts = src.match(/import\s*\{([^}]*)\}\s*from\s*['"]lucide-react['"]/g) ?? []
  return stmts.flatMap((stmt) =>
    stmt
      .replace(/^[^{]*\{|\}[^}]*$/g, '')
      .split(',')
      .map((s) => s.trim().split(/\s+as\s+/)[0]!)
      .filter(Boolean),
  )
}

describe('the tier-creation path carries no lock, and names the wall through the gate', () => {
  it('no file on the path imports a Lock glyph from lucide-react, or writes one by hand', () => {
    for (const f of PATH) {
      const src = readFileSync(f, 'utf8')
      const locks = lucideSpecifiers(src).filter((s) => /^(Lock|LockKeyhole|LockOpen|Unlock)/.test(s))
      expect(locks, f).toEqual([])
      expect(src, f).not.toMatch(/lucide-lock|\u{1F512}/u)
    }
  })

  it('section.tsx reads the wall name off the merged gate (featureWallLabel), never as a typed plan name', () => {
    const src = readFileSync(PATH[0]!, 'utf8')
    expect(src).toMatch(/import \{ featureWallLabel \} from '@\/lib\/pricing\/feature-tiers'/)
    expect(src).toContain("featureWallLabel('space_memberships'")
    // The sentence interpolates the derived name; the plan word is not written into the JSX prose.
    expect(src).toContain('Charging your members is part of ${wall}')
    expect(src).not.toMatch(/part of Business/)
  })

  it('the write refuses with the same derived name (memberships.ts), so the two sentences cannot part', () => {
    const src = readFileSync('lib/spaces/memberships.ts', 'utf8')
    expect(src).toContain("featureWallLabel('space_memberships'")
    expect(src).not.toMatch(/comes with Business\./)
  })
})
