import { NextResponse } from "next/server";
import { getAuthedUserId } from "@/lib/auth/server";
import { getVenue, listSeats } from "@/lib/dj/repo";
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

  // Watch-party venues: only the host (the seated occupant) may drive playback.
  // Other venue kinds (and the standalone sync demo, whose venue isn't a real
  // row) keep open control here — the DJ loop drives playback via `advance`.
  const venue = await getVenue(venueId);
  if (venue?.mediaType === "watch") {
    const userId = await getAuthedUserId(req);
    if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    const host = [...(await listSeats(venueId))].sort((a, b) => a.seatIndex - b.seatIndex)[0];
    if (!host || host.occupantUserId !== userId) {
      return NextResponse.json({ error: "only the host controls playback" }, { status: 403 });
    }
  }

  const body = (await req.json()) as Action;
  const now = Date.now();

  const currentState = await getRoomState(venueId);
  const current: PlaybackFields = currentState ?? { ...IDLE };

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

  // A new track gets a fresh play id; idle clears it; everything else carries
  // the current play forward so votes stay attached to the same play.
  const playId =
    body.action === "track"
      ? crypto.randomUUID()
      : body.action === "end"
        ? null
        : (currentState?.currentPlayId ?? null);

  const state = await applyPlayback(venueId, next, playId);
  await broadcastToVenue(venueId, ROOM_UPDATE_EVENT, state);
  return NextResponse.json({ state });
}
