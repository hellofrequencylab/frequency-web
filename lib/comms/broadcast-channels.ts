// SHARED BROADCAST CHANNEL CHIPS — the channel options that are the SAME wherever the composer
// stands (components/comms/broadcast-composer.tsx, contract in components/comms/broadcast-types.ts).
//
// Every surface that mounts the composer decides its own channel list, because "can this scope send
// email" and "what does Dispatch reach here" are genuinely different answers per surface. SMS is not:
// it is refused platform-wide for a legal reason, so it was hand-typed identically on three surfaces
// (the Journey launch page, the event Manage hub, and the Space message center) and had three places
// to forget when the answer changes. It lives here now, once.
//
// PURE DATA: no React, no env read, no server-only import, so a client component may import it too.
//
// Copy follows docs/CONTENT-VOICE.md: plain, honest about what does not work, no em or en dashes.

import type { BroadcastChannelOption } from '@/components/comms/broadcast-types'

/**
 * TEXT (SMS), refuse-first (ADR-256): an inert chip with an honest note, never a toggle that silently
 * does nothing. The send path exists, but it is gated on an A2P 10DLC filing, not on a feature flag we
 * can flip: `isSmsProvisioned()` (lib/comms/sms.ts) needs SMS_PROVISIONING_ENABLED plus a brand id, a
 * campaign id, and a Twilio messaging service sid, and until the EIN -> A2P 10DLC -> Twilio track is
 * finished every send is refused at the gate anyway. Enabling this chip before then would only move the
 * refusal from a chip a person can read to a send they cannot explain.
 *
 * Frozen so a surface cannot mutate the shared object; a surface that ever needs its own wording should
 * spread it (`{ ...SMS_CHANNEL, note: '...' }`) rather than edit it in place.
 */
export const SMS_CHANNEL: BroadcastChannelOption = Object.freeze({
  key: 'sms',
  enabled: false,
  note: 'Coming soon',
})
