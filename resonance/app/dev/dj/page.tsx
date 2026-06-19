"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/components/auth/useAuth";
import { useProfile } from "@/components/profile/useProfile";
import { useVenue } from "@/components/dj/useVenue";
import { SyncedPlayer } from "@/components/sync/SyncedPlayer";
import { authedFetch } from "@/lib/api/fetch";

const VENUE_KEY = "resonance.demo.venueId";

/**
 * DJ-loop + identity proof (build plan §2 + §3). Each window gets a real
 * anonymous session. Lurk (present, chat, vote) as a guest; set a display name
 * to take the decks. Open the same venue in 2-3 windows to see rotation + votes.
 */
export default function DjDemoPage() {
  const { userId, ready } = useAuth();
  const { profile, loaded, save } = useProfile(ready);
  const [venueId, setVenueId] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    void (async () => {
      await Promise.resolve();
      if (active) setVenueId(localStorage.getItem(VENUE_KEY));
    })();
    return () => {
      active = false;
    };
  }, []);

  const createVenue = async () => {
    const res = await authedFetch("/api/venues", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Open Decks" }),
    });
    const { venue } = await res.json();
    localStorage.setItem(VENUE_KEY, venue.id);
    setVenueId(venue.id);
  };

  if (!ready || !loaded) return <main style={page}>Starting a session…</main>;
  if (!userId) {
    return (
      <main style={page}>
        <h1>Couldn’t start a session</h1>
        <p style={{ color: "#555" }}>
          Enable “Anonymous sign-ins” in the Supabase project’s Auth settings, then reload.
        </p>
      </main>
    );
  }

  const displayName = profile?.displayName ?? `Guest ${userId.slice(0, 4)}`;

  return (
    <main style={page}>
      <ProfileBar profile={profile} onSave={save} displayName={displayName} />
      {!venueId ? (
        <section style={card}>
          <p style={{ color: "#555" }}>Create a venue, then open this page in a few windows.</p>
          <button onClick={createVenue}>Create a venue</button>
        </section>
      ) : (
        <Room
          venueId={venueId}
          userId={userId}
          name={displayName}
          canDj={!!profile}
          onLeaveVenue={() => {
            localStorage.removeItem(VENUE_KEY);
            setVenueId(null);
          }}
        />
      )}
    </main>
  );
}

function ProfileBar({
  profile,
  displayName,
  onSave,
}: {
  profile: { displayName: string } | null;
  displayName: string;
  onSave: (name: string) => void | Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(displayName);

  if (editing || !profile) {
    return (
      <section style={card}>
        <h3>{profile ? "Edit your name" : "Pick a name to take the decks"}</h3>
        <p style={{ color: "#888", fontSize: 13 }}>
          You’re in as <b>{displayName}</b>. Lurkers can chat and vote; DJing needs a name.
        </p>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (name.trim()) {
              void onSave(name.trim());
              setEditing(false);
            }
          }}
          style={{ display: "flex", gap: "0.5rem" }}
        >
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="display name"
            style={{ flex: 1, padding: "0.4rem" }}
          />
          <button type="submit">Save</button>
        </form>
      </section>
    );
  }

  return (
    <header style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
      <h1 style={{ margin: 0 }}>DJ room</h1>
      <small style={{ color: "#555" }}>
        You are <b>{profile.displayName}</b> · <button onClick={() => setEditing(true)}>edit</button>
      </small>
    </header>
  );
}

function Room({
  venueId,
  userId,
  name,
  canDj,
  onLeaveVenue,
}: {
  venueId: string;
  userId: string;
  name: string;
  canDj: boolean;
  onLeaveVenue: () => void;
}) {
  const { venue, seats, roomState, myQueue, tally, standing, chat, present, actions } = useVenue(
    venueId,
    userId,
    name,
  );
  const [mediaId, setMediaId] = useState("dQw4w9WgXcQ");
  const [chatText, setChatText] = useState("");

  const onStage = seats.some((s) => s.occupantUserId === userId);
  const currentDjIsMe = roomState?.currentDjUserId === userId;

  return (
    <>
      <p style={{ color: "#888", fontSize: 12, wordBreak: "break-all" }}>
        {venue?.name} · here: {present.join(", ") || "…"} ·{" "}
        <button onClick={onLeaveVenue}>switch venue</button>
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
            <small style={{ color: "#888" }}>Set a name above to take the decks.</small>
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
  marginBottom: "1rem",
};
