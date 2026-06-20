"use client";

import { useParams, useRouter } from "next/navigation";
import { useAuth } from "@/components/auth/useAuth";
import { useProfile } from "@/components/profile/useProfile";
import { SpatialRoom } from "@/components/spatial/SpatialRoom";
import { AppShell } from "@/components/shell/AppShell";
import { Button, Card } from "@/components/ui";

/**
 * Rung-1 spatial surface (Section 12): walk around a shared 2D room and talk to
 * people near you. Mirrors /dev/room: ensure a session, load the profile, then
 * render the board. Guests can walk and talk under a default name.
 */
export default function SpaceRoute() {
  const params = useParams<{ venueId: string }>();
  const router = useRouter();
  const { userId, ready } = useAuth();
  const { profile, loaded } = useProfile(ready);

  return (
    <AppShell>
      <div className="space-y-6">
        <div className="flex items-center justify-between gap-4">
          <h1 className="font-display text-2xl text-text">Walk the room</h1>
          <Button variant="ghost" size="sm" onClick={() => router.push("/dev/lobby")}>
            Back to lobby
          </Button>
        </div>

        {!ready || !loaded ? (
          <p className="text-sm text-mute">Starting a session.</p>
        ) : !userId ? (
          <Card as="section" className="space-y-1">
            <h2 className="font-display text-lg text-text">Could not start a session</h2>
            <p className="text-sm text-mute">
              Enable Anonymous sign-ins in the Supabase project Auth settings, then
              reload.
            </p>
          </Card>
        ) : (
          <SpaceBody userId={userId} profile={profile} venueId={params.venueId} />
        )}
      </div>
    </AppShell>
  );
}

type ProfileShape = {
  displayName: string;
  avatarConfig: Record<string, unknown>;
} | null;

function SpaceBody({
  userId,
  profile,
  venueId,
}: {
  userId: string;
  profile: ProfileShape;
  venueId: string;
}) {
  const name = profile?.displayName ?? `Guest ${userId.slice(0, 4)}`;

  return (
    <div className="space-y-4">
      {!profile && (
        <Card padding="sm" className="text-sm text-soft">
          You are walking around as <b className="text-text">{name}</b>. Set a name and
          avatar in a room to bring your own look here.
        </Card>
      )}
      <SpatialRoom
        venueId={venueId}
        userId={userId}
        name={name}
        avatar={profile?.avatarConfig ?? null}
      />
    </div>
  );
}
