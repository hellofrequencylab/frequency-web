import { NextResponse } from "next/server";
import { DEMO_WORLD_ID } from "@/lib/constants";
import { getAuthedUserId } from "@/lib/auth/server";
import { getBalance } from "@/lib/gamification/repo";
import { listItems, listOwned } from "@/lib/market/repo";
import type { MarketView } from "@/lib/market/types";

export const dynamic = "force-dynamic";

/**
 * The marketplace view: the active catalog plus, for a signed-in caller, the
 * items they own and their Zaps balance. An anonymous caller still sees the
 * catalog with balance 0 and nothing owned.
 */
export async function GET(req: Request) {
  const userId = await getAuthedUserId(req);

  const [items, owned, balance] = await Promise.all([
    listItems(DEMO_WORLD_ID),
    userId ? listOwned(DEMO_WORLD_ID, userId) : Promise.resolve<string[]>([]),
    userId ? getBalance(DEMO_WORLD_ID, userId) : Promise.resolve(0),
  ]);

  const view: MarketView = { items, owned, balance };
  return NextResponse.json(view);
}
