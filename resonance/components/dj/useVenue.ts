"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { RoomState } from "@/lib/sync/types";
import type { SeatRow, QueueItem, Venue } from "@/lib/dj/types";
import type { RealtimeChannel } from "@/lib/realtime/transport";
import { createSupabaseTransport } from "@/lib/realtime/supabase-transport";
import { authedFetch } from "@/lib/api/fetch";
import {
  venueTopic,
  ROOM_UPDATE_EVENT,
  VENUE_CHANGED_EVENT,
  VOTE_TALLY_EVENT,
  CHAT_EVENT,
  REACTION_EVENT,
  ZAPS_AWARDED_EVENT,
  RANK_CHANGED_EVENT,
} from "@/lib/sync/channels";

export interface ChatLine {
  userId: string;
  name: string;
  text: string;
  at: number;
}
/** Someone present in the room (presence payload). */
export interface Presence {
  userId: string;
  name: string;
  avatar: Record<string, unknown> | null;
}
/** A live floating emote on screen. */
export interface Reaction {
  id: string;
  emoji: string;
  name: string;
}

/** Show an emote for a beat, then clear it. Kept out of the channel effect so
 * its deps don't churn the subscription. */
function spawnReaction(
  setReactions: React.Dispatch<React.SetStateAction<Reaction[]>>,
  emoji: string,
  name: string,
) {
  const id = crypto.randomUUID();
  setReactions((rs) => [...rs.slice(-30), { id, emoji, name }]);
  setTimeout(() => setReactions((rs) => rs.filter((r) => r.id !== id)), 2500);
}
export interface Tally {
  awesome: number;
  lame: number;
  net: number;
}
export interface Standing {
  balance: number;
  djPoints: number;
  rank: string;
  seasonId: string;
}

interface Snapshot {
  venue: Venue;
  seats: SeatRow[];
  roomState: RoomState | null;
  tally: Tally | null;
  myQueue: QueueItem[];
  standing: Standing | null;
}

async function getSnapshot(venueId: string): Promise<Snapshot | null> {
  try {
    const res = await authedFetch(`/api/venues/${venueId}`, { cache: "no-store" });
    if (!res.ok) return null;
    return (await res.json()) as Snapshot;
  } catch {
    return null;
  }
}

/**
 * One realtime channel per venue, fanned out to every loop concern: playback,
 * seats/queue (refetch on venue:changed), live vote aggregate, ephemeral chat,
 * and presence. Actions POST through authedFetch so the server resolves identity
 * from the verified token. The client only ever mirrors the server.
 */
export function useVenue(
  venueId: string,
  userId: string,
  displayName: string,
  avatar?: Record<string, unknown> | null,
  onGameEvent?: (e: { type: string; payload: unknown }) => void,
) {
  const [venue, setVenue] = useState<Venue | null>(null);
  const [seats, setSeats] = useState<SeatRow[]>([]);
  const [roomState, setRoomState] = useState<RoomState | null>(null);
  const [myQueue, setMyQueue] = useState<QueueItem[]>([]);
  const [tally, setTally] = useState<Tally | null>(null);
  const [standing, setStanding] = useState<Standing | null>(null);
  const [chat, setChat] = useState<ChatLine[]>([]);
  const [roster, setRoster] = useState<Presence[]>([]);
  const [reactions, setReactions] = useState<Reaction[]>([]);

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
    setStanding(j.standing);
  }, []);

  const refetch = useCallback(async () => {
    const j = await getSnapshot(venueId);
    if (j) applySnapshot(j);
  }, [venueId, applySnapshot]);

  // Initial load. setState runs only after the await, so it can't cascade.
  useEffect(() => {
    let active = true;
    void (async () => {
      const j = await getSnapshot(venueId);
      if (active && j) applySnapshot(j);
    })();
    return () => {
      active = false;
    };
  }, [venueId, applySnapshot]);

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
          else if (e.type === REACTION_EVENT) {
            const r = e.payload as { emoji: string; name: string };
            spawnReaction(setReactions, r.emoji, r.name);
          } else if (e.type === ZAPS_AWARDED_EVENT || e.type === RANK_CHANGED_EVENT)
            // standing refreshes via the venue:changed that advance also fires;
            // forward upward so an embedding host can mirror to its own UI.
            onGameEvent?.(e);
        },
        onPresenceSync: (st) => {
          const people = Object.values(st)
            .flat()
            .map((p) => {
              const v = p as { userId?: string; name?: string; avatar?: Record<string, unknown> };
              return { userId: v.userId ?? "?", name: v.name ?? "?", avatar: v.avatar ?? null };
            });
          setRoster(people);
        },
      })
      .then((ch) => {
        if (cancelled) {
          void ch.leave();
          return;
        }
        channelRef.current = ch;
        void ch.track({ userId, name: displayName, avatar: avatar ?? null });
      })
      .catch(() => {
        /* fall back to snapshot refetch */
      });
    return () => {
      cancelled = true;
      void channelRef.current?.leave();
      channelRef.current = null;
    };
  }, [venueId, userId, displayName, avatar, refetch, onGameEvent]);

  // Presence heartbeat (build plan §11): tell the server we're here now, then keep
  // saying so every 20s. The lobby counts pings seen in the last ~45s as "here now".
  // Self-contained so it can't churn the channel subscription; failures are ignored.
  useEffect(() => {
    const ping = () => {
      void authedFetch(`/api/venues/${venueId}/ping`, { method: "POST" }).catch(() => {});
    };
    ping();
    const id = setInterval(ping, 20000);
    return () => clearInterval(id);
  }, [venueId]);

  const post = useCallback(
    (path: string, body: unknown) =>
      authedFetch(`/api/venues/${venueId}${path}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }),
    [venueId],
  );

  const takeSeat = useCallback(
    () => post("/seats", { action: "take" }).then(refetch),
    [post, refetch],
  );
  const leaveSeat = useCallback(
    () => post("/seats", { action: "leave" }).then(refetch),
    [post, refetch],
  );
  const enqueue = useCallback(
    (mediaId: string, title?: string) => post("/queue", { mediaId, title }).then(refetch),
    [post, refetch],
  );
  const removeQueue = useCallback(
    (itemId: string) =>
      authedFetch(`/api/venues/${venueId}/queue`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ itemId }),
      }).then(refetch),
    [venueId, refetch],
  );
  const vote = useCallback((value: "awesome" | "lame") => post("/vote", { value }), [post]);
  const advance = useCallback(
    () => post("/advance", { playId: roomStateRef.current?.currentPlayId ?? null }),
    [post],
  );

  // Direct playback control (watch-party host). Server gates these to the host
  // for watch venues; room:update broadcasts the result to everyone.
  const sync = useCallback(
    (body: unknown) =>
      authedFetch(`/api/sync/${venueId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }),
    [venueId],
  );
  const loadVideo = useCallback((mediaId: string) => sync({ action: "track", mediaId }), [sync]);
  const play = useCallback(() => sync({ action: "resume" }), [sync]);
  const pause = useCallback(() => sync({ action: "pause" }), [sync]);
  const seek = useCallback((position: number) => sync({ action: "seek", position }), [sync]);

  // Lounge: add a track to the ambient playlist (refetch picks up venue.playlist).
  const addToPlaylist = useCallback(
    (mediaId: string) => post("/playlist", { mediaId }).then(refetch),
    [post, refetch],
  );
  const sendChat = useCallback(
    (text: string) => {
      const line: ChatLine = { userId, name: displayName, text, at: Date.now() };
      setChat((c) => [...c.slice(-49), line]);
      void channelRef.current?.send({ type: CHAT_EVENT, payload: line });
    },
    [userId, displayName],
  );
  // Floating emote: show it locally and broadcast it (not persisted, not chat).
  const react = useCallback(
    (emoji: string) => {
      spawnReaction(setReactions, emoji, displayName);
      void channelRef.current?.send({
        type: REACTION_EVENT,
        payload: { userId, name: displayName, emoji, at: Date.now() },
      });
    },
    [userId, displayName],
  );

  return {
    venue,
    seats,
    roomState,
    myQueue,
    tally,
    standing,
    chat,
    roster,
    present: roster.map((r) => r.name),
    reactions,
    actions: {
      takeSeat,
      leaveSeat,
      enqueue,
      removeQueue,
      vote,
      advance,
      sendChat,
      react,
      loadVideo,
      play,
      pause,
      seek,
      addToPlaylist,
    },
  };
}
