"use client";

import { useParams, useRouter } from "next/navigation";
import { useAuth } from "@/components/auth/useAuth";
import { useProfile } from "@/components/profile/useProfile";
import { TriviaRoom } from "@/components/games/TriviaRoom";

/**
 * Crowd Trivia dev surface (§16). Same identity on-ramp as the DJ Room: ensure a
 * session, load the profile, and let a guest play under a default name. Runs on
 * its own page so the room loop is untouched.
 */
export default function GamesRoute() {
  const params = useParams<{ venueId: string }>();
  const router = useRouter();
  const { userId, ready } = useAuth();
  const { profile, loaded } = useProfile(ready);

  return (
    <main style={{ maxWidth: "48rem", margin: "0 auto", padding: "2rem", fontFamily: "system-ui" }}>
      <p>
        <button onClick={() => router.push("/dev/lobby")}>← lobby</button>
      </p>

      {!ready || !loaded ? (
        <p>Starting a session…</p>
      ) : !userId ? (
        <div>
          <h1>Couldn’t start a session</h1>
          <p style={{ color: "#555" }}>
            Enable “Anonymous sign-ins” in the Supabase project’s Auth settings, then reload.
          </p>
        </div>
      ) : (
        <TriviaRoom
          venueId={params.venueId}
          userId={userId}
          displayName={profile?.displayName ?? `Guest ${userId.slice(0, 4)}`}
        />
      )}
    </main>
  );
}
