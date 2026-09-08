// EARNED COSMETICS — the pure gate both cosmetic seams share (PROG-SPOT increment 4, ADR-1279).
//
// `ProfileSkin.requiredItem` (lib/theme/profile-skins.ts) and `SpotlightStickerDef.requiredItem`
// (lib/spotlight/stickers.ts) were declared as one seam in two places so that ONE inventory read
// could gate both. This module is that gate: given a definition list, the ids a member picked, and
// the set of item slugs they hold (lib/awards/holdings.ts), it says which required items are
// missing. The two writers refuse on a non-empty answer; the appearance rail hides what the
// member has not earned.
//
// PURE: no IO, no React, no Supabase. The read that fills `held` lives in lib/awards/holdings.ts
// so a client bundle (the rail) can import this file for the picker filter without dragging a
// database client along.

export interface EarnedCosmetic {
  id: string
  /** The store item slug that unlocks this cosmetic. Unset = free. */
  requiredItem?: string
}

/** Is this cosmetic usable by a member who holds `held`? Free cosmetics always are. */
export function cosmeticUnlocked(def: EarnedCosmetic, held: ReadonlySet<string>): boolean {
  return !def.requiredItem || held.has(def.requiredItem)
}

/** The subset of `defs` the member may pick, in the original order (the picker's list). */
export function unlockedCosmetics<T extends EarnedCosmetic>(defs: readonly T[], held: ReadonlySet<string>): T[] {
  return defs.filter((d) => cosmeticUnlocked(d, held))
}

/** The distinct required items among the picked ids, so a caller can skip the inventory read
 *  entirely when every pick is free (the common case: no query for a free sticker). Unknown ids
 *  are ignored here; the validators drop them on their own. */
export function requiredItemsFor(defs: readonly EarnedCosmetic[], pickedIds: readonly string[]): string[] {
  const byId = new Map(defs.map((d) => [d.id, d]))
  const out = new Set<string>()
  for (const id of pickedIds) {
    const item = byId.get(id)?.requiredItem
    if (item) out.add(item)
  }
  return [...out]
}

/** The required items the member LACKS among their picks. Empty = the write may proceed. */
export function missingRequiredItems(
  defs: readonly EarnedCosmetic[],
  pickedIds: readonly string[],
  held: ReadonlySet<string>,
): string[] {
  return requiredItemsFor(defs, pickedIds).filter((item) => !held.has(item))
}
