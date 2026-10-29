// SPOTLIGHT LAYOUTS: the registry that says which whole-page layouts a Spotlight theme can wear. PURE.
// A theme with no entry here has no layouts and renders exactly as before (the block body, nothing swapped).
// The Network Theme Kit (`network-kit`) registers the six layouts of the design's Spotlight Layouts page.
// The component for each layout lives in components/spotlight/network-kit-layouts.tsx; this file is ids and labels
// only, so the theme validator and the editor can read it without pulling React in.

/** A layout is named `<theme>:<layout>` everywhere it is stored, so two themes can both have a `stack`. */
export type SpotlightLayoutId = `network-kit:${'stack' | 'card-wall' | 'story' | 'calendar-first' | 'shop-front' | 'profile'}`

interface SpotlightLayoutInfo {
  id: SpotlightLayoutId
  label: string
  /** What the layout is for, in the design's words. */
  blurb: string
}

const SPOTLIGHT_LAYOUTS_BY_THEME: Record<string, readonly SpotlightLayoutInfo[]> = {
  'network-kit': [
    { id: 'network-kit:stack', label: 'Stack', blurb: 'Every way in, stacked' },
    { id: 'network-kit:card-wall', label: 'Card wall', blurb: 'Two columns of square cards' },
    { id: 'network-kit:story', label: 'Story', blurb: 'One photo, a few lines, one button' },
    { id: 'network-kit:calendar-first', label: 'Calendar first', blurb: 'Dates lead, booking follows' },
    { id: 'network-kit:shop-front', label: 'Shop front', blurb: 'Sessions as products' },
    { id: 'network-kit:profile', label: 'Profile', blurb: 'Who you are, then one thing to do' },
  ],
}

const ALL_IDS: ReadonlySet<string> = new Set(Object.values(SPOTLIGHT_LAYOUTS_BY_THEME).flatMap((l) => l.map((i) => i.id)))

/** The layouts a theme offers (empty for a theme with none). */
export function spotlightLayoutsFor(themeId: string): readonly SpotlightLayoutInfo[] {
  return SPOTLIGHT_LAYOUTS_BY_THEME[themeId] ?? []
}

/** A stored layout value, or null when it is not a registered layout id. */
export function asSpotlightLayoutId(v: unknown): SpotlightLayoutId | null {
  return typeof v === 'string' && ALL_IDS.has(v) ? (v as SpotlightLayoutId) : null
}
