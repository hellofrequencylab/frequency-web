import { describe, expect, it } from 'vitest'
import { NETWORK_PLAN } from '@/lib/pricing/plans'
import {
  canRunNetworkTools, centralAdminReachesChapter, centralAdminSeatOpen, isNetworkChapter, networkEventShown,
  networkToolsOpen, pendingNetworkEvents, type NetworkToolsSpace, type QueueCandidate,
} from './network-tools'

const parent: NetworkToolsSpace = { id: 'p', plan: 'network', status: 'active', type: 'business', parent_id: null, owner_profile_id: 'owner' }
const chapterA: NetworkToolsSpace = { id: 'a', plan: 'free', status: 'active', type: 'business', parent_id: 'p', owner_profile_id: 'owner' }
const chapterB: NetworkToolsSpace = { ...chapterA, id: 'b' }
const admin = { role: 'admin', status: 'active' }

describe('networkToolsOpen gates every tool on the Network plan', () => {
  it('opens for an active top-level Network only', () => {
    expect(networkToolsOpen(parent)).toBe(true)
    for (const plan of ['collective', 'nonprofit_collective', 'business', 'free', null]) expect(networkToolsOpen({ ...parent, plan })).toBe(false)
    expect(networkToolsOpen({ ...parent, status: 'suspended' })).toBe(false)
    expect(networkToolsOpen({ ...parent, parent_id: 'x' })).toBe(false)
    expect(networkToolsOpen({ ...parent, type: 'root' })).toBe(false)
    expect(networkToolsOpen({ ...parent, owner_profile_id: null })).toBe(false)
  })
})

describe('chapters', () => {
  it('is a same-owner, active, attached child of a live Network', () => {
    expect(isNetworkChapter(chapterA, parent)).toBe(true)
    expect(isNetworkChapter({ ...chapterA, owner_profile_id: 'other' }, parent)).toBe(false)
    expect(isNetworkChapter({ ...chapterA, parent_id: null }, parent)).toBe(false)
    expect(isNetworkChapter({ ...chapterA, status: 'suspended' }, parent)).toBe(false)
    expect(isNetworkChapter(chapterA, { ...parent, plan: 'collective' })).toBe(false)
  })
})

describe('central admins', () => {
  it('reach every chapter while named and an active admin of the parent', () => {
    expect(centralAdminReachesChapter({ chapter: chapterA, parent, named: true, parentMembership: admin })).toBe(true)
    expect(centralAdminReachesChapter({ chapter: chapterB, parent, named: true, parentMembership: admin })).toBe(true)
  })
  it('lose the reach when unnamed, demoted, suspended, or the parent is a Collective', () => {
    expect(centralAdminReachesChapter({ chapter: chapterA, parent, named: false, parentMembership: admin })).toBe(false)
    expect(centralAdminReachesChapter({ chapter: chapterA, parent, named: true, parentMembership: { role: 'editor', status: 'active' } })).toBe(false)
    expect(centralAdminReachesChapter({ chapter: chapterA, parent, named: true, parentMembership: { role: 'admin', status: 'suspended' } })).toBe(false)
    expect(centralAdminReachesChapter({ chapter: chapterA, parent, named: true, parentMembership: null })).toBe(false)
    expect(centralAdminReachesChapter({ chapter: chapterA, parent: { ...parent, plan: 'collective' }, named: true, parentMembership: admin })).toBe(false)
  })
  it('never reach a Space outside the Network', () => {
    expect(centralAdminReachesChapter({ chapter: { ...chapterA, parent_id: 'elsewhere' }, parent, named: true, parentMembership: admin })).toBe(false)
    expect(centralAdminReachesChapter({ chapter: parent, parent, named: true, parentMembership: admin })).toBe(false)
  })
  it(`cap at NETWORK_PLAN.centralAdmins (${NETWORK_PLAN.centralAdmins})`, () => {
    expect(centralAdminSeatOpen(0)).toBe(true)
    expect(centralAdminSeatOpen(NETWORK_PLAN.centralAdmins - 1)).toBe(true)
    expect(centralAdminSeatOpen(NETWORK_PLAN.centralAdmins)).toBe(false)
    expect(centralAdminSeatOpen(-1)).toBe(false)
  })
})

describe('who runs the Chapters area', () => {
  it('is the owner or a named central admin, never a chapter leader', () => {
    expect(canRunNetworkTools({ parent, callerId: 'owner', named: false, parentMembership: null })).toBe(true)
    expect(canRunNetworkTools({ parent, callerId: 'central', named: true, parentMembership: admin })).toBe(true)
    // A chapter leader holds an admin row on their chapter only, so on the parent they are unnamed with no admin row.
    expect(canRunNetworkTools({ parent, callerId: 'leader', named: false, parentMembership: null })).toBe(false)
    expect(canRunNetworkTools({ parent, callerId: 'parent-admin', named: false, parentMembership: admin })).toBe(false)
    expect(canRunNetworkTools({ parent: { ...parent, plan: 'collective' }, callerId: 'owner', named: false, parentMembership: null })).toBe(false)
    expect(canRunNetworkTools({ parent, callerId: null, named: true, parentMembership: admin })).toBe(false)
  })
})

describe('the approval queue', () => {
  it('shows a Network chapter event only once approved, and keeps a Collective unchanged', () => {
    expect(networkEventShown({ network: true, fromParent: false, decision: null })).toBe(false)
    expect(networkEventShown({ network: true, fromParent: false, decision: 'declined' })).toBe(false)
    expect(networkEventShown({ network: true, fromParent: false, decision: 'approved' })).toBe(true)
    expect(networkEventShown({ network: true, fromParent: true, decision: null })).toBe(true)
    expect(networkEventShown({ network: false, fromParent: false, decision: null })).toBe(true)
  })
  it('lists undecided upcoming chapter events, soonest first, once each', () => {
    const row = (id: string, starts_at: string, extra: Partial<QueueCandidate> = {}): QueueCandidate => ({ id, slug: id, title: id, starts_at, chapterId: 'a', chapterName: 'A', ...extra })
    const out = pendingNetworkEvents([
      row('later', '2026-11-02T10:00:00Z'), row('soon', '2026-11-01T10:00:00Z'), row('soon', '2026-11-01T10:00:00Z', { chapterId: 'b' }),
      row('decided', '2026-11-01T09:00:00Z'), row('parent', '2026-11-01T09:00:00Z'), row('past', '2026-10-01T09:00:00Z'),
      row('cancelled', '2026-11-03T09:00:00Z', { is_cancelled: true }),
    ], new Set(['decided']), new Set(['parent']), '2026-10-16T00:00:00Z')
    expect(out.map(r => r.id)).toEqual(['soon', 'later'])
  })
})
