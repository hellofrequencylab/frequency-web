"use client";

// Rung-1 spatial layer: 2D movement + proximity-scoped TEXT chat only.
// Proximity VOICE audio (WebRTC) is a deliberate follow-up beyond rung-1; the
// distance-opacity effect here is the text stand-in for "hearing" range.

import { useEffect, useMemo, useRef, useState } from "react";
import { avatarOf } from "@/components/dj/AvatarChip";
import { Button, Input, LiveBadge } from "@/components/ui";
import { useSpatial } from "@/lib/spatial/useSpatial";
import {
  BOARD_W,
  BOARD_H,
  STEP,
  CHAT_TTL_MS,
  HEARING_RANGE,
  type SpatialPerson,
  type SpatialChatMsg,
} from "@/lib/spatial/types";

const DISC = 36;

/** Opacity from distance: full up close, faint at the edge of hearing range. */
function proximityOpacity(dist: number): number {
  const t = Math.min(1, dist / HEARING_RANGE);
  return Math.max(0.12, 1 - t);
}

function distance(ax: number, ay: number, bx: number, by: number): number {
  return Math.hypot(ax - bx, ay - by);
}

/**
 * A bordered board where each present person is a disc you can move with WASD /
 * arrows or by clicking. Chat lines float above their sender and fade with
 * distance to you, so a far-off conversation reads faint.
 */
export function SpatialRoom({
  venueId,
  userId,
  name,
  avatar,
}: {
  venueId: string;
  userId: string;
  name: string;
  avatar: Record<string, unknown> | null;
}) {
  const { me, others, chat, move, setPos, say, count } = useSpatial(
    venueId,
    userId,
    name,
    avatar,
  );

  const [draft, setDraft] = useState("");
  // `now` advances on an interval so bubbles expire without new events. Read in
  // render instead of calling Date.now() during render (React purity rule).
  const [now, setNow] = useState(() => Date.now());
  const inputRef = useRef<HTMLInputElement | null>(null);

  // Keyboard movement. Ignore keys while typing in the chat input.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      if (el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA")) return;
      let dx = 0;
      let dy = 0;
      switch (e.key) {
        case "ArrowUp":
        case "w":
        case "W":
          dy = -STEP;
          break;
        case "ArrowDown":
        case "s":
        case "S":
          dy = STEP;
          break;
        case "ArrowLeft":
        case "a":
        case "A":
          dx = -STEP;
          break;
        case "ArrowRight":
        case "d":
        case "D":
          dx = STEP;
          break;
        default:
          return;
      }
      if (e.key.startsWith("Arrow")) e.preventDefault();
      move(dx, dy);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [move]);

  // Latest live bubble per sender, so a person shows one bubble at a time.
  const bubbleByUser = useMemo(() => {
    const m = new Map<string, SpatialChatMsg>();
    for (const c of chat) {
      if (now - c.at >= CHAT_TTL_MS) continue;
      m.set(c.userId, c);
    }
    return m;
  }, [chat, now]);

  // Advance `now` on a light interval while any bubble is still live, so they
  // expire on their own. Stops ticking once the board is quiet.
  const hasLive = useMemo(
    () => chat.some((c) => now - c.at < CHAT_TTL_MS),
    [chat, now],
  );
  useEffect(() => {
    if (!hasLive) return;
    // Keep ticking until the board is quiet, so bubbles expire on their own. A
    // just-arrived line shows on its own render; this only drives the fade-out.
    const id = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(id);
  }, [hasLive]);

  const everyone: SpatialPerson[] = [
    { userId, name, avatar, x: me.x, y: me.y },
    ...Array.from(others.values()),
  ];

  return (
    <section className="grid gap-3">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <span className="font-display text-lg text-text">The Room</span>
        <LiveBadge state={count > 0 ? "live" : "quiet"} count={count} />
        <span className="text-xs text-mute">
          WASD or arrows to move. Click to walk. Type to talk; nearby people hear
          you clearly.
        </span>
      </div>

      <div
        onClick={(e) => {
          const rect = e.currentTarget.getBoundingClientRect();
          setPos(e.clientX - rect.left, e.clientY - rect.top);
        }}
        className="relative max-w-full select-none overflow-hidden rounded-md border bg-surface [cursor:crosshair]"
        style={{
          width: BOARD_W,
          height: BOARD_H,
          backgroundImage:
            "repeating-linear-gradient(0deg, transparent, transparent 23px, var(--color-line) 24px)",
        }}
      >
        {everyone.map((p) => {
          const isMe = p.userId === userId;
          const look = avatarOf(p.avatar);
          const bubble = bubbleByUser.get(p.userId);
          const opacity = bubble
            ? isMe
              ? 1
              : proximityOpacity(distance(me.x, me.y, bubble.x, bubble.y))
            : 0;
          return (
            <div
              key={p.userId}
              className="pointer-events-none absolute flex flex-col items-center"
              style={{
                left: p.x,
                top: p.y,
                transform: "translate(-50%, -50%)",
                transition: "left 90ms linear, top 90ms linear",
              }}
            >
              {bubble && (
                <div
                  className="mb-1 max-w-[180px] whitespace-pre-wrap break-words rounded-sm bg-raised px-2 py-1 text-center text-xs leading-snug text-text shadow-[var(--shadow-soft)]"
                  style={{ opacity }}
                >
                  {bubble.text}
                </div>
              )}
              <div
                title={p.name}
                role="img"
                aria-label={isMe ? `${p.name}, you` : p.name}
                className="flex items-center justify-center rounded-pill text-lg leading-none shadow-[var(--shadow-soft)]"
                style={{
                  width: DISC,
                  height: DISC,
                  background: look.color,
                  boxShadow: isMe
                    ? "var(--glow-pulse)"
                    : "0 0 0 2px var(--color-surface), var(--shadow-soft)",
                }}
              >
                {look.emoji}
              </div>
              <span className="mt-0.5 max-w-[90px] overflow-hidden text-ellipsis whitespace-nowrap rounded-sm bg-base/70 px-1 text-2xs text-soft">
                {isMe ? "you" : p.name}
              </span>
            </div>
          );
        })}
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          say(draft);
          setDraft("");
          inputRef.current?.focus();
        }}
        className="flex max-w-full gap-2"
        style={{ width: BOARD_W }}
      >
        <Input
          ref={inputRef}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Say something to people near you"
          aria-label="Say something to people near you"
          className="flex-1"
        />
        <Button type="submit">Say</Button>
      </form>
    </section>
  );
}
