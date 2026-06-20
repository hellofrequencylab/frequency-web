import { NextResponse } from "next/server";
import { getAuthedUserId } from "@/lib/auth/server";
import { getVenue, updateVenueDecor } from "@/lib/dj/repo";
import { BOARD_WIDTH, BOARD_HEIGHT } from "@/components/venue/DecorCanvas";
import type { DecorItem } from "@/lib/dj/types";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ venueId: string }> };

const MAX_ITEMS = 60;

function clamp(n: number, min: number, max: number): number {
  if (!Number.isFinite(n)) return min;
  return Math.min(max, Math.max(min, n));
}

/** Coerce one raw item into a clamped, well-formed DecorItem, or null if junk. */
function sanitize(raw: unknown): DecorItem | null {
  if (typeof raw !== "object" || raw === null) return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.id !== "string" || typeof r.kind !== "string") return null;
  const item: DecorItem = {
    id: r.id,
    kind: r.kind,
    x: clamp(Number(r.x), 0, BOARD_WIDTH),
    y: clamp(Number(r.y), 0, BOARD_HEIGHT),
  };
  if (typeof r.scale === "number" && Number.isFinite(r.scale)) {
    item.scale = clamp(r.scale, 0.5, 4);
  }
  return item;
}

/**
 * Save a venue's decor layout (build plan §13). Host-owned: only the venue's
 * creator may edit. Legacy venues have a null `created_by`, so we allow edits on
 * those rather than locking them out.
 */
export async function PUT(req: Request, ctx: Ctx) {
  const { venueId } = await ctx.params;
  const userId = await getAuthedUserId(req);
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const venue = await getVenue(venueId);
  if (!venue) return NextResponse.json({ error: "not found" }, { status: 404 });

  // Host-owned: enforce ownership only when we know who owns the venue.
  if (venue.createdBy && venue.createdBy !== userId) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const body = (await req.json().catch(() => ({}))) as { decor?: unknown };
  if (!Array.isArray(body.decor)) {
    return NextResponse.json({ error: "decor must be an array" }, { status: 400 });
  }

  const decor = body.decor
    .map(sanitize)
    .filter((d): d is DecorItem => d !== null)
    .slice(0, MAX_ITEMS);

  await updateVenueDecor(venueId, decor);
  return NextResponse.json({ ok: true, decor });
}
