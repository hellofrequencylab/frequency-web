import { NextResponse } from "next/server";
import { getAuthedUserId } from "@/lib/auth/server";
import { getProfile, upsertProfile } from "@/lib/profiles/repo";
import { DEMO_WORLD_ID } from "@/lib/constants";

export const dynamic = "force-dynamic";

/** The caller's profile in this world, or null for a guest / signed-out user. */
export async function GET(req: Request) {
  const userId = await getAuthedUserId(req);
  if (!userId) return NextResponse.json({ profile: null });
  const profile = await getProfile(DEMO_WORLD_ID, userId);
  return NextResponse.json({ profile });
}

/** Create or update the caller's profile. Body: { displayName, avatarConfig? }. */
export async function PUT(req: Request) {
  const userId = await getAuthedUserId(req);
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = (await req.json()) as {
    displayName?: string;
    avatarConfig?: Record<string, unknown>;
  };
  const displayName = (body.displayName ?? "").trim();
  if (!displayName) {
    return NextResponse.json({ error: "displayName required" }, { status: 400 });
  }
  const profile = await upsertProfile(DEMO_WORLD_ID, userId, {
    displayName: displayName.slice(0, 40),
    avatarConfig: body.avatarConfig,
  });
  return NextResponse.json({ profile });
}
