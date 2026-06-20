"use client";

import { useParams, useRouter } from "next/navigation";
import { useAuth } from "@/components/auth/useAuth";
import { useProfile } from "@/components/profile/useProfile";
import { TriviaRoom } from "@/components/games/TriviaRoom";
import { AppShell } from "@/components/shell/AppShell";
import { Button, Card } from "@/components/ui";

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
    <AppShell>
      <div className="mx-auto max-w-2xl space-y-6">
        <Button variant="quiet" size="sm" onClick={() => router.push("/dev/lobby")}>
          Back to lobby
        </Button>

        {!ready || !loaded ? (
          <Card padding="lg">
            <p className="text-sm text-mute">Starting a session.</p>
          </Card>
        ) : !userId ? (
          <Card padding="lg" className="space-y-2 border-alert/40">
            <h1 className="font-display text-xl text-text">Could not start a session</h1>
            <p className="text-sm text-mute">
              Enable Anonymous sign-ins in the Supabase project Auth settings, then reload.
            </p>
          </Card>
        ) : (
          <TriviaRoom
            venueId={params.venueId}
            userId={userId}
            displayName={profile?.displayName ?? `Guest ${userId.slice(0, 4)}`}
          />
        )}
      </div>
    </AppShell>
  );
}
