import type {
  RealtimeTransport,
  RealtimeChannel,
  ChannelHandlers,
} from "./transport";

/**
 * SKELETON adapter for dedicated realtime infra (PartyKit / Liveblocks /
 * Colyseus). NOT YET WIRED.
 *
 * This file exists to prove the seam: it implements the SAME
 * `RealtimeTransport` interface as the Supabase adapter, so selecting it via
 * `NEXT_PUBLIC_RESONANCE_REALTIME_DRIVER=partykit` swaps the transport without
 * touching game/venue/sync code. Until a real server is wired, every method is
 * a SAFE no-op: it never throws, so it cannot break a build or crash at runtime
 * if accidentally selected without config. Presence and broadcast simply do not
 * propagate, and the UI falls back to its snapshot refetch path.
 *
 * To make this real (deferred infra work, not a feature), replace the no-op
 * bodies below:
 *
 *  1. Read the room host from env, e.g.
 *     `process.env.NEXT_PUBLIC_RESONANCE_PARTYKIT_HOST`.
 *  2. In `join`, open a websocket to `wss://<host>/parties/main/<channel>`
 *     (PartySocket) and await the open event before resolving.
 *  3. Map inbound server messages onto the handlers:
 *       - broadcast frame  -> handlers.onEvent({ type, payload })
 *       - presence sync     -> handlers.onPresenceSync(state)
 *       - presence join/leave -> handlers.onJoin / handlers.onLeave
 *  4. Implement the returned channel:
 *       - send(event)  -> socket.send(JSON of a broadcast frame)
 *       - track(state) -> socket.send(JSON of a presence-update frame)
 *       - leave()      -> socket.close()
 *
 * Keep the wire shapes equivalent to supabase-transport.ts so the contract in
 * transport.ts stays the single source of truth.
 *
 * @see docs/REALTIME.md
 */

/** Warn at most once so a misconfigured selection is visible but not noisy. */
let warned = false;
function warnOnce(): void {
  if (warned) return;
  warned = true;
  if (typeof console !== "undefined") {
    console.warn(
      "[resonance] PartyKit realtime driver selected but not configured; " +
        "realtime is a no-op. Set NEXT_PUBLIC_RESONANCE_REALTIME_DRIVER=supabase " +
        "or wire partykit-transport.ts. See docs/REALTIME.md.",
    );
  }
}

export function createPartyKitTransport(): RealtimeTransport {
  return {
    async join(_channel: string, _handlers: ChannelHandlers): Promise<RealtimeChannel> {
      void _channel;
      void _handlers;
      warnOnce();

      // Real wiring opens a websocket here and registers _handlers. Until then
      // we return a channel whose operations are inert.
      const channel: RealtimeChannel = {
        async send() {
          // No transport yet: drop the broadcast.
        },
        async track() {
          // No transport yet: drop the presence update.
        },
        async leave() {
          // No socket to close.
        },
      };
      return channel;
    },
  };
}
