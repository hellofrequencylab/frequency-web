import { NextResponse } from "next/server";
import { createVenue, listVenues } from "@/lib/dj/repo";
import { getAuthedUserId } from "@/lib/auth/server";
import { DEMO_WORLD_ID } from "@/lib/constants";
import type { MediaType } from "@/lib/dj/types";

export const dynamic = "force-dynamic";

/** List venues in the world, with lightweight activity signals (the lobby). */
export async function GET() {
  const venues = await listVenues(DEMO_WORLD_ID);
  return NextResponse.json({ venues });
}

const MEDIA_TYPES: MediaType[] = ["dj", "watch", "lounge", "event"];

// Seeds a fresh lounge so it's playing the moment someone walks in. Members
// extend it from there (the playlist is a community jukebox).
const DEFAULT_LOUNGE_PLAYLIST = ["jfKfPfyJRdk", "5qap5aO4i9A", "DWcJFNfaw9c"];

/** Create a venue. Body: { name, theme?, mediaType?, seatCount?, worldId? }. */
export async function POST(req: Request) {
  // Creating a venue writes through the service-role client (RLS bypassed), so this
  // must require an authenticated caller — every other mutating venue route
  // (decor/playlist/vote/seats) gates the same way. Without it, any anonymous caller
  // could insert unbounded venue rows.
  const userId = await getAuthedUserId(req);
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = (await req.json()) as {
    name?: string;
    theme?: string;
    mediaType?: MediaType;
    seatCount?: number;
    worldId?: string;
  };
  if (!body.name) {
    return NextResponse.json({ error: "name required" }, { status: 400 });
  }
  const mediaType = body.mediaType && MEDIA_TYPES.includes(body.mediaType) ? body.mediaType : "dj";
  // A watch party has one host seat by default; DJ rooms default to 5 decks.
  const seatCount = body.seatCount ?? (mediaType === "watch" ? 1 : 5);
  const venue = await createVenue(body.worldId ?? DEMO_WORLD_ID, {
    name: body.name,
    theme: body.theme,
    mediaType,
    seatCount,
    playlist: mediaType === "lounge" ? DEFAULT_LOUNGE_PLAYLIST : undefined,
  });
  return NextResponse.json({ venue });
}
