"use client";

import { useEffect, useState } from "react";
import { getDemoIdentity } from "@/lib/identity/demo-identity";
import { useVenue } from "@/components/dj/useVenue";
import { SyncedPlayer } from "@/components/sync/SyncedPlayer";

const VENUE_KEY = "resonance.demo.venueId";

/**
 * DJ-loop proof (build plan §2). Create a venue, then open the same venue in 2-3
 * windows: take seats, queue YouTube ids, and the room rotates DJs and tallies
 * Awesome/Lame votes. No auth yet — each window is a temporary demo identity.
 */
export default function DjDemoPage() {
  const [identity, setIdentity] = useState<{ userId: string; name: string } | null>(null);
  const [venueId, setVenueId] = useState<string | null>(null);

  // Browser-only reads, deferred past an await so setState isn't a synchronous
  // cascade during the mount effect.
  useEffect(() => {
    let active = true;
    void (async () => {
      await Promise.resolve();
      if (!active) return;
      setIdentity(getDemoIdentity());
      setVenueId(localStorage.getItem(VENUE_KEY));
    })();
    return () => {
      active = false;
    };
  }, []);

  const createVenue = async () => {
    const res = await fetch("/api/venues", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Open Decks" }),
    });
    const { venue } = await res.json();
    localStorage.setItem(VENUE_KEY, venue.id);
    setVenueId(venue.id);
  };

  if (!identity) return <main style={page}>Loading…</main>;

  if (!venueId) {
    return (
      <main style={page}>
        <h1>DJ room</h1>
        <p style={{ color: "#555" }}>Create a venue, then open this page in a few windows.</p>
        <button onClick={createVenue}>Create a venue</button>
      </main>
    );
  }

  return (
    <Room
      venueId={venueId}
      userId={identity.userId}
      name={identity.name}
      onLeaveVenue={() => {
        localStorage.removeItem(VENUE_KEY);
        setVenueId(null);
      }}
    />
  );
}

function Room({
  venueId,
  userId,
  name,
  onLeaveVenue,
}: {
  venueId: string;
  userId: string;
  name: string;
  onLeaveVenue: () => void;
}) {
  const { venue, seats, roomState, myQueue, tally, chat, present, actions } = useVenue(
    venueId,
    userId,
    name,
  );
  const [mediaId, setMediaId] = useState("dQw4w9WgXcQ");
  const [chatText, setChatText] = useState("");

  const onStage = seats.some((s) => s.occupantUserId === userId);
  const currentDjIsMe = roomState?.currentDjUserId === userId;

  return (
    <main style={page}>
      <header style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
        <h1 style={{ margin: 0 }}>{venue?.name ?? "Room"}</h1>
        <small style={{ color: "#555" }}>
          You are <b>{name}</b> · here: {present.join(", ") || "…"}
        </small>
      </header>
      <p style={{ color: "#888", fontSize: 12, wordBreak: "break-all" }}>
        Venue {venueId} · <button onClick={onLeaveVenue}>switch venue</button>
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
          ) : (
            <button onClick={actions.takeSeat}>Take a seat</button>
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
          <button onClick={() => actions.enqueue(mediaId)}>Queue</button>
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
    </main>
  );
}

const page: React.CSSProperties = {
  maxWidth: "48rem",
  margin: "0 auto",
  padding: "2rem",
  fontFamily: "system-ui",
};
const card: React.CSSProperties = {
  flex: 1,
  minWidth: "16rem",
  border: "1px solid #e4e4e7",
  borderRadius: 8,
  padding: "1rem",
};
