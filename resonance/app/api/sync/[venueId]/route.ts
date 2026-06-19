import { NextResponse } from "next/server";
import { getRoomState, applyPlayback } from "@/lib/sync/room-state-repo";
import {
  IDLE,
  startTrack,
  pause,
  resume,
  seek,
  endTrack,
  type PlaybackFields,
} from "@/lib/sync/clock";
import { broadcastToVenue } from "@/lib/realtime/server-broadcast";
import { ROOM_UPDATE_EVENT } from "@/lib/sync/channels";

// Mutations + live state: always run at request time, never cached.
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ venueId: string }> };

/** Current authoritative state. Clients compute their own position from it. */
export async function GET(_req: Request, ctx: Ctx) {
  const { venueId } = await ctx.params;
  const state = await getRoomState(venueId);
  return NextResponse.json({ state });
}

type Action =
  | { action: "track"; mediaId: string; djUserId?: string | null }
  | { action: "resume" }
  | { action: "pause" }
  | { action: "seek"; position: number }
  | { action: "end" };

/**
 * Apply a playback action server-authoritatively: read current state, run the
 * pure transition, persist it, then broadcast the new state to the venue. The
 * acting client gets the same state back in the response.
 */
export async function POST(req: Request, ctx: Ctx) {
  const { venueId } = await ctx.params;
  const body = (await req.json()) as Action;
  const now = Date.now();

  const current: PlaybackFields = (await getRoomState(venueId)) ?? {
    ...IDLE,
  };

  let next: PlaybackFields;
  switch (body.action) {
    case "track":
      if (!body.mediaId) {
        return NextResponse.json({ error: "mediaId required" }, { status: 400 });
      }
      next = startTrack(body.mediaId, now, body.djUserId ?? null);
      break;
    case "resume":
      next = resume(current, now);
      break;
    case "pause":
      next = pause(current, now);
      break;
    case "seek":
      if (typeof body.position !== "number") {
        return NextResponse.json({ error: "position required" }, { status: 400 });
      }
      next = seek(current, body.position, now);
      break;
    case "end":
      next = endTrack(current);
      break;
    default:
      return NextResponse.json({ error: "unknown action" }, { status: 400 });
  }

  const state = await applyPlayback(venueId, next);
  await broadcastToVenue(venueId, ROOM_UPDATE_EVENT, state);
  return NextResponse.json({ state });
}
