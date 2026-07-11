// Controlled category taxonomy for the Market (Etsy-Grade Phase 1). Replaces the free-text category
// input in both authoring forms (the maker "List a product" page and the Space Shop item form) with a
// picker, so listings sort into a small, stable set of top-level groups a community handmade/goods/
// services market actually uses. The chosen value is stored as-is in commerce_products.category (the
// existing column, no schema change): the STORED value is the human label, so the detail page and cards
// keep rendering product.category directly.
//
// Discovery TAGS are the free-form complement to this fixed taxonomy: category is the aisle, tags are
// the keywords. normalizeTags() lives here so the client chip input and the server writer agree on one
// shape. Voice: plain Title Case nouns, on-canon (docs/NAMING.md + docs/CONTENT-VOICE.md), no em dashes.

export interface CommerceSubcategory {
  /** Stored in commerce_products.category (the human label). */
  value: string
  label: string
}

export interface CommerceCategory {
  /** Stored value when a seller picks the group itself (no subcategory). */
  value: string
  label: string
  /** More specific options shown grouped under the top-level group. */
  subcategories: CommerceSubcategory[]
}

/** The top-level Market taxonomy, in display order. A seller may pick a group or one of its
 *  subcategories; both store their label in commerce_products.category. */
export const COMMERCE_CATEGORIES: readonly CommerceCategory[] = [
  {
    value: 'Handmade',
    label: 'Handmade',
    subcategories: [
      { value: 'Ceramics & Pottery', label: 'Ceramics & Pottery' },
      { value: 'Jewelry', label: 'Jewelry' },
      { value: 'Candles & Soap', label: 'Candles & Soap' },
      { value: 'Fiber & Textiles', label: 'Fiber & Textiles' },
      { value: 'Woodwork', label: 'Woodwork' },
    ],
  },
  {
    value: 'Art & Prints',
    label: 'Art & Prints',
    subcategories: [
      { value: 'Original Art', label: 'Original Art' },
      { value: 'Prints & Posters', label: 'Prints & Posters' },
      { value: 'Photography', label: 'Photography' },
    ],
  },
  {
    value: 'Wellness',
    label: 'Wellness',
    subcategories: [
      { value: 'Herbal & Apothecary', label: 'Herbal & Apothecary' },
      { value: 'Bodywork & Massage', label: 'Bodywork & Massage' },
      { value: 'Yoga & Movement', label: 'Yoga & Movement' },
      { value: 'Coaching', label: 'Coaching' },
    ],
  },
  {
    value: 'Home & Garden',
    label: 'Home & Garden',
    subcategories: [
      { value: 'Decor', label: 'Decor' },
      { value: 'Kitchen', label: 'Kitchen' },
      { value: 'Plants', label: 'Plants' },
    ],
  },
  {
    value: 'Apparel & Accessories',
    label: 'Apparel & Accessories',
    subcategories: [
      { value: 'Clothing', label: 'Clothing' },
      { value: 'Bags', label: 'Bags' },
      { value: 'Hats', label: 'Hats' },
    ],
  },
  {
    value: 'Food & Drink',
    label: 'Food & Drink',
    subcategories: [
      { value: 'Baked Goods', label: 'Baked Goods' },
      { value: 'Preserves', label: 'Preserves' },
      { value: 'Coffee & Tea', label: 'Coffee & Tea' },
    ],
  },
  {
    value: 'Digital',
    label: 'Digital',
    subcategories: [
      { value: 'Templates', label: 'Templates' },
      { value: 'Music & Audio', label: 'Music & Audio' },
      { value: 'Courses', label: 'Courses' },
    ],
  },
  {
    value: 'Services',
    label: 'Services',
    subcategories: [
      { value: 'Lessons', label: 'Lessons' },
      { value: 'Repairs', label: 'Repairs' },
      { value: 'Events & Hosting', label: 'Events & Hosting' },
    ],
  },
  {
    value: 'Other',
    label: 'Other',
    subcategories: [],
  },
]

/** Every valid stored category value (top-level groups + subcategories), for validation. */
export const CATEGORY_VALUES: readonly string[] = COMMERCE_CATEGORIES.flatMap((c) => [
  c.value,
  ...c.subcategories.map((s) => s.value),
])

const CATEGORY_VALUE_SET = new Set(CATEGORY_VALUES)

/** Whether a value belongs to the controlled taxonomy. PURE. */
export function isValidCategory(value: string | null | undefined): boolean {
  return !!value && CATEGORY_VALUE_SET.has(value)
}

/** The display label for a stored category. Taxonomy values map to themselves; a legacy free-text
 *  value (from before the picker) passes through so old listings still show their category. Null/blank
 *  returns null (the caller renders nothing). PURE. */
export function categoryLabel(value: string | null | undefined): string | null {
  const v = value?.trim()
  return v ? v : null
}

/** Normalize a stored category on write: keep a valid taxonomy value; keep a non-empty legacy value as
 *  typed (so an edit never blanks a pre-taxonomy category); collapse blank to null. PURE. */
export function normalizeCategory(value: string | null | undefined): string | null {
  const v = value?.trim()
  if (!v) return null
  return v.slice(0, 60)
}

/** Cap and shape a tag list (from a chip input or a comma string): trim, drop blanks, de-dup
 *  case-insensitively (keeping first casing), cap each tag's length and the overall count. PURE, so the
 *  client chip control and the server writer produce the exact same array. */
export function normalizeTags(input: readonly string[] | string | null | undefined, max = 12): string[] {
  const raw = typeof input === 'string' ? input.split(',') : (input ?? [])
  const out: string[] = []
  const seen = new Set<string>()
  for (const t of raw) {
    const tag = String(t).trim().replace(/\s+/g, ' ').slice(0, 30)
    if (!tag) continue
    const key = tag.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    out.push(tag)
    if (out.length >= max) break
  }
  return out
}
