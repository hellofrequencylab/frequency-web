"use client";

import { useState } from "react";
import { useVenue } from "@/components/dj/useVenue";
import { SyncedPlayer } from "@/components/sync/SyncedPlayer";
import { computePosition } from "@/lib/sync/clock";

type RoomProps = {
  venueId: string;
  userId: string;
  name: string;
  canDj: boolean;
  onLeaveVenue?: () => void;
  onGameEvent?: (e: { type: string; payload: unknown }) => void;
};

type Venue = ReturnType<typeof useVenue>;

/**
 * Renders a venue by its media type: the DJ Room (rotating decks) or the Watch
 * Party (single host controls one shared video). Both share one channel, chat,
 * and presence (one `useVenue`).
 */
export function Room(props: RoomProps) {
  const v = useVenue(props.venueId, props.userId, props.name, props.onGameEvent);
  if (v.venue?.mediaType === "watch") return <WatchLayout v={v} {...props} />;
  return <DjLayout v={v} {...props} />;
}

function Header({ v, onLeaveVenue }: { v: Venue; onLeaveVenue?: () => void }) {
  return (
    <p style={{ color: "#888", fontSize: 12, wordBreak: "break-all" }}>
      {v.venue?.name} · here: {v.present.join(", ") || "…"}
      {onLeaveVenue ? (
        <>
          {" "}
          · <button onClick={onLeaveVenue}>switch venue</button>
        </>
      ) : null}
    </p>
  );
}

function ChatBox({ v }: { v: Venue }) {
  const [chatText, setChatText] = useState("");
  return (
    <section style={card}>
      <h3>Chat</h3>
      <div style={{ display: "flex", gap: "0.35rem", marginBottom: "0.5rem" }}>
        {["🔥", "😂", "❤️", "🙌", "👀"].map((e) => (
          <button key={e} onClick={() => v.actions.sendChat(e)}>
            {e}
          </button>
        ))}
      </div>
      <div style={{ maxHeight: 160, overflow: "auto", fontSize: 13, marginBottom: "0.5rem" }}>
        {v.chat.map((c, i) => (
          <div key={i}>
            <b>{c.name}:</b> {c.text}
          </div>
        ))}
      </div>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (chatText.trim()) {
            v.actions.sendChat(chatText.trim());
            setChatText("");
          }
        }}
        style={{ display: "flex", gap: "0.5rem" }}
      >
        <input
          value={chatText}
          onChange={(e) => setChatText(e.target.value)}
          placeholder="say something"
          style={{ flex: 1, padding: "0.4rem" }}
        />
        <button type="submit">Send</button>
      </form>
    </section>
  );
}

function WatchLayout({ v, userId, canDj, onLeaveVenue }: { v: Venue } & RoomProps) {
  const [mediaId, setMediaId] = useState("dQw4w9WgXcQ");
  const host = [...v.seats].sort((a, b) => a.seatIndex - b.seatIndex)[0] ?? null;
  const isHost = host?.occupantUserId === userId;
  const posNow = () => (v.roomState ? computePosition(v.roomState, Date.now()) : 0);

  return (
    <>
      <Header v={v} onLeaveVenue={onLeaveVenue} />
      <SyncedPlayer state={v.roomState} />

      <section style={card}>
        {isHost ? (
          <>
            <h3>You’re hosting</h3>
            <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap", marginBottom: "0.5rem" }}>
              <input
                value={mediaId}
                onChange={(e) => setMediaId(e.target.value)}
                placeholder="YouTube video id"
                style={{ flex: 1, minWidth: "12rem", padding: "0.4rem" }}
              />
              <button onClick={() => v.actions.loadVideo(mediaId)}>Load</button>
              <button onClick={() => v.actions.play()}>Play</button>
              <button onClick={() => v.actions.pause()}>Pause</button>
              <button onClick={() => v.actions.seek(Math.max(0, posNow() + 10))}>+10s</button>
              <button onClick={() => v.actions.seek(Math.max(0, posNow() - 10))}>-10s</button>
            </div>
            <button onClick={v.actions.leaveSeat}>Leave host</button>
          </>
        ) : host ? (
          <p>
            Following <b>{host.occupantUserId.slice(0, 8)}</b>. Sit back and watch.
          </p>
        ) : canDj ? (
          <>
            <p style={{ color: "#555" }}>No host yet.</p>
            <button onClick={v.actions.takeSeat}>Take host</button>
          </>
        ) : (
          <small style={{ color: "#888" }}>Set a name to host.</small>
        )}
      </section>

      <ChatBox v={v} />
    </>
  );
}

function DjLayout({ v, userId, canDj, onLeaveVenue }: { v: Venue } & RoomProps) {
  const [mediaId, setMediaId] = useState("dQw4w9WgXcQ");
  const onStage = v.seats.some((s) => s.occupantUserId === userId);
  const currentDjIsMe = v.roomState?.currentDjUserId === userId;

  return (
    <>
      <Header v={v} onLeaveVenue={onLeaveVenue} />
      <p style={{ fontSize: 13 }}>
        ⚡ <b>{v.standing?.balance ?? 0}</b> Zaps · rank <b>{v.standing?.rank ?? "Crew"}</b>{" "}
        <small style={{ color: "#888" }}>({v.standing?.djPoints ?? 0} DJ pts this season)</small>
      </p>

      <SyncedPlayer state={v.roomState} onEnded={v.actions.advance} />

      <section style={{ display: "flex", gap: "1rem", margin: "1rem 0", flexWrap: "wrap" }}>
        <div style={card}>
          <h3>Stage ({v.seats.length}/{v.venue?.seatCount ?? 5})</h3>
          <ol>
            {Array.from({ length: v.venue?.seatCount ?? 5 }).map((_, i) => {
              const seat = v.seats.find((s) => s.seatIndex === i);
              const here = seat?.occupantUserId === userId;
              const spinning = v.roomState?.currentDjUserId === seat?.occupantUserId;
              return (
                <li key={i}>
                  {seat ? (here ? "you" : seat.occupantUserId.slice(0, 8)) : "(empty)"}
                  {spinning ? " 🎧" : ""}
                </li>
              );
            })}
          </ol>
          {onStage ? (
            <button onClick={v.actions.leaveSeat}>Leave stage</button>
          ) : canDj ? (
            <button onClick={v.actions.takeSeat}>Take a seat</button>
          ) : (
            <small style={{ color: "#888" }}>Set a name to take the decks.</small>
          )}
        </div>

        <div style={card}>
          <h3>Now playing</h3>
          <p style={{ fontSize: 13 }}>
            {v.roomState?.currentMediaId
              ? `${v.roomState.currentMediaId}${currentDjIsMe ? " (yours)" : ""}`
              : "nothing yet"}
          </p>
          <p>
            👍 {v.tally?.awesome ?? 0} &nbsp; 👎 {v.tally?.lame ?? 0} &nbsp;
            <small style={{ color: "#888" }}>net {v.tally?.net ?? 0}</small>
          </p>
          <button onClick={() => v.actions.vote("awesome")}>Awesome</button>{" "}
          <button onClick={() => v.actions.vote("lame")}>Lame</button>{" "}
          <button onClick={() => v.actions.advance()}>Next ⤼</button>
        </div>
      </section>

      <section style={card}>
        <h3>Your queue</h3>
        <div style={{ display: "flex", gap: "0.5rem", marginBottom: "0.5rem" }}>
          <input
            value={mediaId}
            onChange={(e) => setMediaId(e.target.value)}
            placeholder="YouTube video id"
            style={{ flex: 1, padding: "0.4rem" }}
          />
          <button onClick={() => v.actions.enqueue(mediaId)} disabled={!canDj}>
            Queue
          </button>
        </div>
        <ul>
          {v.myQueue.map((q) => (
            <li key={q.id}>
              {q.mediaId} <button onClick={() => v.actions.removeQueue(q.id)}>remove</button>
            </li>
          ))}
          {v.myQueue.length === 0 && <li style={{ color: "#888" }}>empty</li>}
        </ul>
      </section>

      <ChatBox v={v} />
    </>
  );
}

const card: React.CSSProperties = {
  flex: 1,
  minWidth: "16rem",
  border: "1px solid #e4e4e7",
  borderRadius: 8,
  padding: "1rem",
  marginBottom: "1rem",
};
