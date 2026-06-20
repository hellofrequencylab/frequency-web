"use client";

import { useState } from "react";
import { useAuth } from "@/components/auth/useAuth";
import { useProfile } from "@/components/profile/useProfile";
import { Room } from "./Room";
import { AVATAR_EMOJIS as EMOJIS, AVATAR_COLORS as COLORS, avatarOf } from "./AvatarChip";
import { Avatar, Button, Card, Field, Input, cn } from "@/components/ui";

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

  if (!ready || !loaded) return <p className="text-mute">Starting a session…</p>;
  if (!userId) {
    return (
      <Card className="space-y-1 border-alert">
        <h1 className="font-display text-lg text-text">Couldn&apos;t start a session</h1>
        <p className="text-sm text-soft">
          Enable Anonymous sign-ins in the Supabase project&apos;s Auth settings, then reload.
        </p>
      </Card>
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
      <Card className="mb-4 space-y-3">
        <div>
          <h3 className="font-display text-lg text-text">
            {profile ? "Edit your look" : "Pick a name to take the decks"}
          </h3>
          <p className="text-sm text-mute">
            You&apos;re in as <b className="text-soft">{displayName}</b>. Lurkers chat and vote.
            DJing needs a name.
          </p>
        </div>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (name.trim()) {
              void onSave(name.trim(), { emoji, color });
              setEditing(false);
            }
          }}
          className="space-y-3"
        >
          <Field label="Display name">
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Vera" />
          </Field>
          <div className="flex flex-wrap items-center gap-2">
            <Avatar name={name || displayName} emoji={emoji} color={color} size="md" />
            <span className="text-mute">·</span>
            {EMOJIS.map((e) => (
              <button
                key={e}
                type="button"
                onClick={() => setEmoji(e)}
                aria-label={`Emoji ${e}`}
                aria-pressed={e === emoji}
                className={cn(
                  "rounded-sm px-1 text-lg transition-opacity",
                  e === emoji ? "opacity-100" : "opacity-50 hover:opacity-100",
                )}
              >
                {e}
              </button>
            ))}
          </div>
          <div className="flex flex-wrap gap-2">
            {COLORS.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setColor(c)}
                aria-label={`Color ${c}`}
                aria-pressed={c === color}
                className={cn("h-6 w-6 rounded-pill border-2", c === color ? "border-text" : "border-line")}
                style={{ background: c }}
              />
            ))}
          </div>
          <Button type="submit">Save</Button>
        </form>
      </Card>
    );
  }

  const cfg = avatarOf(profile.avatarConfig);
  return (
    <div className="mb-4 flex items-center gap-2">
      <Avatar name={profile.displayName} emoji={cfg.emoji} color={cfg.color} size="sm" />
      <span className="text-sm text-soft">{profile.displayName}</span>
      <Button variant="quiet" size="sm" onClick={() => setEditing(true)}>
        Edit
      </Button>
    </div>
  );
}
