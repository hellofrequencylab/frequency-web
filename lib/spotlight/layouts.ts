// SPOTLIGHT LAYOUTS: the registry that says which whole-page layouts a Spotlight theme can wear. PURE.
// A theme with no entry here has no layouts and renders exactly as before (the block body, nothing swapped).
// The Network (`network-kit`), Designer (`designer-kit`) and Temple (`temple-kit`) Theme Kits each register the six layouts of
// their design's Spotlight Layouts page. The components live in components/spotlight/network-kit-layouts.tsx and
// designer-kit-layouts.tsx and temple-kit-layouts.tsx; this file is ids and labels only, so the theme validator and the editor can read it
// without pulling React in.

type LayoutName = 'stack' | 'card-wall' | 'story' | 'calendar-first' | 'shop-front' | 'profile'

/** A layout is named `<theme>:<layout>` everywhere it is stored, so two themes can both have a `stack`. */
export type NetworkKitLayoutId = `network-kit:${LayoutName}`
export type DesignerKitLayoutId = `designer-kit:${LayoutName}`
export type TempleKitLayoutId = `temple-kit:${LayoutName}`
export type SpotlightLayoutId = NetworkKitLayoutId | DesignerKitLayoutId | TempleKitLayoutId

interface SpotlightLayoutInfo {
  id: SpotlightLayoutId
  label: string
  /** What the layout is for, in the design's words. */
  blurb: string
}

const LAYOUT_BLURBS: readonly [LayoutName, string, string][] = [
  ['stack', 'Stack', 'Every way in, stacked'],
  ['card-wall', 'Card wall', 'Two columns of square cards'],
  ['story', 'Story', 'One photo, a few lines, one button'],
  ['calendar-first', 'Calendar first', 'Dates lead, booking follows'],
  ['shop-front', 'Shop front', 'Sessions as products'],
  ['profile', 'Profile', 'Who you are, then one thing to do'],
]

const SPOTLIGHT_LAYOUTS_BY_THEME: Record<string, readonly SpotlightLayoutInfo[]> = {
  'network-kit': [
    { id: 'network-kit:stack', label: 'Stack', blurb: 'Every way in, stacked' },
    { id: 'network-kit:card-wall', label: 'Card wall', blurb: 'Two columns of square cards' },
    { id: 'network-kit:story', label: 'Story', blurb: 'One photo, a few lines, one button' },
    { id: 'network-kit:calendar-first', label: 'Calendar first', blurb: 'Dates lead, booking follows' },
    { id: 'network-kit:shop-front', label: 'Shop front', blurb: 'Sessions as products' },
    { id: 'network-kit:profile', label: 'Profile', blurb: 'Who you are, then one thing to do' },
  ],
  'designer-kit': LAYOUT_BLURBS.map(([n, label, blurb]) => ({ id: `designer-kit:${n}` as DesignerKitLayoutId, label, blurb })),
  'temple-kit': LAYOUT_BLURBS.map(([n, label, blurb]) => ({ id: `temple-kit:${n}` as TempleKitLayoutId, label, blurb })),
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

/** True for a layout the Designer Theme Kit draws (components/spotlight/designer-kit-layouts.tsx). */
export function isDesignerKitLayout(id: SpotlightLayoutId): id is DesignerKitLayoutId {
  return id.startsWith('designer-kit:')
}

/** True for a layout the Temple Theme Kit draws (components/spotlight/temple-kit-layouts.tsx). */
export function isTempleKitLayout(id: SpotlightLayoutId): id is TempleKitLayoutId {
  return id.startsWith('temple-kit:')
}
