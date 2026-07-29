import { isConsoleSpaceType, normalizeSpaceType } from '@/lib/spaces/types'

// ── Handing hosting to another Space: the pure rules (ADR-911) ─────────────────────────────
//
// The HOST of an event (`events.host_space_id`) is the billed, displayed, accountable party:
// registrations run through it and ticket money pays into its owner's Connect account (ADR-819).
// `setEventHostEntity` already sets it, but only for an actor who ALREADY runs the target Space —
// which is the right guard and also a dead end. A venue's manager cannot hand hosting to the
// practitioner actually running the event, so an operator had to do it by hand every time.
//
// It cannot simply be opened up. Accepting host means accepting the PAYOUT LIABILITY and the refund
// obligation for other people's ticket sales, so it has to be a two-sided handshake. These are the
// decisions that handshake needs, kept pure and away from the action layer so they can be tested
// without a database.

/** Which side raised the transfer. 'host' = the event side offered; 'space' = the target asked. */
export type HostTransferSide = 'host' | 'space'

/**
 * The member-facing refusal when a Space cannot be an event's host, or null when it can.
 *
 * The rule is the same STRUCTURAL one Collaborators use (ADR-835): only a real Business / Non Profit
 * Space, and the person/Space line is structural rather than name-based, so an owner-named Space
 * ("Audrey DeWitt", owned by Audrey DeWitt) is a valid host. That case is the whole reason this
 * exists, so it must not be gated out by a name heuristic.
 *
 * ⚠️ Separate from `collaboratorSpaceGateError` despite the identical predicate. The two say
 * different things to a member and will diverge: a host must eventually clear payout readiness,
 * which a Collaborator never does. Sharing the copy would make the first divergence a silent
 * mis-message on whichever surface was not updated.
 */
export function hostSpaceGateError(target: { type: string | null }): string | null {
  if (!isConsoleSpaceType(normalizeSpaceType(target.type))) {
    return 'Only a Business or Non Profit Space can host an event.'
  }
  return null
}

/**
 * Why hosting cannot move right now, or null when it may.
 *
 * ⚠️ MONEY IN FLIGHT is the real constraint. Ticket money already taken settled against the PREVIOUS
 * host's Connect account, and accepting a transfer only re-points FUTURE checkouts — the paid orders
 * are not rewritten, so a refund on one of them stays the previous host's to issue. Splitting a
 * single event's takings across two payees mid-sale is worse than refusing the handoff, so a
 * transfer is refused while an upcoming event has settled tickets.
 *
 * Once the event is OVER the refusal lifts: there are no future checkouts left to re-point, so
 * moving the host is a bookkeeping/credit change with no split to create. That is deliberate — it
 * lets a venue hand a finished event's record to the business that actually ran it.
 */
export function hostTransferBlockReason(input: {
  /** Any ticket for this event where money settled and was not refunded. */
  hasSettledTickets: boolean
  /** The event's end (or start, when it has no end) is in the past. */
  eventIsOver: boolean
}): string | null {
  if (input.hasSettledTickets && !input.eventIsOver) {
    return 'This event has already sold tickets, so hosting cannot move until it is over. Money already taken pays out to the current host.'
  }
  return null
}

/**
 * Does this transfer skip the pending state?
 *
 * Only when ONE person controls both sides — they host the event AND they run the target Space. That
 * is exactly the case `setEventHostEntity` already permits today, so auto-accept grants no new
 * authority; it just means someone who could already do it in one step still can.
 *
 * ⚠️ Never auto-accepts on the strength of one side alone. A host offering to a Space they do not
 * run must wait for that Space, because the Space is taking on the liability; and a Space asking for
 * an event it does not host must wait for the host, because the host is giving up the money. There
 * is no collaboration shortcut here, unlike shares (`shouldAutoAcceptShare`): a standing
 * space↔space collaboration means "we work together", never "you may become my payee".
 */
export function shouldAutoAcceptHostTransfer(input: {
  callerHostsEvent: boolean
  callerRunsTargetSpace: boolean
}): boolean {
  return input.callerHostsEvent && input.callerRunsTargetSpace
}

/**
 * Which side must respond to a pending transfer: the opposite side from the one that raised it, or
 * null when `initiatedBy` is not a value this module recognises.
 *
 * 🔴 THE NULL BRANCH IS LOAD-BEARING, and the first version of this function did not have it. It was
 * `initiatedBy === 'host' ? 'space' : 'host'`, so ANY unrecognised value fell to `'host'` — and
 * `canRespondToHostTransfer` then answered on `callerHostsEvent`, letting the event's own host accept
 * a transfer they had raised. A ternary on untrusted text fails OPEN by construction: the column is
 * `text` with a check constraint, but this function is also fed values from a jsonb payload and from
 * tests, and "the DB would have rejected it" is not a guarantee this module can rely on.
 */
export function hostTransferApproverSide(initiatedBy: HostTransferSide): HostTransferSide | null {
  if (initiatedBy === 'host') return 'space'
  if (initiatedBy === 'space') return 'host'
  return null
}

/**
 * Can this caller respond to a pending transfer? The approver is whichever side did NOT raise it, so
 * an offer from the host is accepted by the target Space and a request from a Space is accepted by
 * the event's host. Fail-closed: an unknown side answers no.
 *
 * 🔴 The guard that makes consent mean something. Without the side check, the party who RAISED a
 * transfer could also accept it, which turns a two-sided handshake back into the unilateral write
 * this replaced — and the thing being written is who receives other people's money.
 */
export function canRespondToHostTransfer(input: {
  initiatedBy: HostTransferSide
  callerHostsEvent: boolean
  callerRunsTargetSpace: boolean
}): boolean {
  const side = hostTransferApproverSide(input.initiatedBy)
  if (side === 'space') return input.callerRunsTargetSpace
  if (side === 'host') return input.callerHostsEvent
  return false
}
