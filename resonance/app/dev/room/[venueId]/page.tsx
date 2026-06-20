"use client";

import { useParams, useRouter } from "next/navigation";
import { RoomShell } from "@/components/dj/RoomShell";

/** Enter a specific venue from the lobby (build plan §6). */
export default function RoomRoute() {
  const params = useParams<{ venueId: string }>();
  const router = useRouter();
  return (
    <main style={{ maxWidth: "48rem", margin: "0 auto", padding: "2rem", fontFamily: "system-ui" }}>
      <p>
        <button onClick={() => router.push("/dev/lobby")}>← lobby</button>
      </p>
      <RoomShell venueId={params.venueId} />
    </main>
  );
}
