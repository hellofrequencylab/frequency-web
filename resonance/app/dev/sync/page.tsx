"use client";

import { useEffect, useState } from "react";
import { useRoomSync } from "@/components/sync/useRoomSync";
import { SyncedPlayer } from "@/components/sync/SyncedPlayer";
import { computePosition } from "@/lib/sync/clock";

/** A fixed venue for the demo. Any uuid works; the row is created on first action. */
const DEMO_VENUE_ID = "00000000-0000-0000-0000-000000000001";

/**
 * Sync-engine proof. Open this page in 2-3 browser tabs/windows, load a video in
 * one, and play/pause/seek. The others follow within a heartbeat. No DJ UI yet:
 * this exists only to prove the server-authoritative clock (build plan §1).
 */
export default function SyncDemoPage() {
  const { state, dispatch } = useRoomSync(DEMO_VENUE_ID);
  const [videoId, setVideoId] = useState("dQw4w9WgXcQ");

  // Tick so the displayed position advances; render stays pure (no Date.now()).
  const [now, setNow] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(id);
  }, []);

  const seconds = state ? computePosition(state, now) : 0;

  return (
    <main style={{ maxWidth: "48rem", margin: "0 auto", padding: "2rem", fontFamily: "system-ui" }}>
      <h1>Sync engine demo</h1>
      <p style={{ color: "#555" }}>
        Open in two or three windows. Actions go to the server, which broadcasts
        the new state to every window. Late joiners sync from current state.
      </p>

      <SyncedPlayer state={state} />

      <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap", margin: "1rem 0" }}>
        <input
          value={videoId}
          onChange={(e) => setVideoId(e.target.value)}
          placeholder="YouTube video id"
          style={{ flex: 1, minWidth: "12rem", padding: "0.5rem" }}
        />
        <button onClick={() => dispatch({ action: "track", mediaId: videoId })}>Load</button>
        <button onClick={() => dispatch({ action: "resume" })}>Play</button>
        <button onClick={() => dispatch({ action: "pause" })}>Pause</button>
        <button onClick={() => dispatch({ action: "seek", position: Math.max(0, seconds + 10) })}>
          +10s
        </button>
        <button onClick={() => dispatch({ action: "seek", position: Math.max(0, seconds - 10) })}>
          -10s
        </button>
        <button onClick={() => dispatch({ action: "end" })}>End</button>
      </div>

      <pre style={{ background: "#f4f4f5", padding: "1rem", borderRadius: 8, fontSize: 12, overflow: "auto" }}>
        {JSON.stringify({ ...state, computedPosition: Number(seconds.toFixed(2)) }, null, 2)}
      </pre>
    </main>
  );
}
