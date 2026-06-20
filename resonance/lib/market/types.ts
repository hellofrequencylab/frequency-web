/**
 * Cosmetics marketplace (spec §14). Items are bought with Zaps; premium items
 * carry a cents price for a future Stripe path (scaffolded only).
 */

export type ItemKind = "avatar_frame" | "color" | "badge" | "decor";

export interface MarketItem {
  id: string;
  worldId: string;
  name: string;
  kind: ItemKind;
  priceZaps: number;
  /** Premium/Stripe-only items set this; null for zaps items. */
  priceCents: number | null;
  active: boolean;
  createdAt: string;
}

export interface InventoryEntry {
  id: string;
  worldId: string;
  userId: string;
  itemId: string;
  acquiredAt: string;
}

/** Everything the marketplace page needs in one shape: catalog, what the caller
 *  owns (item ids), and the caller's spendable Zaps balance. */
export interface MarketView {
  items: MarketItem[];
  owned: string[];
  balance: number;
}
