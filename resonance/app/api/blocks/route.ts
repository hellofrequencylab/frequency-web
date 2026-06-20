import { NextResponse } from "next/server";
import { getAuthedUserId } from "@/lib/auth/server";
import { blockUser, listBlocks, unblockUser } from "@/lib/moderation/repo";
import { DEMO_WORLD_ID } from "@/lib/constants";

export const dynamic = "force-dynamic";

/** The caller's block list. Auth required. Returns { blocked: string[] }. */
export async function GET(req: Request) {
  const userId = await getAuthedUserId(req);
  if (!userId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const blocked = await listBlocks(userId);
  return NextResponse.json({ blocked });
}

/** Block a user. Auth required. Body: { blockedUserId }. */
export async function POST(req: Request) {
  const userId = await getAuthedUserId(req);
  if (!userId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const body = (await req.json().catch(() => ({}))) as { blockedUserId?: string };
  if (!body.blockedUserId) {
    return NextResponse.json({ error: "blockedUserId required" }, { status: 400 });
  }
  await blockUser(DEMO_WORLD_ID, userId, body.blockedUserId);
  return NextResponse.json({ ok: true });
}

/** Remove a block. Auth required. Body: { blockedUserId }. */
export async function DELETE(req: Request) {
  const userId = await getAuthedUserId(req);
  if (!userId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const body = (await req.json().catch(() => ({}))) as { blockedUserId?: string };
  if (!body.blockedUserId) {
    return NextResponse.json({ error: "blockedUserId required" }, { status: 400 });
  }
  await unblockUser(userId, body.blockedUserId);
  return NextResponse.json({ ok: true });
}
