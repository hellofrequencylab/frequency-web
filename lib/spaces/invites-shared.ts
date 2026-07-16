// CLIENT-SAFE shared surface for Space invites (ENTITY-SPACES-SYSTEM §3.2): the lifecycle type, the
// row + result shapes, and the pure accept-link builder. Split out of lib/spaces/invites.ts so a
// CLIENT component (components/spaces/invite-form.tsx) can import the types AND the URL helper WITHOUT
// dragging the server-only IO graph into the client bundle: invites.ts imports @/lib/auth ->
// lib/view-as.ts -> lib/supabase/server.ts (a 'server-only' module), so a value import from it inside
// a client component fails the bundle. Everything here depends only on client-safe modules (lib/site,
// plus a type-only import of SpaceRole). invites.ts re-exports these, so every existing server/test
// import from '@/lib/spaces/invites' keeps working unchanged.

import { SITE_URL } from '@/lib/site'
import { type SpaceRole } from '@/lib/spaces/membership'

/** An invite's lifecycle. pending = outstanding; accepted = the invitee was seated; revoked = the
 *  owner withdrew it before accept. */
export type InviteStatus = 'pending' | 'accepted' | 'revoked'

/** A `space_invites` row as the app consumes it (camelCased; the fields the surfaces need). The
 *  `token` is included so the owner list can render the copyable accept link (a share-by-hand
 *  backup alongside the emailed invite). */
export interface SpaceInvite {
  id: string
  spaceId: string
  email: string
  role: SpaceRole
  token: string
  status: InviteStatus
  invitedBy: string | null
  expiresAt: string
  createdAt: string
}

/** The shape createInvite hands back on success: the invite plus the ready-to-share accept link. */
export interface CreatedInvite {
  invite: SpaceInvite
  /** The absolute accept link. The invite is emailed too; this is the share-by-hand backup. */
  acceptUrl: string
}

/** The absolute accept link for a token. Built off SITE_URL (lib/site.ts) so it is correct in every
 *  environment. Pure. */
export function inviteAcceptUrl(token: string): string {
  return `${SITE_URL}/spaces/invite/${encodeURIComponent(token)}`
}
