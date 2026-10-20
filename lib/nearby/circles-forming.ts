// Which circles the Around You "Circles forming" card lists. Pure, so the one rule that matters is
// testable: a viewer who has set a city sees the newest circles in THAT city first, and the card
// says so; a viewer with no city, or a city with no new circles, sees the newest across the whole
// community and the card does not claim they are local.

export type FormingCircle = {
  id: string
  name: string
  slug: string
  city: string | null
  member_count: number
  created_at: string
}

export type CirclesForming = {
  circles: FormingCircle[]
  /** The city the list is scoped to, or null when it is the community-wide newest. */
  city: string | null
}

export const CIRCLES_FORMING_COUNT = 5

const same = (a: string | null | undefined, b: string): boolean =>
  !!a && a.trim().toLowerCase() === b

/** `newest` must already be ordered newest first. */
export function pickCirclesForming(
  newest: FormingCircle[],
  viewerCity: string | null | undefined,
  count = CIRCLES_FORMING_COUNT,
): CirclesForming {
  const city = viewerCity?.trim() ?? ''
  if (city) {
    const key = city.toLowerCase()
    const local = newest.filter((c) => same(c.city, key))
    if (local.length > 0) return { circles: local.slice(0, count), city }
  }
  return { circles: newest.slice(0, count), city: null }
}
