"use client";

import { useState } from "react";
import { useVenue } from "@/components/dj/useVenue";
import { SyncedPlayer } from "@/components/sync/SyncedPlayer";

/**
 * The DJ room UI, shared by the standalone dev surface (`/dev/dj`) and the
 * embeddable surface (`/embed/[venueId]`). Identity + profile are resolved by
 * the host page; this component only renders the room and dispatches actions.
 */
export function Room({
  venueId,
  userId,
  name,
  canDj,
  onLeaveVenue,
  onGameEvent,
}: {
  venueId: string;
  userId: string;
  name: string;
  canDj: boolean;
  onLeaveVenue?: () => void;
  onGameEvent?: (e: { type: string; payload: unknown }) => void;
}) {
  const { venue, seats, roomState, myQueue, tally, standing, chat, present, actions } =
    useVenue(venueId, userId, name, onGameEvent);
  const [mediaId, setMediaId] = useState("dQw4w9WgXcQ");
  const [chatText, setChatText] = useState("");

  const onStage = seats.some((s) => s.occupantUserId === userId);
  const currentDjIsMe = roomState?.currentDjUserId === userId;

  return (
    <>
      <p style={{ color: "#888", fontSize: 12, wordBreak: "break-all" }}>
        {venue?.name} · here: {present.join(", ") || "…"}
        {onLeaveVenue ? (
          <>
            {" "}
            · <button onClick={onLeaveVenue}>switch venue</button>
          </>
        ) : null}
      </p>
      <p style={{ fontSize: 13 }}>
        ⚡ <b>{standing?.balance ?? 0}</b> Zaps · rank <b>{standing?.rank ?? "Crew"}</b>{" "}
        <small style={{ color: "#888" }}>({standing?.djPoints ?? 0} DJ pts this season)</small>
      </p>

      <SyncedPlayer state={roomState} onEnded={actions.advance} />

      <section style={{ display: "flex", gap: "1rem", margin: "1rem 0", flexWrap: "wrap" }}>
        <div style={card}>
          <h3>Stage ({seats.length}/{venue?.seatCount ?? 5})</h3>
          <ol>
            {Array.from({ length: venue?.seatCount ?? 5 }).map((_, i) => {
              const seat = seats.find((s) => s.seatIndex === i);
              const here = seat?.occupantUserId === userId;
              const spinning = roomState?.currentDjUserId === seat?.occupantUserId;
              return (
                <li key={i}>
                  {seat ? (here ? "you" : seat.occupantUserId.slice(0, 8)) : "(empty)"}
                  {spinning ? " 🎧" : ""}
                </li>
              );
            })}
          </ol>
          {onStage ? (
            <button onClick={actions.leaveSeat}>Leave stage</button>
          ) : canDj ? (
            <button onClick={actions.takeSeat}>Take a seat</button>
          ) : (
            <small style={{ color: "#888" }}>Set a name to take the decks.</small>
          )}
        </div>

        <div style={card}>
          <h3>Now playing</h3>
          <p style={{ fontSize: 13 }}>
            {roomState?.currentMediaId
              ? `${roomState.currentMediaId}${currentDjIsMe ? " (yours)" : ""}`
              : "nothing yet"}
          </p>
          <p>
            👍 {tally?.awesome ?? 0} &nbsp; 👎 {tally?.lame ?? 0} &nbsp;
            <small style={{ color: "#888" }}>net {tally?.net ?? 0}</small>
          </p>
          <button onClick={() => actions.vote("awesome")}>Awesome</button>{" "}
          <button onClick={() => actions.vote("lame")}>Lame</button>{" "}
          <button onClick={() => actions.advance()}>Next ⤼</button>
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
          <button onClick={() => actions.enqueue(mediaId)} disabled={!canDj}>
            Queue
          </button>
        </div>
        <ul>
          {myQueue.map((q) => (
            <li key={q.id}>
              {q.mediaId} <button onClick={() => actions.removeQueue(q.id)}>remove</button>
            </li>
          ))}
          {myQueue.length === 0 && <li style={{ color: "#888" }}>empty</li>}
        </ul>
      </section>

      <section style={card}>
        <h3>Chat</h3>
        <div style={{ maxHeight: 160, overflow: "auto", fontSize: 13, marginBottom: "0.5rem" }}>
          {chat.map((c, i) => (
            <div key={i}>
              <b>{c.name}:</b> {c.text}
            </div>
          ))}
        </div>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (chatText.trim()) {
              actions.sendChat(chatText.trim());
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
