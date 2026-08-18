// THE COSMETIC RENDER REGISTRY — the one place that says what a bought cosmetic looks like.
//
// ── WHY THIS EXISTS (backlog LIVE-013) ────────────────────────────────────────────────────────
//
// The Vault Store sold five borders, five flairs and four titles. Redeeming one wrote
// `profiles.profile_border` / `profile_flair` / `custom_title` — and NOTHING in the product read
// those three columns except a text chip in the member's own Vault summary, which printed the raw
// stored string ("Border: indigo"). A member could pay 2,500 Gems for "Prismatic — a shifting
// gradient border, the rarest cosmetic" and the only thing that changed anywhere was six grey
// words on the page they bought it from. Measured against production on 2026-08-17: three paid
// redemptions had already happened, 950 Gems, one real member, 51 days earlier.
//
// So the invariant is: a cosmetic the store will CHARGE for must resolve to something this
// registry can paint. This module is that resolution, and it is the same module the guard
// (`scripts/check-cosmetic-renders.mjs` + its test) measures the live shelf against.
//
// ── THE TWO HALVES, AND WHY THEY ARE SEPARATE ─────────────────────────────────────────────────
//
//   · THE VALUE VOCABULARY (BORDER_RENDERS / FLAIR_RENDERS) is what a stored column value may be.
//     It is closed on purpose. A value not in it is UNDELIVERABLE, and `redeemItem` refuses the
//     sale rather than taking Gems for it. Adding a border means adding a row here — which is
//     also what makes it paint, so the registry cannot drift from the render.
//   · THE SKU BRIDGE (SLUG_COSMETICS) covers shelf rows whose `store_items.metadata` never got a
//     `type`/`value` pair, so `classifyRedemption` routed them to "pending" and an operator queue
//     that did not exist. Only entries whose delivery is UNAMBIGUOUS from the SKU's own copy live
//     here; everything else stays undeliverable and comes off the shelf. This is a bridge, not a
//     home: `supabase/migrations/20270312000000_store_cosmetic_fulfillment.sql (applied 2026-08-18)` writes the metadata properly, and
//     when that is applied the bridge row is redundant (the guard keeps agreeing either way).
//
// PURE. No React, no Next, no Supabase — it is imported by a server action, a Server Component,
// and a vitest guard, and bare-node reads its shape. Keep it that way.

/** The three cosmetic slots a member can equip. One column on `profiles` each. */
export type CosmeticType = 'border' | 'flair' | 'title'

/** How a border is painted. `ring` borders are a token ring utility; `paint` borders are drawn by
 *  the component (a conic sweep) because no single ring colour tells that story. */
export type BorderRender =
  | { kind: 'ring'; ring: string; label: string }
  | { kind: 'paint'; label: string }

/**
 * Border values → their render. Keys are NORMALISED values (see `normalizeBorderValue`): the
 * seeded rows store `ring-indigo-500`-shaped strings, which are a Tailwind class from a palette
 * this design system does not ship. Normalising at the door means the stored string is DATA and
 * the class it paints is OURS — a DAWN rank-spectrum token, so the ring survives a skin change
 * and passes the token + phantom-class gates.
 */
export const BORDER_RENDERS: Record<string, BorderRender> = {
  indigo: { kind: 'ring', ring: 'ring-rank-indigo', label: 'Indigo Aura' },
  amber: { kind: 'ring', ring: 'ring-rank-gold', label: 'Golden Ring' },
  emerald: { kind: 'ring', ring: 'ring-rank-jade', label: 'Emerald Crown' },
  violet: { kind: 'ring', ring: 'ring-rank-plum', label: 'Violet Flame' },
  /** The 2,500-Gem top of the shelf. A single ring colour cannot be "shifting", so it is painted. */
  gradient: { kind: 'paint', label: 'Prismatic' },
  /** The Season 1 waveform border. Painted from the same sweep, in the signal steps. */
  waveform: { kind: 'paint', label: 'Waveform' },
}

/**
 * Flair values → the icon key the chip renders. The key is resolved to a real icon in
 * `components/profile/profile-cosmetics.tsx`; keeping it a STRING here is what lets bare node and
 * the pure guard read this file without pulling React in.
 */
export const FLAIR_RENDERS: Record<string, { icon: string; label: string }> = {
  flame: { icon: 'flame', label: 'Fire Flair' },
  star: { icon: 'star', label: 'Star Flair' },
  gem: { icon: 'gem', label: 'Gem Flair' },
  crown: { icon: 'crown', label: 'Crown Flair' },
  zap: { icon: 'zap', label: 'Lightning Flair' },
}

/** A title is free text (the SKU carries the words), so the render rule is a length bound rather
 *  than a vocabulary. Long enough for "Trailblazer", short enough to sit in a chip beside a name. */
export const MAX_TITLE_LENGTH = 24

/**
 * The SKU bridge: shelf rows whose metadata carries no `type`/`value`, but whose delivery is
 * unambiguous from the SKU's own name and description. Read ONLY when the metadata itself does
 * not classify, so applied metadata always wins.
 *
 * `waveform-border` is the only entry, and it earns it: name "Waveform Border", description "An
 * animated waveform profile border. Retires at season close." There is exactly one thing that can
 * mean. The other four untyped cosmetic/title SKUs on the shelf (`s1-flair-set`, `animated-banner`,
 * `callsign-plate`, `custom-title-slot`) are NOT here on purpose — a "set" of flair does not fit a
 * single-value column, and a banner, a callsign plate and a member-authored title slot each need a
 * surface that does not exist. Inventing a render for those would be guessing at product with
 * someone else's Gems. They stay undeliverable, so the store refuses the sale instead.
 */
export const SLUG_COSMETICS: Record<string, { type: CosmeticType; value: string }> = {
  'waveform-border': { type: 'border', value: 'waveform' },
}

/** A stored `ring-<name>-500` (or bare `ring-<name>`) value → `<name>`. Idempotent, so an
 *  already-clean value (what the bridge, and any future metadata write, stores) passes through
 *  untouched.
 *
 *  ⚠️ The examples are written as a SHAPE, not spelled out: a real one would put a class-shaped
 *  string in lib/, and check:phantom reads prose as well as code. It flagged exactly that here on
 *  the first run, because the class it named is not one this design system emits. */
export function normalizeBorderValue(value: string): string {
  return value.trim().replace(/^ring-/, '').replace(/-\d{2,3}$/, '')
}

/** The border render for a stored column value, or null when nothing paints it. */
export function resolveBorder(value: string | null | undefined): BorderRender | null {
  if (typeof value !== 'string' || value.trim() === '') return null
  return BORDER_RENDERS[normalizeBorderValue(value)] ?? null
}

/** The flair render for a stored column value, or null when nothing paints it. */
export function resolveFlair(value: string | null | undefined): { icon: string; label: string } | null {
  if (typeof value !== 'string' || value.trim() === '') return null
  return FLAIR_RENDERS[value.trim().toLowerCase()] ?? null
}

/** The title to display, or null when there is nothing renderable. Free text, bounded. */
export function resolveTitle(value: string | null | undefined): string | null {
  if (typeof value !== 'string') return null
  const t = value.trim()
  if (t === '' || t.length > MAX_TITLE_LENGTH) return null
  return t
}

/** Does this (type, value) pair resolve to something the product actually paints? */
export function isRenderableCosmetic(type: CosmeticType, value: string | null | undefined): boolean {
  if (type === 'border') return resolveBorder(value) !== null
  if (type === 'flair') return resolveFlair(value) !== null
  return resolveTitle(value) !== null
}

/** A shelf row, as much of it as any of this needs. Matches `store_items` and the census JSON. */
export interface ShelfItem {
  slug: string
  category: string
  gem_cost: number
  is_active: boolean
  metadata: unknown
}

/**
 * The cosmetic a SKU delivers: its metadata first, the slug bridge second, null when neither
 * answers. Returning the PAIR (not a boolean) is what lets the redeem path write the right column
 * with the right value from one lookup.
 */
export function cosmeticForItem(item: Pick<ShelfItem, 'slug' | 'metadata'>): { type: CosmeticType; value: string } | null {
  const meta = (item.metadata ?? null) as { type?: string; value?: string } | null
  const type = meta?.type
  if (type === 'border' || type === 'flair' || type === 'title') {
    const value = typeof meta?.value === 'string' ? meta.value : ''
    return isRenderableCosmetic(type, value) ? { type, value } : null
  }
  const bridged = SLUG_COSMETICS[item.slug]
  if (bridged && isRenderableCosmetic(bridged.type, bridged.value)) return bridged
  return null
}

/**
 * The categories whose SKUs PROMISE a visible change to the member's profile. A `feature` or
 * `membership` SKU is an operator-honored perk (the redemption row is the fulfillment record, and
 * /admin/store now shows the queue); a `collectible` renders as a chip in the member's collection
 * on their profile, which is its whole promise. Only these two owe a painted cosmetic.
 */
export const RENDER_REQUIRED_CATEGORIES: readonly string[] = ['cosmetic', 'title']

/**
 * The defect this whole row is about: a SKU a member can BUY, in a category that promises a
 * visible profile change, that resolves to nothing anything renders.
 *
 * Deliberately narrow on both ends. `is_active` false is off the shelf (the granted-only award
 * cosmetics all sit there). `gem_cost` 0 is not a purchase — it is a grant, and a grant's promise
 * is the collection chip, not an equipped slot.
 */
export function isUndeliverable(item: ShelfItem): boolean {
  if (!item.is_active) return false
  if (!(item.gem_cost > 0)) return false
  if (!RENDER_REQUIRED_CATEGORIES.includes(item.category)) return false
  return cosmeticForItem(item) === null
}
