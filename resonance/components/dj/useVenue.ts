"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { RoomState } from "@/lib/sync/types";
import type { SeatRow, QueueItem, Venue } from "@/lib/dj/types";
import type { RealtimeChannel } from "@/lib/realtime/transport";
import { createSupabaseTransport } from "@/lib/realtime/supabase-transport";
import {
  venueTopic,
  ROOM_UPDATE_EVENT,
  VENUE_CHANGED_EVENT,
  VOTE_TALLY_EVENT,
  CHAT_EVENT,
} from "@/lib/sync/channels";

export interface ChatLine {
  userId: string;
  name: string;
  text: string;
  at: number;
}
export interface Tally {
  awesome: number;
  lame: number;
  net: number;
}

interface Snapshot {
  venue: Venue;
  seats: SeatRow[];
  roomState: RoomState | null;
  tally: Tally | null;
  myQueue: QueueItem[];
}

async function getSnapshot(venueId: string, userId: string): Promise<Snapshot | null> {
  try {
    const res = await fetch(
      `/api/venues/${venueId}?userId=${encodeURIComponent(userId)}`,
      { cache: "no-store" },
    );
    if (!res.ok) return null;
    return (await res.json()) as Snapshot;
  } catch {
    return null;
  }
}

/**
 * One realtime channel per venue, fanned out to every loop concern: playback
 * (room:update), seats/queue (venue:changed -> refetch snapshot), live vote
 * aggregate, ephemeral chat, and presence. Plus the action dispatchers that POST
 * to the server (which stays authoritative). The client only ever mirrors.
 */
export function useVenue(venueId: string, userId: string, displayName: string) {
  const [venue, setVenue] = useState<Venue | null>(null);
  const [seats, setSeats] = useState<SeatRow[]>([]);
  const [roomState, setRoomState] = useState<RoomState | null>(null);
  const [myQueue, setMyQueue] = useState<QueueItem[]>([]);
  const [tally, setTally] = useState<Tally | null>(null);
  const [chat, setChat] = useState<ChatLine[]>([]);
  const [present, setPresent] = useState<string[]>([]);

  const channelRef = useRef<RealtimeChannel | null>(null);
  const roomStateRef = useRef<RoomState | null>(null);
  useEffect(() => {
    roomStateRef.current = roomState;
  }, [roomState]);

  const applySnapshot = useCallback((j: Snapshot) => {
    setVenue(j.venue);
    setSeats(j.seats);
    setRoomState(j.roomState);
    setTally(j.tally);
    setMyQueue(j.myQueue);
  }, []);

  const refetch = useCallback(async () => {
    const j = await getSnapshot(venueId, userId);
    if (j) applySnapshot(j);
  }, [venueId, userId, applySnapshot]);

  // Initial load. setState runs only after the await, so it can't cascade.
  useEffect(() => {
    let active = true;
    void (async () => {
      const j = await getSnapshot(venueId, userId);
      if (active && j) applySnapshot(j);
    })();
    return () => {
      active = false;
    };
  }, [venueId, userId, applySnapshot]);

  useEffect(() => {
    let cancelled = false;
    const transport = createSupabaseTransport();
    void transport
      .join(venueTopic(venueId), {
        onEvent: (e) => {
          if (e.type === ROOM_UPDATE_EVENT) setRoomState(e.payload as RoomState);
          else if (e.type === VENUE_CHANGED_EVENT) void refetch();
          else if (e.type === VOTE_TALLY_EVENT) setTally(e.payload as Tally);
          else if (e.type === CHAT_EVENT)
            setChat((c) => [...c.slice(-49), e.payload as ChatLine]);
        },
        onPresenceSync: (st) => {
          const names = Object.values(st)
            .flat()
            .map((p) => (p as { name?: string }).name ?? "?");
          setPresent(names);
        },
      })
      .then((ch) => {
        if (cancelled) {
          void ch.leave();
          return;
        }
        channelRef.current = ch;
        void ch.track({ userId, name: displayName });
      })
      .catch(() => {
        /* fall back to snapshot refetch */
      });
    return () => {
      cancelled = true;
      void channelRef.current?.leave();
      channelRef.current = null;
    };
  }, [venueId, userId, displayName, refetch]);

  const post = useCallback(
    (path: string, body: unknown) =>
      fetch(`/api/venues/${venueId}${path}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }),
    [venueId],
  );

  const takeSeat = useCallback(
    () => post("/seats", { action: "take", userId }).then(refetch),
    [post, userId, refetch],
  );
  const leaveSeat = useCallback(
    () => post("/seats", { action: "leave", userId }).then(refetch),
    [post, userId, refetch],
  );
  const enqueue = useCallback(
    (mediaId: string, title?: string) =>
      post("/queue", { userId, mediaId, title }).then(refetch),
    [post, userId, refetch],
  );
  const removeQueue = useCallback(
    (itemId: string) =>
      fetch(`/api/venues/${venueId}/queue`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ itemId, userId }),
      }).then(refetch),
    [venueId, userId, refetch],
  );
  const vote = useCallback(
    (value: "awesome" | "lame") => post("/vote", { userId, value }),
    [post, userId],
  );
  const advance = useCallback(
    () => post("/advance", { playId: roomStateRef.current?.currentPlayId ?? null }),
    [post],
  );
  const sendChat = useCallback(
    (text: string) => {
      const line: ChatLine = { userId, name: displayName, text, at: Date.now() };
      setChat((c) => [...c.slice(-49), line]);
      void channelRef.current?.send({ type: CHAT_EVENT, payload: line });
    },
    [userId, displayName],
  );

  return {
    venue,
    seats,
    roomState,
    myQueue,
    tally,
    chat,
    present,
    actions: { takeSeat, leaveSeat, enqueue, removeQueue, vote, advance, sendChat },
  };
}
