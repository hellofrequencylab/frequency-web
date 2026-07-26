// THE BROADCAST COMPOSER CONTRACT (ADR-827 second addendum ruling 3: the multi-channel
// composer ships on every admin surface). Pure types shared by the client composer
// (components/comms/broadcast-composer.tsx) and each scope's server action, so a surface
// wires the composer by BINDING data, never by forking the UI:
//
//   - the page's RSC loads the scope's audience segments (who can be reached),
//   - decides which channels are live for that scope (and why one is not),
//   - and binds ONE scope-gated server action that does the per-channel fan-out.
//
// The event Manage hub is the first wiring (app/(main)/events/[slug]/manage). A Space /
// Circle / hub / nexus surface adopts it by supplying its own segments + action; nothing
// in the composer knows what scope it is standing on. No 'use client' here: types only,
// importable from server actions and client components alike.

/** The four channels the composer offers. `sms` renders but stays a disabled
 *  "Coming soon" chip until the A2P track is live (ADR-256: refuse-first SMS). */
export type BroadcastChannelKey = 'email' | 'dm' | 'dispatch' | 'sms'

/** One selectable slice of the scope's audience. `profileIds` is the deduped member set,
 *  used ONLY for the live recipient count in the summary line; the server action always
 *  re-resolves the audience from the segment keys and never trusts client ids. */
export interface BroadcastSegment {
  key: string
  label: string
  profileIds: string[]
}

/** How one channel is offered on this surface. A disabled channel renders as an inert
 *  chip with its `note` shown as the reason (never a silent no-op). */
export interface BroadcastChannelOption {
  key: BroadcastChannelKey
  enabled: boolean
  /** Short plain-voice line: what this channel does here, or why it is unavailable. */
  note?: string
}

/** What the scope's action reports back for one attempted channel. */
export interface BroadcastChannelResult {
  channel: BroadcastChannelKey
  ok: boolean
  /** Plain-voice outcome line, e.g. "Sent to 41 people. 3 skipped (not subscribed)." */
  detail: string
}

/** What the composer hands the scope's send action. */
export interface BroadcastSendInput {
  channels: BroadcastChannelKey[]
  /** The selected segment keys; the action re-resolves and unions them server-side. */
  segments: string[]
  /** Email subject (required when the email channel is selected; also used as the
   *  Dispatch title when present). */
  subject: string
  body: string
}
