"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { RoomState } from "@/lib/sync/types";
import type { RealtimeChannel } from "@/lib/realtime/transport";
import { createSupabaseTransport } from "@/lib/realtime/supabase-transport";
import { venueTopic, ROOM_UPDATE_EVENT } from "@/lib/sync/channels";

/** Belt-and-suspenders reconcile: re-fetch authoritative state on an interval so
 * a missed broadcast self-heals. The realtime channel is the fast path. */
const RECONCILE_MS = 15_000;

export type SyncAction =
  | { action: "track"; mediaId: string }
  | { action: "resume" }
  | { action: "pause" }
  | { action: "seek"; position: number }
  | { action: "end" };

/**
 * Subscribes a client to a venue's authoritative RoomState: initial fetch +
 * realtime broadcasts + periodic reconcile, and a `dispatch` that POSTs actions
 * to the server (which persists + broadcasts). The client is never the source
 * of truth; it only ever mirrors the server.
 */
export function useRoomSync(venueId: string) {
  const [state, setState] = useState<RoomState | null>(null);
  const channelRef = useRef<RealtimeChannel | null>(null);

  // Initial fetch + periodic reconcile.
  useEffect(() => {
    let active = true;
    const fetchState = async () => {
      try {
        const res = await fetch(`/api/sync/${venueId}`, { cache: "no-store" });
        if (!res.ok) return;
        const json = (await res.json()) as { state: RoomState | null };
        if (active) setState(json.state);
      } catch {
        // transient; the next tick retries.
      }
    };
    void fetchState();
    const id = setInterval(fetchState, RECONCILE_MS);
    return () => {
      active = false;
      clearInterval(id);
    };
  }, [venueId]);

  // Realtime subscription (fast path).
  useEffect(() => {
    let cancelled = false;
    const transport = createSupabaseTransport();
    void transport
      .join(venueTopic(venueId), {
        onEvent: (e) => {
          if (e.type === ROOM_UPDATE_EVENT) setState(e.payload as RoomState);
        },
      })
      .then((ch) => {
        if (cancelled) void ch.leave();
        else channelRef.current = ch;
      })
      .catch(() => {
        // fall back to reconcile polling above.
      });
    return () => {
      cancelled = true;
      void channelRef.current?.leave();
      channelRef.current = null;
    };
  }, [venueId]);

  const dispatch = useCallback(
    async (action: SyncAction) => {
      const res = await fetch(`/api/sync/${venueId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(action),
      });
      if (res.ok) {
        const json = (await res.json()) as { state: RoomState };
        setState(json.state);
      }
    },
    [venueId],
  );

  return { state, dispatch };
}
