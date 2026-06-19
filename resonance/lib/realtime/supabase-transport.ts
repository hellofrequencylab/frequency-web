import { createBrowserClient } from "@/lib/supabase/client";
import type {
  RealtimeTransport,
  RealtimeChannel,
  PresenceState,
} from "./transport";

/**
 * Supabase Realtime implementation of the RealtimeTransport seam (ADR-005/006).
 *
 * Uses Broadcast (event "*" matches every event) + Presence — not Postgres
 * Changes — so it stays portable and needs no DB publication. Swapping to
 * PartyKit/Colyseus later means writing one new file that implements this same
 * interface; game code never changes.
 */
export function createSupabaseTransport(): RealtimeTransport {
  const supabase = createBrowserClient();

  return {
    async join(channelName, handlers) {
      const channel = supabase.channel(channelName, {
        config: { presence: { key: crypto.randomUUID() } },
      });

      channel.on(
        "broadcast",
        { event: "*" },
        (msg: { event: string; payload: unknown }) => {
          handlers.onEvent?.({ type: msg.event, payload: msg.payload });
        },
      );

      if (handlers.onPresenceSync) {
        channel.on("presence", { event: "sync" }, () => {
          handlers.onPresenceSync?.(
            channel.presenceState() as Record<string, PresenceState[]>,
          );
        });
      }
      if (handlers.onJoin) {
        channel.on(
          "presence",
          { event: "join" },
          ({ key, newPresences }: { key: string; newPresences: PresenceState[] }) => {
            newPresences.forEach((p) => handlers.onJoin?.(key, p));
          },
        );
      }
      if (handlers.onLeave) {
        channel.on("presence", { event: "leave" }, ({ key }: { key: string }) => {
          handlers.onLeave?.(key);
        });
      }

      await new Promise<void>((resolve, reject) => {
        channel.subscribe((status) => {
          if (status === "SUBSCRIBED") resolve();
          else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
            reject(new Error(`realtime channel ${status}`));
          }
        });
      });

      const wrapper: RealtimeChannel = {
        async send(event) {
          await channel.send({
            type: "broadcast",
            event: event.type,
            payload: event.payload,
          });
        },
        async track(state) {
          await channel.track(state);
        },
        async leave() {
          await supabase.removeChannel(channel);
        },
      };
      return wrapper;
    },
  };
}
