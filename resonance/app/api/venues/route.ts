import { NextResponse } from "next/server";
import { createVenue } from "@/lib/dj/repo";

export const dynamic = "force-dynamic";

/** Placeholder tenant until the multi-tenant `worlds` table lands. */
const DEMO_WORLD_ID = "00000000-0000-0000-0000-0000000000aa";

/** Create a venue. Body: { name, seatCount?, worldId? }. */
export async function POST(req: Request) {
  const body = (await req.json()) as {
    name?: string;
    seatCount?: number;
    worldId?: string;
  };
  if (!body.name) {
    return NextResponse.json({ error: "name required" }, { status: 400 });
  }
  const venue = await createVenue(
    body.worldId ?? DEMO_WORLD_ID,
    body.name,
    body.seatCount ?? 5,
  );
  return NextResponse.json({ venue });
}
