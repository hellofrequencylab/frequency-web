import { createServerClient } from "@/lib/supabase/server";
import { seededRefId } from "@/lib/gamification/repo";
import type { CreatorEarning, CreatorSummary } from "./types";

const RECENT_LIMIT = 10;

/** Deterministic ledger ref for a revshare credit (uuid column), so a retried
 * purchase credits the creator at most once. */
export function revshareRefId(itemId: string, buyerUserId: string): string {
  return seededRefId(`revshare:${itemId}:${buyerUserId}`);
}

/**
 * Append an earnings row for a creator (one per credited purchase). Append-only:
 * the row records the creator's Zaps share of a single buyer's spend. The Zaps
 * themselves are credited separately through the gamification award path.
 */
export async function recordEarning(args: {
  worldId: string;
  creatorUserId: string;
  itemId: string | null;
  buyerUserId: string;
  amountZaps: number;
}): Promise<void> {
  const supabase = createServerClient();
  const { error } = await supabase.from("creator_earnings").insert({
    world_id: args.worldId,
    creator_user_id: args.creatorUserId,
    item_id: args.itemId,
    buyer_user_id: args.buyerUserId,
    amount_zaps: args.amountZaps,
  });
  if (error) throw error;
}

/**
 * A creator's earnings at a glance: lifetime Zaps total, number of sales, and the
 * most recent sales. Anyone with no earnings reads back as all zeros / empty.
 */
export async function creatorSummary(
  worldId: string,
  userId: string,
): Promise<CreatorSummary> {
  const supabase = createServerClient();
  const { data, error } = await supabase
    .from("creator_earnings")
    .select("*")
    .eq("world_id", worldId)
    .eq("creator_user_id", userId)
    .order("created_at", { ascending: false });
  if (error) throw error;

  const rows = (data ?? []).map(toEarning);
  const totalZaps = rows.reduce((sum, r) => sum + r.amountZaps, 0);
  return {
    totalZaps,
    sales: rows.length,
    recent: rows.slice(0, RECENT_LIMIT),
  };
}

function toEarning(r: Record<string, unknown>): CreatorEarning {
  return {
    id: r.id as string,
    worldId: r.world_id as string,
    creatorUserId: r.creator_user_id as string,
    itemId: (r.item_id as string | null) ?? null,
    buyerUserId: r.buyer_user_id as string,
    amountZaps: (r.amount_zaps as number) ?? 0,
    createdAt: r.created_at as string,
  };
}
