/** The four shared breakpoints (BLD-002, docs/EDITOR-NEXT.md#bld-002; owner ruling BLD-000 no. 5: the member shell
 *  moves to 600, 840 and 1200). 1600 is the wide step the builder's right rail and canvas use. A CSS custom
 *  property cannot sit in a media query, so these are the one place the numbers live in code; the builder reads
 *  them from here and a media query that needs one writes it with a comment naming this table. */
export const BREAKPOINTS = { sm: 600, md: 840, lg: 1200, xl: 1600 } as const

type BreakpointName = keyof typeof BREAKPOINTS

/** The widest breakpoint the width has reached, or 'xs' below the first. */
export function breakpointFor(width: number): BreakpointName | 'xs' {
  if (width >= BREAKPOINTS.xl) return 'xl'
  if (width >= BREAKPOINTS.lg) return 'lg'
  if (width >= BREAKPOINTS.md) return 'md'
  if (width >= BREAKPOINTS.sm) return 'sm'
  return 'xs'
}
