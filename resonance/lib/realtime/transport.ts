/**
 * The realtime seam (ADR-005).
 *
 * Every room interaction flows through this interface so the underlying
 * transport can change without touching game logic. Supabase Realtime
 * (Broadcast + Presence) implements it today; at high concurrency it can be
 * swapped for PartyKit / Colyseus / Liveblocks by writing one new adapter, with
 * zero changes to venue/DJ/sync code.
 *
 * This file is the CONTRACT only. Adapters land in the Realtime build section.
 */

export type RealtimeEvent = {
  type: string;
  payload: unknown;
};

export type PresenceState = Record<string, unknown>;

export interface ChannelHandlers {
  onEvent?: (event: RealtimeEvent) => void;
  onPresenceSync?: (state: Record<string, PresenceState[]>) => void;
  onJoin?: (key: string, state: PresenceState) => void;
  onLeave?: (key: string) => void;
}

export interface RealtimeChannel {
  /** Broadcast an event to everyone on the channel. */
  send(event: RealtimeEvent): Promise<void>;
  /** Publish/replace this client's presence on the channel. */
  track(state: PresenceState): Promise<void>;
  /** Leave and tear down. */
  leave(): Promise<void>;
}

export interface RealtimeTransport {
  /** Join a venue channel and wire up handlers. Channel name is opaque. */
  join(channel: string, handlers: ChannelHandlers): Promise<RealtimeChannel>;
}
