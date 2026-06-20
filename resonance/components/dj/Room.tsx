"use client";

import { useEffect, useRef, useState } from "react";
import { useVenue } from "@/components/dj/useVenue";
import { SyncedPlayer } from "@/components/sync/SyncedPlayer";
import { computePosition } from "@/lib/sync/clock";
import { DecorCanvas } from "@/components/venue/DecorCanvas";
import {
  AvatarStack,
  Badge,
  Button,
  Card,
  IconButton,
  Input,
  LiveBadge,
  cn,
} from "@/components/ui";

type RoomProps = {
  venueId: string;
  userId: string;
  name: string;
  avatar?: Record<string, unknown> | null;
  canDj: boolean;
  onLeaveVenue?: () => void;
  onGameEvent?: (e: { type: string; payload: unknown }) => void;
};

type Venue = ReturnType<typeof useVenue>;

/**
 * Renders a venue by its media type: DJ Room (rotating decks), Watch Party (one
 * host drives a shared video), or Lounge (always-on auto-DJ). All share one
 * channel, chat, presence, and floating emotes (one `useVenue`). Presentation is
 * the design-system kit; the live wiring is unchanged.
 */
export function Room(props: RoomProps) {
  const v = useVenue(props.venueId, props.userId, props.name, props.avatar, props.onGameEvent);
  if (v.venue?.mediaType === "watch") return <WatchLayout v={v} {...props} />;
  if (v.venue?.mediaType === "lounge") return <LoungeLayout v={v} {...props} />;
  return <DjLayout v={v} {...props} />;
}

/** Two-column room body: the main column and the chat rail (rail drops below on
 * narrow screens). */
const SPLIT = "mt-4 grid gap-4 lg:grid-cols-[1fr_320px]";

function RoomHeader({ v, onLeaveVenue }: { v: Venue; onLeaveVenue?: () => void }) {
  const people = v.roster.map((p) => ({
    userId: p.userId,
    name: p.name,
    config: p.avatar ?? undefined,
  }));
  return (
    <div className="mb-4 space-y-3">
      <div className="flex items-center gap-3">
        <h1 className="min-w-0 truncate font-display text-2xl text-text">
          {v.venue?.name ?? "Room"}
        </h1>
        <LiveBadge state={v.roster.length > 0 ? "live" : "quiet"} count={v.roster.length} />
        {onLeaveVenue && (
          <Button variant="quiet" size="sm" className="ml-auto" onClick={onLeaveVenue}>
            Switch venue
          </Button>
        )}
      </div>
      {people.length > 0 ? (
        <AvatarStack people={people} max={8} />
      ) : (
        <p className="text-sm text-mute">Nobody here yet.</p>
      )}
      {v.venue && v.venue.decor.length > 0 && (
        <div className="overflow-hidden rounded-md border">
          <DecorCanvas decor={v.venue.decor} />
        </div>
      )}
    </div>
  );
}

/** The shared video framed as the stage, with a Pulse glow while it is playing
 * and the floating-emote overlay. */
function Stage({ v, onEnded }: { v: Venue; onEnded?: () => void }) {
  const playing = !!v.roomState?.isPlaying;
  return (
    <div className="relative">
      <div
        className="overflow-hidden rounded-lg border"
        style={playing ? { boxShadow: "var(--glow-pulse)" } : undefined}
      >
        <SyncedPlayer state={v.roomState} onEnded={onEnded} />
      </div>
      <FloatingEmotes v={v} />
    </div>
  );
}

/** Emotes that float up over the stage for a beat, then vanish. */
function FloatingEmotes({ v }: { v: Venue }) {
  return (
    <div className="relative h-0">
      <style>{"@keyframes rs-float{from{transform:translateY(0);opacity:1}to{transform:translateY(-72px);opacity:0}}"}</style>
      <div className="pointer-events-none absolute right-3 bottom-2 flex gap-2">
        {v.reactions.map((r) => (
          <span
            key={r.id}
            title={r.name}
            className="text-3xl"
            style={{ animation: "rs-float 2.5s var(--ease-out) forwards" }}
          >
            {r.emoji}
          </span>
        ))}
      </div>
    </div>
  );
}

const EMOTES = ["🔥", "😂", "❤️", "🙌", "👀"];

function ChatRail({ v }: { v: Venue }) {
  const [chatText, setChatText] = useState("");
  return (
    <Card className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <h3 className="font-display text-lg text-text">Chat</h3>
        <div className="flex gap-1">
          {EMOTES.map((e) => (
            <IconButton
              key={e}
              aria-label={`Send ${e} reaction`}
              variant="quiet"
              onClick={() => v.actions.react(e)}
            >
              {e}
            </IconButton>
          ))}
        </div>
      </div>
      <div className="max-h-48 space-y-1 overflow-auto text-sm">
        {v.chat.map((c, i) => (
          <div key={i}>
            <b className="text-text">{c.name}:</b> <span className="text-soft">{c.text}</span>
          </div>
        ))}
        {v.chat.length === 0 && <p className="text-mute">Say hi to the room.</p>}
      </div>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (chatText.trim()) {
            v.actions.sendChat(chatText.trim());
            setChatText("");
          }
        }}
        className="flex gap-2"
      >
        <Input
          className="flex-1"
          value={chatText}
          onChange={(e) => setChatText(e.target.value)}
          placeholder="Say something"
          aria-label="Chat message"
        />
        <Button type="submit">Send</Button>
      </form>
    </Card>
  );
}

function WatchLayout({ v, userId, canDj, onLeaveVenue }: { v: Venue } & RoomProps) {
  const [mediaId, setMediaId] = useState("dQw4w9WgXcQ");
  const host = [...v.seats].sort((a, b) => a.seatIndex - b.seatIndex)[0] ?? null;
  const isHost = host?.occupantUserId === userId;
  const posNow = () => (v.roomState ? computePosition(v.roomState, Date.now()) : 0);

  return (
    <>
      <RoomHeader v={v} onLeaveVenue={onLeaveVenue} />
      <Stage v={v} />
      <div className={SPLIT}>
        <Card className="space-y-3">
          {isHost ? (
            <>
              <h3 className="font-display text-lg text-text">You&apos;re hosting</h3>
              <div className="flex flex-wrap gap-2">
                <Input
                  className="min-w-48 flex-1"
                  value={mediaId}
                  onChange={(e) => setMediaId(e.target.value)}
                  placeholder="YouTube video id"
                  aria-label="Video id"
                />
                <Button onClick={() => v.actions.loadVideo(mediaId)}>Load</Button>
                <Button variant="ghost" onClick={() => v.actions.play()}>
                  Play
                </Button>
                <Button variant="ghost" onClick={() => v.actions.pause()}>
                  Pause
                </Button>
                <Button variant="ghost" onClick={() => v.actions.seek(Math.max(0, posNow() + 10))}>
                  +10s
                </Button>
                <Button variant="ghost" onClick={() => v.actions.seek(Math.max(0, posNow() - 10))}>
                  -10s
                </Button>
              </div>
              <Button variant="quiet" onClick={v.actions.leaveSeat}>
                Leave host
              </Button>
            </>
          ) : host ? (
            <p className="text-soft">
              Following <b className="text-text">{host.occupantUserId.slice(0, 8)}</b>. Sit back and
              watch.
            </p>
          ) : canDj ? (
            <div className="space-y-2">
              <p className="text-mute">No host yet.</p>
              <Button onClick={v.actions.takeSeat}>Take host</Button>
            </div>
          ) : (
            <p className="text-sm text-mute">Set a name to host.</p>
          )}
        </Card>
        <ChatRail v={v} />
      </div>
    </>
  );
}

function LoungeLayout({ v, canDj, onLeaveVenue }: { v: Venue } & RoomProps) {
  const [mediaId, setMediaId] = useState("");
  const playlist = v.venue?.playlist ?? [];
  const nowPlaying = v.roomState?.currentMediaId ?? null;
  const kicked = useRef(false);

  // Wake the room: if a loaded lounge isn't playing, start the ambient playlist.
  // The first arrival kicks it off; the server no-ops if it's already live.
  useEffect(() => {
    if (kicked.current) return;
    if (v.venue && !nowPlaying && playlist.length > 0) {
      kicked.current = true;
      void v.actions.advance();
    }
  }, [v.venue, nowPlaying, playlist.length, v.actions]);

  return (
    <>
      <RoomHeader v={v} onLeaveVenue={onLeaveVenue} />
      <div className="mb-3">
        <Badge tone="pulse">🎚️ Auto-DJ · always on</Badge>
      </div>
      <Stage v={v} onEnded={v.actions.advance} />
      <div className={SPLIT}>
        <Card className="space-y-3">
          <h3 className="font-display text-lg text-text">On rotation</h3>
          <ol className="space-y-1 text-sm">
            {playlist.map((m, i) => (
              <li
                key={`${m}-${i}`}
                className={cn(m === nowPlaying ? "font-medium text-text" : "text-soft")}
              >
                {m} {m === nowPlaying ? <span className="text-pulse">▶</span> : null}
              </li>
            ))}
            {playlist.length === 0 && <li className="text-mute">Empty. Add a track.</li>}
          </ol>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (mediaId.trim()) {
                v.actions.addToPlaylist(mediaId.trim());
                setMediaId("");
              }
            }}
            className="flex gap-2"
          >
            <Input
              className="flex-1"
              value={mediaId}
              onChange={(e) => setMediaId(e.target.value)}
              placeholder="YouTube video id"
              aria-label="Add a track"
            />
            <Button type="submit" disabled={!canDj}>
              Add
            </Button>
          </form>
        </Card>
        <ChatRail v={v} />
      </div>
    </>
  );
}

function DjLayout({ v, userId, canDj, onLeaveVenue }: { v: Venue } & RoomProps) {
  const [mediaId, setMediaId] = useState("dQw4w9WgXcQ");
  const onStage = v.seats.some((s) => s.occupantUserId === userId);
  const currentDjIsMe = v.roomState?.currentDjUserId === userId;
  const seatCount = v.venue?.seatCount ?? 5;

  return (
    <>
      <RoomHeader v={v} onLeaveVenue={onLeaveVenue} />
      <div className="mb-3 flex flex-wrap items-center gap-2 text-sm">
        <Badge tone="spark">⚡ {v.standing?.balance ?? 0} Zaps</Badge>
        <Badge tone="neutral">Rank {v.standing?.rank ?? "Crew"}</Badge>
        <span className="text-mute">{v.standing?.djPoints ?? 0} DJ pts this season</span>
      </div>

      <Stage v={v} onEnded={v.actions.advance} />

      <div className={SPLIT}>
        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Card className="space-y-2">
              <h3 className="font-display text-lg text-text">
                Stage <span className="text-sm text-mute">({v.seats.length}/{seatCount})</span>
              </h3>
              <ol className="space-y-1 text-sm">
                {Array.from({ length: seatCount }).map((_, i) => {
                  const seat = v.seats.find((s) => s.seatIndex === i);
                  const here = seat?.occupantUserId === userId;
                  const spinning = v.roomState?.currentDjUserId === seat?.occupantUserId;
                  return (
                    <li key={i} className={cn(seat ? "text-soft" : "text-mute")}>
                      {seat ? (here ? "you" : seat.occupantUserId.slice(0, 8)) : "(empty)"}
                      {spinning ? " 🎧" : ""}
                    </li>
                  );
                })}
              </ol>
              {onStage ? (
                <Button variant="ghost" onClick={v.actions.leaveSeat}>
                  Leave stage
                </Button>
              ) : canDj ? (
                <Button onClick={v.actions.takeSeat}>Take a seat</Button>
              ) : (
                <p className="text-sm text-mute">Set a name to take the decks.</p>
              )}
            </Card>

            <Card className="space-y-2">
              <h3 className="font-display text-lg text-text">Now playing</h3>
              <p className="text-sm text-soft">
                {v.roomState?.currentMediaId
                  ? `${v.roomState.currentMediaId}${currentDjIsMe ? " (yours)" : ""}`
                  : "Nothing yet."}
              </p>
              <p className="text-sm">
                <span className="text-signal">👍 {v.tally?.awesome ?? 0}</span>
                <span className="px-2 text-alert">👎 {v.tally?.lame ?? 0}</span>
                <span className="text-mute">net {v.tally?.net ?? 0}</span>
              </p>
              <div className="flex flex-wrap gap-2">
                <Button variant="ghost" size="sm" onClick={() => v.actions.vote("awesome")}>
                  Awesome
                </Button>
                <Button variant="ghost" size="sm" onClick={() => v.actions.vote("lame")}>
                  Lame
                </Button>
                <Button variant="quiet" size="sm" onClick={() => v.actions.advance()}>
                  Next ⤼
                </Button>
              </div>
            </Card>
          </div>

          <Card className="space-y-2">
            <h3 className="font-display text-lg text-text">Your queue</h3>
            <div className="flex gap-2">
              <Input
                className="flex-1"
                value={mediaId}
                onChange={(e) => setMediaId(e.target.value)}
                placeholder="YouTube video id"
                aria-label="Queue a track"
              />
              <Button onClick={() => v.actions.enqueue(mediaId)} disabled={!canDj}>
                Queue
              </Button>
            </div>
            <ul className="space-y-1 text-sm">
              {v.myQueue.map((q) => (
                <li key={q.id} className="flex items-center gap-2">
                  <span className="min-w-0 truncate text-soft">{q.mediaId}</span>
                  <Button
                    variant="quiet"
                    size="sm"
                    className="ml-auto"
                    onClick={() => v.actions.removeQueue(q.id)}
                  >
                    remove
                  </Button>
                </li>
              ))}
              {v.myQueue.length === 0 && <li className="text-mute">Empty.</li>}
            </ul>
          </Card>
        </div>

        <ChatRail v={v} />
      </div>
    </>
  );
}
