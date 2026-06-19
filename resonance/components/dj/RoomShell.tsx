"use client";

import { useState } from "react";
import { useAuth } from "@/components/auth/useAuth";
import { useProfile } from "@/components/profile/useProfile";
import { Room } from "./Room";
import { AvatarChip, AVATAR_EMOJIS as EMOJIS, AVATAR_COLORS as COLORS, avatarOf } from "./AvatarChip";

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
        avatar={profile?.avatarConfig ?? null}
        canDj={!!profile}
        onLeaveVenue={onLeaveVenue}
      />
    </>
  );
}

type ProfileShape = { displayName: string; avatarConfig: Record<string, unknown> };

function ProfileBar({
  profile,
  displayName,
  onSave,
}: {
  profile: ProfileShape | null;
  displayName: string;
  onSave: (name: string, avatarConfig?: Record<string, unknown>) => void | Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(displayName);
  const initial = avatarOf(profile?.avatarConfig);
  const [emoji, setEmoji] = useState(initial.emoji);
  const [color, setColor] = useState(initial.color);

  if (editing || !profile) {
    return (
      <section style={card}>
        <h3>{profile ? "Edit your look" : "Pick a name to take the decks"}</h3>
        <p style={{ color: "#888", fontSize: 13 }}>
          You’re in as <b>{displayName}</b>. Lurkers can chat and vote; DJing needs a name.
        </p>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (name.trim()) {
              void onSave(name.trim(), { emoji, color });
              setEditing(false);
            }
          }}
          style={{ display: "grid", gap: "0.6rem" }}
        >
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="display name"
            style={{ padding: "0.4rem" }}
          />
          <div style={{ display: "flex", gap: "0.35rem", flexWrap: "wrap", alignItems: "center" }}>
            <AvatarChip emoji={emoji} color={color} name={name || displayName} />
            <span style={{ color: "#888", fontSize: 12 }}>·</span>
            {EMOJIS.map((e) => (
              <button
                key={e}
                type="button"
                onClick={() => setEmoji(e)}
                style={{ fontSize: 18, opacity: e === emoji ? 1 : 0.5 }}
              >
                {e}
              </button>
            ))}
          </div>
          <div style={{ display: "flex", gap: "0.35rem", flexWrap: "wrap" }}>
            {COLORS.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setColor(c)}
                aria-label={`color ${c}`}
                style={{
                  width: 22,
                  height: 22,
                  borderRadius: "50%",
                  background: c,
                  border: c === color ? "2px solid #111" : "1px solid #ccc",
                }}
              />
            ))}
          </div>
          <button type="submit" style={{ justifySelf: "start" }}>
            Save
          </button>
        </form>
      </section>
    );
  }

  const cfg = avatarOf(profile.avatarConfig);
  return (
    <header style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
      <small style={{ color: "#555", display: "flex", alignItems: "center", gap: "0.4rem" }}>
        <AvatarChip emoji={cfg.emoji} color={cfg.color} name={profile.displayName} />
        <button onClick={() => setEditing(true)}>edit</button>
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
