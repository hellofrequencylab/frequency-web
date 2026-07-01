// The pure TYPE for a featured Top Friend, split out of lib/spotlight/top-friends.ts
// (which is `server-only`) so client-safe modules — the Puck blocks + their render
// metadata — can import the shape without pulling the admin-client IO into the
// browser bundle. top-friends.ts re-exports this so existing importers are unchanged.

/** One featured friend, with the already-public identity fields the grid renders.
 *  Mirrors the SpotlightRow privacy boundary: handle/name/avatar only, never contact. */
export interface TopFriend {
  profileId: string
  handle: string
  displayName: string | null
  avatarUrl: string | null
}
