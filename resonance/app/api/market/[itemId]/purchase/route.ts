import { NextResponse } from "next/server";
import { DEMO_WORLD_ID } from "@/lib/constants";
import { getAuthedUserId } from "@/lib/auth/server";
import { spendZaps } from "@/lib/gamification/service";
import { getItem, grantItem, listOwned } from "@/lib/market/repo";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ itemId: string }> };

/**
 * Buy a cosmetic. Zaps items debit the ledger and grant the item; premium items
 * route to a future Stripe path that is scaffolded only (no package, no key by
 * default, so the build stays green). The caller's identity comes from the JWT.
 */
export async function POST(req: Request, ctx: Ctx) {
  const { itemId } = await ctx.params;
  const userId = await getAuthedUserId(req);
  if (!userId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const item = await getItem(itemId);
  if (!item || !item.active) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  const owned = await listOwned(DEMO_WORLD_ID, userId);
  if (owned.includes(item.id)) {
    return NextResponse.json({ error: "already owned" }, { status: 409 });
  }

  const isPremium = item.priceCents != null && item.priceZaps === 0;
  if (isPremium) {
    // Stripe path, scaffolded only. No stripe package is installed, so we never
    // import one. Without a key, payments are not live yet.
    if (!process.env.STRIPE_SECRET_KEY) {
      return NextResponse.json({ error: "payments coming soon" }, { status: 402 });
    }
    // Key present: hand back a clearly-stubbed checkout shape for the future path.
    return NextResponse.json({ checkoutUrl: null, todo: "stripe checkout" });
  }

  // Zaps path: spend then grant. The item id is the ledger refId, so a retried
  // purchase debits at most once.
  const result = await spendZaps(DEMO_WORLD_ID, userId, item.priceZaps, "purchase", item.id);
  if (!result.ok) {
    return NextResponse.json(
      { error: "not enough zaps", balance: result.balance },
      { status: 402 },
    );
  }

  await grantItem(DEMO_WORLD_ID, userId, item.id);
  return NextResponse.json({ ok: true, balance: result.balance });
}
