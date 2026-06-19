"use client";

import { useState } from "react";
import { useAuth } from "@/components/auth/useAuth";
import { useProfile } from "@/components/profile/useProfile";
import { Room } from "./Room";

/**
 * Wraps a Room with standalone identity: ensures a session, loads/edits the
 * profile, and renders the lurker -> DJ on-ramp. Used by the lobby's room route
 * and the single-venue dev surface.
 */
export function RoomShell({
  venueId,
  onLeaveVenue,
}: {
  venueId: string;
  onLeaveVenue?: () => void;
}) {
  const { userId, ready } = useAuth();
  const { profile, loaded, save } = useProfile(ready);

  if (!ready || !loaded) return <p>Starting a session…</p>;
  if (!userId) {
    return (
      <div>
        <h1>Couldn’t start a session</h1>
        <p style={{ color: "#555" }}>
          Enable “Anonymous sign-ins” in the Supabase project’s Auth settings, then reload.
        </p>
      </div>
    );
  }

  const displayName = profile?.displayName ?? `Guest ${userId.slice(0, 4)}`;

  return (
    <>
      <ProfileBar profile={profile} onSave={save} displayName={displayName} />
      <Room
        venueId={venueId}
        userId={userId}
        name={displayName}
        canDj={!!profile}
        onLeaveVenue={onLeaveVenue}
      />
    </>
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
      <small style={{ color: "#555" }}>
        You are <b>{profile.displayName}</b> · <button onClick={() => setEditing(true)}>edit</button>
      </small>
    </header>
  );
}

const card: React.CSSProperties = {
  border: "1px solid #e4e4e7",
  borderRadius: 8,
  padding: "1rem",
  marginBottom: "1rem",
};
