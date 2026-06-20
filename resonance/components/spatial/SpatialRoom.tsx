"use client";

// Rung-1 spatial layer: 2D movement + proximity-scoped TEXT chat only.
// Proximity VOICE audio (WebRTC) is a deliberate follow-up beyond rung-1; the
// distance-opacity effect here is the text stand-in for "hearing" range.

import { useEffect, useMemo, useRef, useState } from "react";
import { avatarOf } from "@/components/dj/AvatarChip";
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
    <section style={{ display: "grid", gap: "0.75rem" }}>
      <div style={legendRow}>
        <span style={{ fontWeight: 600 }}>The Room</span>
        <span style={{ color: "#71717a", fontSize: 13 }}>
          {count} {count === 1 ? "person" : "people"} here
        </span>
        <span style={{ color: "#a1a1aa", fontSize: 12 }}>
          WASD or arrows to move. Click to walk. Type to talk; nearby people hear
          you clearly.
        </span>
      </div>

      <div
        onClick={(e) => {
          const rect = e.currentTarget.getBoundingClientRect();
          setPos(e.clientX - rect.left, e.clientY - rect.top);
        }}
        style={{
          position: "relative",
          width: BOARD_W,
          height: BOARD_H,
          maxWidth: "100%",
          border: "1px solid #e4e4e7",
          borderRadius: 12,
          background:
            "repeating-linear-gradient(0deg,#fafafa,#fafafa 23px,#f4f4f5 24px)",
          overflow: "hidden",
          cursor: "crosshair",
          userSelect: "none",
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
              style={{
                position: "absolute",
                left: p.x,
                top: p.y,
                transform: "translate(-50%, -50%)",
                transition: "left 90ms linear, top 90ms linear",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                pointerEvents: "none",
              }}
            >
              {bubble && (
                <div
                  style={{
                    opacity,
                    marginBottom: 4,
                    maxWidth: 180,
                    padding: "0.25rem 0.5rem",
                    borderRadius: 10,
                    background: "#111",
                    color: "#fff",
                    fontSize: 12,
                    lineHeight: 1.25,
                    textAlign: "center",
                    whiteSpace: "pre-wrap",
                    wordBreak: "break-word",
                  }}
                >
                  {bubble.text}
                </div>
              )}
              <div
                title={p.name}
                style={{
                  width: DISC,
                  height: DISC,
                  borderRadius: "50%",
                  background: look.color,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: 18,
                  border: isMe ? "2px solid #111" : "2px solid #fff",
                  boxShadow: "0 1px 3px rgba(0,0,0,0.18)",
                }}
              >
                {look.emoji}
              </div>
              <span
                style={{
                  marginTop: 2,
                  fontSize: 11,
                  color: "#52525b",
                  background: "rgba(255,255,255,0.7)",
                  padding: "0 4px",
                  borderRadius: 4,
                  maxWidth: 90,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
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
        style={{ display: "flex", gap: "0.5rem", maxWidth: BOARD_W }}
      >
        <input
          ref={inputRef}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Say something to people near you"
          style={{
            flex: 1,
            padding: "0.45rem 0.6rem",
            border: "1px solid #e4e4e7",
            borderRadius: 8,
            fontSize: 14,
          }}
        />
        <button
          type="submit"
          style={{
            padding: "0.45rem 0.9rem",
            border: "1px solid #111",
            borderRadius: 8,
            background: "#111",
            color: "#fff",
            cursor: "pointer",
          }}
        >
          Say
        </button>
      </form>
    </section>
  );
}

const legendRow: React.CSSProperties = {
  display: "flex",
  gap: "0.75rem",
  alignItems: "baseline",
  flexWrap: "wrap",
};
