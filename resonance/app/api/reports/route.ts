import { NextResponse } from "next/server";
import { getAuthedUserId } from "@/lib/auth/server";
import { fileReport, listReports } from "@/lib/moderation/repo";
import { rateLimit } from "@/lib/security/ratelimit";
import { DEMO_WORLD_ID } from "@/lib/constants";

export const dynamic = "force-dynamic";

/** Open reports in the world, for the dev/mod review surface. Auth required. */
export async function GET(req: Request) {
  const userId = await getAuthedUserId(req);
  if (!userId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const all = await listReports(DEMO_WORLD_ID);
  const reports = all.filter((r) => r.status === "open");
  return NextResponse.json({ reports });
}

/**
 * File a report. Auth required. Body: { subjectUserId?, venueId?, reason,
 * detail? }. Rate-limited per reporter to slow accidental floods.
 */
export async function POST(req: Request) {
  const userId = await getAuthedUserId(req);
  if (!userId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  if (!rateLimit(`reports:${userId}`, 5, 60_000)) {
    return NextResponse.json({ error: "too many reports, slow down" }, { status: 429 });
  }

  const body = (await req.json().catch(() => ({}))) as {
    subjectUserId?: string;
    venueId?: string;
    reason?: string;
    detail?: string;
  };
  if (!body.reason) {
    return NextResponse.json({ error: "reason required" }, { status: 400 });
  }

  await fileReport(DEMO_WORLD_ID, userId, {
    subjectUserId: body.subjectUserId,
    venueId: body.venueId,
    reason: body.reason,
    detail: body.detail,
  });
  return NextResponse.json({ ok: true });
}
