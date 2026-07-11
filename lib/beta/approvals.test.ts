import { describe, it, expect } from 'vitest'
import {
  APPROVAL_STATUSES,
  SENDABLE_STATUSES,
  isSendable,
  groupReadyByPhase,
  type ApprovalStatus,
  type OutboundItem,
} from './approvals'

// The approval spine's PURE core: the send-gate rule + the phase grouping. The
// governing rule ("nothing sends without approval") is a truth table here, so a
// regression that widens what may send fails the build. DB-backed transitions
// (approve/pause/etc.) are gated + audited in approvals.ts; this locks the policy.

describe('isSendable — the send gate', () => {
  it('clears ONLY approved and scheduled', () => {
    const sendable = APPROVAL_STATUSES.filter((s) => isSendable(s))
    expect(sendable.sort()).toEqual(['approved', 'scheduled'])
  })

  it('refuses every pre-approval and terminal/brake state', () => {
    for (const s of ['draft', 'ready', 'sending', 'sent', 'paused', 'cancelled'] as ApprovalStatus[]) {
      expect(isSendable(s)).toBe(false)
    }
  })

  it('fail-closed on unknown / null / undefined', () => {
    expect(isSendable(null)).toBe(false)
    expect(isSendable(undefined)).toBe(false)
    expect(isSendable('bogus')).toBe(false)
  })

  it('SENDABLE_STATUSES matches the predicate', () => {
    expect([...SENDABLE_STATUSES].sort()).toEqual(['approved', 'scheduled'])
  })
})

describe('groupReadyByPhase', () => {
  const item = (id: string, phaseId: string | null): OutboundItem => ({
    type: 'campaign',
    id,
    label: id,
    approvalStatus: 'ready',
    phaseId,
    segment: null,
    count: null,
    scheduledFor: null,
    createdAt: null,
  })

  it('buckets items by phase id, with null for the unfiled bucket', () => {
    const groups = groupReadyByPhase([item('a', 'p1'), item('b', 'p1'), item('c', 'p2'), item('d', null)])
    expect(groups.get('p1')?.map((i) => i.id)).toEqual(['a', 'b'])
    expect(groups.get('p2')?.map((i) => i.id)).toEqual(['c'])
    expect(groups.get(null)?.map((i) => i.id)).toEqual(['d'])
  })

  it('returns an empty map for no items', () => {
    expect(groupReadyByPhase([]).size).toBe(0)
  })
})
