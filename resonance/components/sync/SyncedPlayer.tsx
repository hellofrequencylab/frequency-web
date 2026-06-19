"use client";

import { useEffect, useRef } from "react";
import { computePosition } from "@/lib/sync/clock";
import type { RoomState } from "@/lib/sync/types";
import { loadYouTubeApi } from "./youtube-loader";

/** Re-seek only when the client drifts more than this from the server clock. */
const DRIFT_TOLERANCE_S = 1.5;
/** How often to nudge the player back onto the server clock. */
const HEARTBEAT_MS = 4000;

/** Drive the YouTube player from the authoritative RoomState. Pure follower:
 * it reads state, never writes it. */
function applyState(player: YTPlayer, state: RoomState | null) {
  if (!state || !state.currentMediaId) {
    try {
      player.stopVideo();
    } catch {
      /* player not ready */
    }
    return;
  }

  const desired = computePosition(state, Date.now());
  const loaded = player.getVideoData()?.video_id;

  // Wrong (or no) video loaded: load/cue it at the right position.
  if (loaded !== state.currentMediaId) {
    if (state.isPlaying) {
      player.loadVideoById({ videoId: state.currentMediaId, startSeconds: desired });
    } else {
      player.cueVideoById({ videoId: state.currentMediaId, startSeconds: desired });
    }
    return;
  }

  // Correct drift.
  if (state.isPlaying && Math.abs(player.getCurrentTime() - desired) > DRIFT_TOLERANCE_S) {
    player.seekTo(desired, true);
  }

  // Match play/pause.
  const PLAYING = window.YT?.PlayerState.PLAYING ?? 1;
  const playerState = player.getPlayerState();
  if (state.isPlaying && playerState !== PLAYING) player.playVideo();
  if (!state.isPlaying && playerState === PLAYING) player.pauseVideo();
}

export function SyncedPlayer({
  state,
  onEnded,
}: {
  state: RoomState | null;
  /** Fired once when the current track reaches its end (used to auto-advance). */
  onEnded?: () => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const playerRef = useRef<YTPlayer | null>(null);
  const readyRef = useRef(false);
  // Keep latest state/callback available to async callbacks (onReady, heartbeat).
  const stateRef = useRef<RoomState | null>(state);
  const onEndedRef = useRef(onEnded);
  useEffect(() => {
    stateRef.current = state;
  }, [state]);
  useEffect(() => {
    onEndedRef.current = onEnded;
  }, [onEnded]);

  // Create the player once.
  useEffect(() => {
    let destroyed = false;
    void loadYouTubeApi().then((YT) => {
      if (destroyed || !containerRef.current) return;
      playerRef.current = new YT.Player(containerRef.current, {
        playerVars: { playsinline: 1 },
        events: {
          onReady: () => {
            readyRef.current = true;
            if (playerRef.current) applyState(playerRef.current, stateRef.current);
          },
          onStateChange: (e) => {
            const ENDED = window.YT?.PlayerState.ENDED ?? 0;
            if (e.data === ENDED) onEndedRef.current?.();
          },
        },
      });
    });
    return () => {
      destroyed = true;
      try {
        playerRef.current?.destroy();
      } catch {
        /* already gone */
      }
    };
  }, []);

  // Apply whenever the authoritative state changes.
  useEffect(() => {
    if (readyRef.current && playerRef.current) applyState(playerRef.current, state);
  }, [state]);

  // Heartbeat: continuously pull the client back onto the server clock.
  useEffect(() => {
    const id = setInterval(() => {
      if (readyRef.current && playerRef.current) {
        applyState(playerRef.current, stateRef.current);
      }
    }, HEARTBEAT_MS);
    return () => clearInterval(id);
  }, []);

  return (
    <div style={{ aspectRatio: "16 / 9", width: "100%", background: "#000" }}>
      <div ref={containerRef} style={{ width: "100%", height: "100%" }} />
    </div>
  );
}
