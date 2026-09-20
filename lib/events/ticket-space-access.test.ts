import { describe, it, expect, vi, beforeEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { SPACE_PLAN_LABEL } from '@/lib/pricing/plans'

vi.mock('@/lib/pricing/settings', () => ({
  featureGatesLive: vi.fn(async () => true),
}))

vi.mock('@/lib/pricing/gates', async (orig) => {
  const real = await orig<typeof import('@/lib/pricing/gates')>()
  return {
    ...real,
    loadFeatureGateOverrides: vi.fn(async () => ({})),
    featureAllowed: vi.fn(async () => true),
  }
})

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => {
    throw new Error('ticket-space-access tests must not open supabase')
  },
}))

vi.mock('@/lib/spaces/memberships', () => ({
  listMembershipTiers: async () => {
    throw new Error('ticket-space-access tests must not list tiers')
  },
}))

import { featureAllowed, loadFeatureGateOverrides } from '@/lib/pricing/gates'
import {
  membershipTicketWallSentence,
  resolveMembershipTicketGate,
} from './ticket-space-access'

describe('membershipTicketWallSentence (LIVE-428)', () => {
  it('names the wall, never a retired plan', () => {
    expect(membershipTicketWallSentence(SPACE_PLAN_LABEL.business)).toBe(
      'Membership-only tickets come with Business.',
    )
    expect(membershipTicketWallSentence(SPACE_PLAN_LABEL.free)).toBe(
      'Membership-only tickets come with Free.',
    )
    expect(membershipTicketWallSentence(SPACE_PLAN_LABEL.business)).not.toMatch(/Collective/)
  })
})

describe('resolveMembershipTicketGate (LIVE-428)', () => {
  beforeEach(() => {
    vi.mocked(featureAllowed).mockReset()
    vi.mocked(loadFeatureGateOverrides).mockReset()
  })

  it('on the code default a free Space is allowed and the wall word is Free', async () => {
    vi.mocked(featureAllowed).mockResolvedValue(true)
    vi.mocked(loadFeatureGateOverrides).mockResolvedValue({})
    const gate = await resolveMembershipTicketGate('free')
    expect(gate.allowed).toBe(true)
    expect(gate.wall).toBe(SPACE_PLAN_LABEL.free)
  })

  it('an override that raises the wall names that plan', async () => {
    vi.mocked(featureAllowed).mockResolvedValue(false)
    vi.mocked(loadFeatureGateOverrides).mockResolvedValue({
      space_membership_tickets: { minEntitlement: 'business' },
    })
    const gate = await resolveMembershipTicketGate('free')
    expect(gate.allowed).toBe(false)
    expect(gate.wall).toBe(SPACE_PLAN_LABEL.business)
  })
})

const MEMBER_TICKET_FILES = [
  'lib/events/ticket-tiers.ts',
  'lib/events/space-event-access.ts',
  'lib/events/ticket-space-access.ts',
  'components/spaces/membership-event-access.tsx',
  'app/(main)/events/[slug]/manage/ticket-tiers-panel.tsx',
  'app/(main)/admin/events/[id]/event-edit-client.tsx',
]

describe('member-ticket writers never type Collective (LIVE-428)', () => {
  it.each(MEMBER_TICKET_FILES)('%s has no Collective plan leftover', (file) => {
    const src = readFileSync(file, 'utf8')
    expect(src).not.toMatch(/Collective plan/)
  })

  it('the loader names the wall through featureWallLabel', () => {
    const src = readFileSync('lib/events/ticket-space-access.ts', 'utf8')
    expect(src).toContain('featureWallLabel')
    expect(src).toContain("featureWallLabel(MEMBERSHIP_TICKET_FEATURE")
  })
})
