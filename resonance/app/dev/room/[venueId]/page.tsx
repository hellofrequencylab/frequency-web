"use client";

import { useParams, useRouter } from "next/navigation";
import { RoomShell } from "@/components/dj/RoomShell";
import { AppShell } from "@/components/shell/AppShell";
import { Button } from "@/components/ui";

/** Enter a specific venue from the lobby (build plan §6). */
export default function RoomRoute() {
  const params = useParams<{ venueId: string }>();
  const router = useRouter();
  return (
    <AppShell>
      <div className="mb-2">
        <Button variant="quiet" size="sm" onClick={() => router.push("/dev/lobby")}>
          ← Lobby
        </Button>
      </div>
      <RoomShell venueId={params.venueId} />
    </AppShell>
  );
}
