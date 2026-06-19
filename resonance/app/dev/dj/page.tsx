"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/components/auth/useAuth";
import { useProfile } from "@/components/profile/useProfile";
import { Room } from "@/components/dj/Room";
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
