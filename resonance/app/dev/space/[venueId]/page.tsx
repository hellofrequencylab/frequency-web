"use client";

import { useParams, useRouter } from "next/navigation";
import { useAuth } from "@/components/auth/useAuth";
import { useProfile } from "@/components/profile/useProfile";
import { SpatialRoom } from "@/components/spatial/SpatialRoom";

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
    <main
      style={{
        maxWidth: "52rem",
        margin: "0 auto",
        padding: "2rem",
        fontFamily: "system-ui",
      }}
    >
      <p>
        <button onClick={() => router.push("/dev/lobby")}>← lobby</button>
      </p>

      {!ready || !loaded ? (
        <p>Starting a session…</p>
      ) : !userId ? (
        <div>
          <h1>Couldn’t start a session</h1>
          <p style={{ color: "#555" }}>
            Enable “Anonymous sign-ins” in the Supabase project’s Auth settings,
            then reload.
          </p>
        </div>
      ) : (
        <SpaceBody userId={userId} profile={profile} venueId={params.venueId} />
      )}
    </main>
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
    <>
      {!profile && (
        <p
          style={{
            border: "1px solid #e4e4e7",
            borderRadius: 8,
            padding: "0.75rem 1rem",
            marginBottom: "1rem",
            color: "#52525b",
            fontSize: 13,
          }}
        >
          You’re walking around as <b>{name}</b>. Set a name and avatar in a room
          to bring your own look here.
        </p>
      )}
      <SpatialRoom
        venueId={venueId}
        userId={userId}
        name={name}
        avatar={profile?.avatarConfig ?? null}
      />
    </>
  );
}
