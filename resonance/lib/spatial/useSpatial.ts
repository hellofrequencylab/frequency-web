"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { RealtimeChannel, PresenceState } from "@/lib/realtime/transport";
import { createSupabaseTransport } from "@/lib/realtime/supabase-transport";
import { venueTopic } from "@/lib/sync/channels";
import {
  BOARD_W,
  BOARD_H,
  POSITION_THROTTLE_MS,
  POSITION_EVENT,
  SPATIAL_CHAT_EVENT,
  clampToBoard,
  type SpatialPerson,
  type PositionMsg,
  type SpatialChatMsg,
} from "./types";

/**
 * Joins a venue's realtime channel as a body on the board. Presence carries
 * identity + last-known position (so the roster survives between moves); a
 * throttled POSITION broadcast carries smooth movement. Chat lines broadcast
 * with the sender's position so the viewer can scale opacity by distance.
 *
 * Positions are ephemeral. There is no DB; nothing here persists.
 */
export function useSpatial(
  venueId: string,
  userId: string,
  name: string,
  avatar: Record<string, unknown> | null,
) {
  const [me, setMe] = useState(() => ({
    x: Math.round(BOARD_W / 2),
    y: Math.round(BOARD_H / 2),
  }));
  // Others, keyed by userId. Self is excluded.
  const [others, setOthers] = useState<Map<string, SpatialPerson>>(new Map());
  const [chat, setChat] = useState<SpatialChatMsg[]>([]);

  const channelRef = useRef<RealtimeChannel | null>(null);
  // Latest position, readable without re-subscribing effects. Synced in an
  // effect (not during render) to satisfy React purity rules.
  const meRef = useRef(me);
  useEffect(() => {
    meRef.current = me;
  }, [me]);
  // Throttle state for the live POSITION broadcast.
  const lastSentRef = useRef(0);
  const pendingRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Join once per identity. Keep handlers self-contained so deps stay stable.
  useEffect(() => {
    let cancelled = false;
    const transport = createSupabaseTransport();

    void transport
      .join(venueTopic(venueId), {
        onEvent: (e) => {
          if (e.type === POSITION_EVENT) {
            const p = e.payload as PositionMsg;
            if (p.userId === userId) return;
            setOthers((prev) => {
              const cur = prev.get(p.userId);
              if (!cur) return prev; // identity arrives via presence first
              const next = new Map(prev);
              next.set(p.userId, { ...cur, x: p.x, y: p.y });
              return next;
            });
          } else if (e.type === SPATIAL_CHAT_EVENT) {
            const line = e.payload as SpatialChatMsg;
            if (line.userId === userId) return; // already shown locally
            setChat((c) => [...c.slice(-19), line]);
          }
        },
        onPresenceSync: (st) => {
          const next = new Map<string, SpatialPerson>();
          Object.values(st)
            .flat()
            .forEach((raw: PresenceState) => {
              const v = raw as Partial<SpatialPerson>;
              if (!v.userId || v.userId === userId) return;
              const prev = next.get(v.userId);
              next.set(v.userId, {
                userId: v.userId,
                name: v.name ?? "Guest",
                avatar: v.avatar ?? null,
                // Prefer a live POSITION value already in state over the
                // presence snapshot, which can lag.
                x: prev?.x ?? v.x ?? Math.round(BOARD_W / 2),
                y: prev?.y ?? v.y ?? Math.round(BOARD_H / 2),
              });
            });
          setOthers((cur) => {
            // Carry forward any live position we already hold for a person.
            const merged = new Map<string, SpatialPerson>();
            next.forEach((person, id) => {
              const live = cur.get(id);
              merged.set(id, live ? { ...person, x: live.x, y: live.y } : person);
            });
            return merged;
          });
        },
      })
      .then((ch) => {
        if (cancelled) {
          void ch.leave();
          return;
        }
        channelRef.current = ch;
        const start = meRef.current;
        void ch.track({ userId, name, avatar, x: start.x, y: start.y });
      })
      .catch(() => {
        /* offline: solo board still works locally */
      });

    return () => {
      cancelled = true;
      if (pendingRef.current) clearTimeout(pendingRef.current);
      pendingRef.current = null;
      void channelRef.current?.leave();
      channelRef.current = null;
    };
  }, [venueId, userId, name, avatar]);

  // Throttled live broadcast of our position. Trailing edge guarantees the
  // final resting spot lands even if movement stops mid-window.
  const broadcastPos = useCallback(
    (x: number, y: number) => {
      const ch = channelRef.current;
      if (!ch) return;
      const fire = () => {
        lastSentRef.current = Date.now();
        const cur = meRef.current;
        void ch.send({
          type: POSITION_EVENT,
          payload: { userId, x: cur.x, y: cur.y } satisfies PositionMsg,
        });
      };
      const since = Date.now() - lastSentRef.current;
      if (since >= POSITION_THROTTLE_MS) {
        fire();
      } else if (!pendingRef.current) {
        pendingRef.current = setTimeout(() => {
          pendingRef.current = null;
          fire();
        }, POSITION_THROTTLE_MS - since);
      }
      void x;
      void y;
    },
    [userId],
  );

  const setPos = useCallback(
    (x: number, y: number) => {
      const c = clampToBoard(x, y);
      setMe(c);
      meRef.current = c;
      broadcastPos(c.x, c.y);
    },
    [broadcastPos],
  );

  const move = useCallback(
    (dx: number, dy: number) => {
      const cur = meRef.current;
      setPos(cur.x + dx, cur.y + dy);
    },
    [setPos],
  );

  const say = useCallback(
    (text: string) => {
      const trimmed = text.trim();
      if (!trimmed) return;
      const cur = meRef.current;
      const line: SpatialChatMsg = {
        userId,
        name,
        text: trimmed,
        x: cur.x,
        y: cur.y,
        at: Date.now(),
      };
      setChat((c) => [...c.slice(-19), line]);
      void channelRef.current?.send({ type: SPATIAL_CHAT_EVENT, payload: line });
    },
    [userId, name],
  );

  return {
    me,
    others,
    chat,
    move,
    setPos,
    say,
    count: others.size + 1,
  };
}
