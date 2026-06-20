import { NextResponse } from "next/server";
import { DEMO_WORLD_ID } from "@/lib/constants";
import { getAuthedUserId } from "@/lib/auth/server";
import { creatorSummary } from "@/lib/creator/repo";
import type { CreatorSummary } from "@/lib/creator/types";

export const dynamic = "force-dynamic";

const EMPTY: CreatorSummary = { totalZaps: 0, sales: 0, recent: [] };

/**
 * The caller's creator earnings (spec §17): lifetime Zaps earned, sale count, and
 * recent sales. Earnings come from other people buying cosmetics the caller made.
 * An anonymous caller reads back zeros.
 */
export async function GET(req: Request) {
  const userId = await getAuthedUserId(req);
  if (!userId) return NextResponse.json(EMPTY);

  const summary = await creatorSummary(DEMO_WORLD_ID, userId);
  return NextResponse.json(summary);
}
