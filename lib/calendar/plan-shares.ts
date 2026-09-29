// A PLAN SHARE IS A HANDSHAKE (PROG-CAL7 Together, LIVE-541). The host offers a Plan to a Space it
// already collaborates with; the guest says yes or no; the host can take it back. Nothing here does
// IO: this is the vocabulary, the words a person reads, and the two folds the drawer and the guest
// panel need. The session reads and writes live in lib/calendar/plans-store.ts, the actions in
// app/(main)/spaces/[slug]/settings/calendar/plan-actions.ts.
//
// WHY A HANDSHAKE AND NOT A GRANT. `space_plan_shares` (20270345006700) modelled four states from the
// day it shipped and the action wrote `accepted` straight in, responder set to the host, so the guest
// was never asked and three of the four states were unreachable. A Plan landing on a team's calendar
// because another team decided so is the failure ADR-1386 P6 names for Vera (nothing lands without
// the team's own press), applied to people. The table's partial unique index (one pending-or-accepted
// share per Plan and guest) already assumed the handshake; this module and its callers finish it.
//
// WHO MAY BE OFFERED A PLAN: an ACCEPTED collaborator of the host (space_collaborations, ADR-799).
// The picker lists those and nothing else, and the action refuses any other id, so a share can never
// name a Space the host has no relationship with.

import type { SpacePlan } from './plans'

const PLAN_SHARE_STATUSES = ['pending', 'accepted', 'declined', 'revoked'] as const
export type PlanShareStatus = (typeof PLAN_SHARE_STATUSES)[number]

/** What a guest may answer. Revoke is the host's verb and never an answer. */
type PlanShareAnswer = 'accepted' | 'declined'

/** A `space_plan_shares` row as the session client returns it. */
export interface PlanShareRow {
  id: string
  plan_id: string
  guest_space_id: string
  status: string
  requested_by: string | null
  created_at: string
  responded_at: string | null
  responded_by: string | null
}

/** One share as the HOST drawer lists it: which Space, in what state. */
export interface PlanShareView {
  id: string
  planId: string
  guestSpaceId: string
  status: PlanShareStatus
  /** The guest Space's name, from the host's accepted collaborations; null when it no longer is one. */
  guestName: string | null
  createdAt: string
  respondedAt: string | null
}

/** One share as the GUEST calendar lists it. The title and the host are resolved on the server
 *  for the share rows the guest may read (lib/calendar/plan-share-subjects.ts), because RLS opens
 *  the Plan itself only once the share is accepted; before that the guest sees only the offer. */
export interface IncomingPlanShare {
  id: string
  planId: string
  status: PlanShareStatus
  planTitle: string | null
  hostSpaceId: string | null
  hostName: string | null
  createdAt: string
}

/** An accepted share's Plan beside the Space that offered it, for the guest board. */
export interface SharedPlanView {
  plan: SpacePlan
  hostName: string | null
}

/** The subject of a share, resolved server-side: the Plan's title and its host Space. */
export interface ShareSubject {
  title: string
  hostSpaceId: string
  hostName: string | null
}

export function planShareStatus(value: unknown): PlanShareStatus | null {
  return typeof value === 'string' && (PLAN_SHARE_STATUSES as readonly string[]).includes(value) ? (value as PlanShareStatus) : null
}

/** A guest's answer, or null for anything else. Never widened: "revoked" from a guest is refused. */
export function parseShareAnswer(value: unknown): PlanShareAnswer | null {
  return value === 'accepted' || value === 'declined' ? value : null
}

/** A share that still binds the two Spaces: offered and not yet answered, or accepted. */
export function isActiveShare(status: PlanShareStatus): boolean {
  return status === 'pending' || status === 'accepted'
}

/** The state as a person reads it on the host's list. Camp counselor: plain, no long dash. */
export function shareStateWords(status: PlanShareStatus): string {
  switch (status) {
    case 'pending':
      return 'Waiting for their answer'
    case 'accepted':
      return 'Working it together'
    case 'declined':
      return 'They passed'
    case 'revoked':
      return 'Taken back'
  }
}

export function mapPlanShareRow(row: PlanShareRow, guestName: string | null): PlanShareView {
  return {
    id: row.id,
    planId: row.plan_id,
    guestSpaceId: row.guest_space_id,
    status: planShareStatus(row.status) ?? 'pending',
    guestName,
    createdAt: row.created_at,
    respondedAt: row.responded_at,
  }
}

/**
 * The picker's options: every accepted collaborator BY NAME, minus any Space that already holds an
 * active share of this Plan (the table's partial unique index would refuse it, and a picker that
 * offers a refusal is a worse picker). Sorted by name so the list reads the same on every open.
 */
export function shareOptions(
  collaborators: readonly { id: string; name: string }[],
  shares: readonly PlanShareView[],
): { value: string; label: string }[] {
  const taken = new Set(shares.filter((s) => isActiveShare(s.status)).map((s) => s.guestSpaceId))
  return collaborators
    .filter((c) => !taken.has(c.id))
    .map((c) => ({ value: c.id, label: c.name }))
    .sort((a, b) => a.label.localeCompare(b.label))
}

/** The row the guest reads, from the share and whatever the server could resolve about it. */
export function incomingFromRow(row: PlanShareRow, subject: ShareSubject | undefined): IncomingPlanShare {
  return {
    id: row.id,
    planId: row.plan_id,
    status: planShareStatus(row.status) ?? 'pending',
    planTitle: subject?.title ?? null,
    hostSpaceId: subject?.hostSpaceId ?? null,
    hostName: subject?.hostName ?? null,
    createdAt: row.created_at,
  }
}

/** The sentence a pending offer reads as. Honest when the subject could not be resolved. */
export function incomingWords(share: IncomingPlanShare): string {
  const who = share.hostName ?? 'A Space you collaborate with'
  return share.planTitle ? `${who} wants to work "${share.planTitle}" with you.` : `${who} wants to work a Plan with you.`
}
