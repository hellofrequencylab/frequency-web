import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import {
  hostSpaceGateError,
  hostTransferBlockReason,
  shouldAutoAcceptHostTransfer,
  canRespondToHostTransfer,
  hostTransferApproverSide,
} from './host-transfer'

// ── Handing hosting to another Space (ADR-911) ─────────────────────────────────────────────
//
// The host of an event is the PAYEE: ticket money pays into its owner's Connect account. So every
// rule here is about money and consent, and the failure modes are all silent — a wrong answer does
// not throw, it re-points someone else's income or records a consent that never happened.

describe('who may host', () => {
  it('admits a Business and a Non Profit Space', () => {
    expect(hostSpaceGateError({ type: 'business' })).toBeNull()
    expect(hostSpaceGateError({ type: 'nonprofit' })).toBeNull()
  })

  it('refuses the root platform Space', () => {
    expect(hostSpaceGateError({ type: 'root' })).toContain('Business or Non Profit')
  })

  it('treats an unknown or null type as a Business, deliberately', () => {
    // ⚠️ NOT a hole. `normalizeSpaceType` (ADR-552) folds every retired and unrecognised value into
    // `business` on purpose, because the type-collapse backfill shipped FILE-ONLY and live rows can
    // still hold `practitioner` / `coaching` / `event_space` / `lab` / `partner`. A legacy Business
    // Space whose column was never migrated must still be able to host its own events. Only `root`
    // is a real refusal, and `spaces.type` is not nullable in the schema.
    expect(hostSpaceGateError({ type: null })).toBeNull()
    expect(hostSpaceGateError({ type: 'practitioner' })).toBeNull()
  })

  it('says nothing about the Space being named after its owner', () => {
    // 🔴 ADR-835: the person/Space line is STRUCTURAL, never name-based. An owner-named Space
    // ("Audrey DeWitt", owned by Audrey DeWitt) is the exact case this whole feature exists for, so a
    // name heuristic here would gate out the only reported use.
    expect(hostSpaceGateError({ type: 'business' })).toBeNull()
  })
})

describe('money in flight blocks the handoff', () => {
  it('refuses while an upcoming event has settled tickets', () => {
    // Accepting re-points FUTURE checkouts only; money already taken settled against the previous
    // host's Connect account and is not rewritten. Splitting one event's takings across two payees
    // mid-sale is worse than refusing.
    expect(hostTransferBlockReason({ hasSettledTickets: true, eventIsOver: false })).toContain('already sold tickets')
  })

  it('allows it once the event is over, even with settled tickets', () => {
    // No future checkouts left to re-point, so there is no split to create — this is the path that
    // lets a venue hand a finished event's record to the business that actually ran it.
    expect(hostTransferBlockReason({ hasSettledTickets: true, eventIsOver: true })).toBeNull()
  })

  it('allows a free or unsold event at any time', () => {
    expect(hostTransferBlockReason({ hasSettledTickets: false, eventIsOver: false })).toBeNull()
    expect(hostTransferBlockReason({ hasSettledTickets: false, eventIsOver: true })).toBeNull()
  })
})

describe('auto-accept needs BOTH sides in one pair of hands', () => {
  it('skips the handshake only when the caller hosts the event AND runs the target', () => {
    // Exactly what setEventHostEntity already permits, so this grants no new authority.
    expect(shouldAutoAcceptHostTransfer({ callerHostsEvent: true, callerRunsTargetSpace: true })).toBe(true)
  })

  it('never auto-accepts on one side alone', () => {
    // 🔴 A host offering to a Space they do not run must wait: that Space is taking the liability.
    expect(shouldAutoAcceptHostTransfer({ callerHostsEvent: true, callerRunsTargetSpace: false })).toBe(false)
    // And a Space asking for an event it does not host must wait: the host is giving up the money.
    expect(shouldAutoAcceptHostTransfer({ callerHostsEvent: false, callerRunsTargetSpace: true })).toBe(false)
    expect(shouldAutoAcceptHostTransfer({ callerHostsEvent: false, callerRunsTargetSpace: false })).toBe(false)
  })
})

describe('only the OTHER side can answer', () => {
  it('routes an offer from the host to the target Space', () => {
    expect(hostTransferApproverSide('host')).toBe('space')
    expect(
      canRespondToHostTransfer({ initiatedBy: 'host', callerHostsEvent: false, callerRunsTargetSpace: true }),
    ).toBe(true)
  })

  it('routes a request from a Space to the event host', () => {
    expect(hostTransferApproverSide('space')).toBe('host')
    expect(
      canRespondToHostTransfer({ initiatedBy: 'space', callerHostsEvent: true, callerRunsTargetSpace: false }),
    ).toBe(true)
  })

  it('🔴 the raiser can never answer their own offer', () => {
    // Without the side check, whoever raised a transfer could also accept it — which turns the
    // two-sided handshake back into the unilateral write it replaced. What is being written is who
    // receives other people's money, so this is the guard that makes consent mean anything.
    expect(
      canRespondToHostTransfer({ initiatedBy: 'host', callerHostsEvent: true, callerRunsTargetSpace: false }),
    ).toBe(false)
    expect(
      canRespondToHostTransfer({ initiatedBy: 'space', callerHostsEvent: false, callerRunsTargetSpace: true }),
    ).toBe(false)
  })

  it('🔴 fails CLOSED for an unrecognised side', () => {
    // The first version was `initiatedBy === 'host' ? 'space' : 'host'`, so any unrecognised value
    // fell through to 'host' and the event's own host could accept a transfer they had raised. A
    // ternary on untrusted text fails open by construction.
    expect(hostTransferApproverSide('nonsense' as never)).toBeNull()
    expect(
      canRespondToHostTransfer({
        initiatedBy: 'nonsense' as never,
        callerHostsEvent: true,
        callerRunsTargetSpace: true,
      }),
    ).toBe(false)
  })
})

describe('the action layer honours the rules it imports', () => {
  const actions = readFileSync('app/(main)/events/host-transfer-actions.ts', 'utf8')

  it('accepting writes host_space_id and NEVER space_id', () => {
    // 🔴 The whole point of the split. setEventHostEntity used to write both, which is what made
    // "at Royal Temple, hosted by Audrey DeWitt" impossible: naming the host re-homed the event.
    expect(actions).toContain("update({ host_space_id: toSpaceId })")
    expect(actions).not.toMatch(/update\(\{[^}]*space_id: [^}]*host_space_id/)
    expect(actions).not.toMatch(/host_space_id: toSpaceId, space_id/)
  })

  it('re-checks the money guard at ACCEPT time, not only at offer time', () => {
    // Tickets can settle between the offer and the reply, and the offer-time check says nothing
    // about now.
    const respond = actions.slice(actions.indexOf('async function respond('))
    expect(respond).toContain('hostTransferBlockReason(state)')
  })

  it('guards the pending update against a concurrent reply', () => {
    // Two stewards clicking at once must not both "win" — the second is told it is resolved.
    expect(actions).toContain(".eq('status', 'pending')")
  })

  it('does not let platform staff accept on a Space behalf', () => {
    // Staff keep their audited direct path (setEventHostEntity). If they could ACCEPT here, the
    // consent record would claim a Space agreed to take payout liability when an operator did.
    const runs = actions.slice(actions.indexOf('async function callerRunsSpace'))
    expect(runs.slice(0, runs.indexOf('\n}\n'))).not.toContain('isPlatformStaff')
  })

  it('only counts money that actually settled', () => {
    // A pending or failed checkout has moved nothing; letting it block would freeze hosting on an
    // abandoned cart.
    expect(actions).toContain(".not('succeeded_at', 'is', null)")
    expect(actions).toContain(".is('refunded_at', null)")
  })
})

describe('the table is service-role only', () => {
  it('is registered in the deny-all list', () => {
    // RLS on with no policies is fail-closed, but the guard list is what proves it stays that way.
    expect(readFileSync('scripts/rls-deny-all.txt', 'utf8')).toContain('event_host_transfers')
  })

  it('the migration enables RLS and adds no policy', () => {
    const sql = readFileSync('supabase/migrations/20270131000000_event_host_transfers.sql', 'utf8')
    expect(sql).toContain('enable row level security')
    expect(sql).not.toMatch(/create policy/i)
    // One live offer per event, or whichever Space accepts second silently takes over a payee role.
    expect(sql).toContain('uniq_event_host_transfer_pending')
  })
})
