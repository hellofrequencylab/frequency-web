import { createServerClient } from "@/lib/supabase/server";
import type { MarketItem } from "./types";

/** Active catalog for a world, newest last (stable browse order). */
export async function listItems(worldId: string): Promise<MarketItem[]> {
  const supabase = createServerClient();
  const { data, error } = await supabase
    .from("market_items")
    .select("*")
    .eq("world_id", worldId)
    .eq("active", true)
    .order("created_at", { ascending: true });
  if (error) throw error;
  return (data ?? []).map(toItem);
}

/** A single item by id, or null if it does not exist. */
export async function getItem(itemId: string): Promise<MarketItem | null> {
  const supabase = createServerClient();
  const { data, error } = await supabase
    .from("market_items")
    .select("*")
    .eq("id", itemId)
    .maybeSingle();
  if (error) throw error;
  return data ? toItem(data) : null;
}

/** The item ids a user owns in a world. */
export async function listOwned(worldId: string, userId: string): Promise<string[]> {
  const supabase = createServerClient();
  const { data, error } = await supabase
    .from("user_inventory")
    .select("item_id")
    .eq("world_id", worldId)
    .eq("user_id", userId);
  if (error) throw error;
  return (data ?? []).map((r) => r.item_id as string);
}

/**
 * Grant an item to a user. Idempotent: the unique (user, item) key means a
 * re-grant upserts rather than duplicating, so a retried purchase is safe.
 */
export async function grantItem(
  worldId: string,
  userId: string,
  itemId: string,
): Promise<void> {
  const supabase = createServerClient();
  const { error } = await supabase
    .from("user_inventory")
    .upsert(
      { world_id: worldId, user_id: userId, item_id: itemId },
      { onConflict: "user_id,item_id", ignoreDuplicates: true },
    );
  if (error) throw error;
}

/**
 * The items a given creator has listed in a world (their sellable catalog). Used
 * by the creator-earnings surface to tie sales back to what a creator made.
 */
export async function listCreatedBy(
  worldId: string,
  creatorUserId: string,
): Promise<MarketItem[]> {
  const supabase = createServerClient();
  const { data, error } = await supabase
    .from("market_items")
    .select("*")
    .eq("world_id", worldId)
    .eq("created_by", creatorUserId)
    .order("created_at", { ascending: true });
  if (error) throw error;
  return (data ?? []).map(toItem);
}

function toItem(r: Record<string, unknown>): MarketItem {
  return {
    id: r.id as string,
    worldId: r.world_id as string,
    name: r.name as string,
    kind: r.kind as MarketItem["kind"],
    priceZaps: (r.price_zaps as number) ?? 0,
    priceCents: (r.price_cents as number | null) ?? null,
    active: (r.active as boolean) ?? true,
    createdBy: (r.created_by as string | null) ?? null,
    createdAt: r.created_at as string,
  };
}
