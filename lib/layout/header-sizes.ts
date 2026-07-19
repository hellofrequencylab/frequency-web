// The ONE size ladder for the `header` element (ADR-793). PageHero renders these min-heights; the
// elements registry lists them as the height choices; resolveHeaderElement resolves to one of them.
// PURE + data-only (client-safe, no Tailwind runtime), like the menu catalogs — so the render layer,
// the registry, and the config resolver never keep three drifting copies of the ladder.
//
// NOTE: these are MIN-heights (the header's overlaid content can grow the band), which is why the
// legacy fixed-height cover ladders (lib/spaces/hero-config.ts short/medium/tall, lib/events/
// hero-height.ts short/standard/tall) are NOT merged here yet — those paint fixed-height cover bands
// with stored values + a focal-preview aspect derivation. They converge onto this ladder when those
// surfaces adopt the header element (docs/APPS-CONVERSION-PLAN Phase 4).

export type HeaderSize = 'short' | 'standard' | 'large' | 'tall'

/** The height tiers (ascending), for the elements-console height dropdown. */
export const HEADER_SIZES: readonly { value: HeaderSize; label: string }[] = [
  { value: 'short', label: 'Short' },
  { value: 'standard', label: 'Standard' },
  { value: 'large', label: 'Large' },
  { value: 'tall', label: 'Tall' },
] as const

/** The responsive min-height utility for each tier. `large` is the shipped directory-hero height. */
export const HEADER_MIN_H: Record<HeaderSize, string> = {
  short: 'min-h-[11rem] sm:min-h-[14rem]',
  standard: 'min-h-[15rem] sm:min-h-[20rem]',
  large: 'min-h-[15rem] sm:min-h-[24rem]',
  tall: 'min-h-[20rem] sm:min-h-[30rem]',
}

const HEADER_SIZE_SET = new Set<string>(HEADER_SIZES.map((s) => s.value))

/** Narrow an arbitrary value to a HeaderSize, or undefined. Pure + total. */
export function asHeaderSize(v: unknown): HeaderSize | undefined {
  return typeof v === 'string' && HEADER_SIZE_SET.has(v) ? (v as HeaderSize) : undefined
}
