// ── Who can read a room, and who can post into it: ONE rule, three renderers ────────────────
//
// The room thread has two renderers today — the full page (app/(main)/messages/r/[roomId]/
// page.tsx) and the chat dock's inline thread (loaded by app/(main)/messages/popover-actions.ts,
// rendered by components/rooms/room-thread.tsx) — and a third gate that actually decides:
// `sendRoomMessage` in app/(main)/messages/rooms/actions.ts. All three stated the rule
// separately and TWO of them were wrong, in opposite directions:
//
//   • the PAGE passed `canPost={canRead}`, and `canRead` is `isMember || isChannel`. So any
//     signed-in member looking at a Channel room got a composer, tuned in or not. Typing into
//     it reached `sendRoomMessage`, which threw "Tune into this channel to post." — and
//     RoomThread's submit() swallows a throw into console.error, so the message simply
//     vanished with no explanation.
//   • the DOCK computed `canPost: !!memberRes.data`, i.e. a `room_members` row. A Channel room
//     has NO room_members rows at all (they are joined by tuning into the Channel), so a member
//     who was properly tuned in could never post from the dock. The dock is the surface the
//     owner wants chat to live in, and on it the one kind of room in production today was
//     read-only for everybody.
//
// So the rule lives here once, mirrors `sendRoomMessage` exactly, and is pure so it can be
// tested without a database. Nothing here is an authorization boundary: the server action and
// RLS are. What this fixes is the affordance LYING about what the server will accept, in both
// directions.

/** `rooms.visibility`, as stored. `channel` is the open room behind a Channel (ADR-864). */
export type RoomVisibility =
  | 'public'
  | 'private'
  | 'circle'
  | 'hub'
  | 'nexus'
  | 'outpost'
  | 'channel'

export type RoomViewer = {
  visibility: RoomVisibility
  /** Does the caller hold a `room_members` row for this room? */
  isMember: boolean
  /**
   * Is the caller tuned into the Channel this room belongs to (`topical_channel_memberships`
   * on `rooms.scope_id`)? Only consulted for a `channel` room; pass `false` for every other
   * kind, where it is meaningless.
   */
  isTunedIn: boolean
}

/**
 * Can this viewer READ the thread?
 *
 * A Channel room is read-open to anyone who can reach it — that is what makes a Channel a
 * public square rather than a private group. Every other room is members-only, which RLS
 * (`room_messages_read` = `am_room_member`) enforces independently: a non-member's message
 * read comes back empty whatever this returns.
 */
export function canReadRoom({ visibility, isMember }: Pick<RoomViewer, 'visibility' | 'isMember'>): boolean {
  return isMember || visibility === 'channel'
}

/**
 * Can this viewer POST?
 *
 * Byte for byte the gate `sendRoomMessage` applies: a Channel room asks for tune-in, every
 * other room asks for membership. Reading a Channel and posting to one are deliberately
 * different questions, which is the distinction both renderers had collapsed.
 */
export function canPostToRoom({ visibility, isMember, isTunedIn }: RoomViewer): boolean {
  return visibility === 'channel' ? isTunedIn : isMember
}

/**
 * What to tell someone who cannot post, in the words the naming canon uses for that surface:
 * you TUNE INTO a Channel (docs/NAMING.md), you JOIN a room. The old copy said "join" for
 * both, which pointed a Channel visitor at a door that does not exist.
 */
export function roomPostGateReason(visibility: RoomVisibility): string {
  return visibility === 'channel'
    ? 'Tune into this Channel to post.'
    : 'Join this room to send messages.'
}
