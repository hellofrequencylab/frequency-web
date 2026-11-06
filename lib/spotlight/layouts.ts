// SPOTLIGHT LAYOUTS: the registry that says which whole-page layouts a Spotlight theme can wear. PURE.
// A theme with no entry here has no layouts and renders exactly as before (the block body, nothing swapped).
// The Network (`network-kit`), Designer (`designer-kit`), Temple (`temple-kit`), Free Human (`free-human`), New World, Services and CyberWitch Theme Kits each register the six layouts of
// their design's Spotlight Layouts page. The components live in components/spotlight/network-kit-layouts.tsx and
// designer-kit-layouts.tsx and temple-kit-layouts.tsx; this file is ids and labels only, so the theme validator and the editor can read it
// without pulling React in.

type LayoutName = 'stack' | 'card-wall' | 'story' | 'calendar-first' | 'shop-front' | 'profile'

/** A layout is named `<theme>:<layout>` everywhere it is stored, so two themes can both have a `stack`. */
export type NetworkKitLayoutId = `network-kit:${LayoutName}`
export type DesignerKitLayoutId = `designer-kit:${LayoutName}`
export type TempleKitLayoutId = `temple-kit:${LayoutName}`
export type FreeHumanLayoutId = `free-human:${LayoutName}`
export type NewWorldKitLayoutId = `new-world-kit:${LayoutName}`
export type ServicesKitLayoutId = `services-kit:${LayoutName}`
export type CyberWitchKitLayoutId = `cyberwitch-kit:${LayoutName}`
export type SpotlightLayoutId = NetworkKitLayoutId | DesignerKitLayoutId | TempleKitLayoutId | FreeHumanLayoutId | NewWorldKitLayoutId | ServicesKitLayoutId | CyberWitchKitLayoutId

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
  'free-human': LAYOUT_BLURBS.map(([n, label, blurb]) => ({ id: `free-human:${n}` as FreeHumanLayoutId, label, blurb })),
  'new-world': LAYOUT_BLURBS.map(([n, label, blurb]) => ({ id: `new-world-kit:${n}` as NewWorldKitLayoutId, label, blurb })),
  services: LAYOUT_BLURBS.map(([n, label, blurb]) => ({ id: `services-kit:${n}` as ServicesKitLayoutId, label, blurb })),
  cyberwitch: LAYOUT_BLURBS.map(([n, label, blurb]) => ({ id: `cyberwitch-kit:${n}` as CyberWitchKitLayoutId, label, blurb })),
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

/** True for a layout the Free Human Theme Kit draws (components/spotlight/free-human-layouts.tsx). */
export function isFreeHumanLayout(id: SpotlightLayoutId): id is FreeHumanLayoutId {
  return id.startsWith('free-human:')
}

/** True for a layout the New World kit draws (components/spotlight/new-world-kit-layouts.tsx). */
export function isNewWorldKitLayout(id: SpotlightLayoutId): id is NewWorldKitLayoutId {
  return id.startsWith('new-world-kit:')
}

/** True for a layout the Services theme draws (components/spotlight/services-kit-layouts.tsx). */
export function isServicesKitLayout(id: SpotlightLayoutId): id is ServicesKitLayoutId {
  return id.startsWith('services-kit:')
}

/** True for a layout the CyberWitch theme draws (components/spotlight/cyberwitch-kit-layouts.tsx). */
export function isCyberWitchKitLayout(id: SpotlightLayoutId): id is CyberWitchKitLayoutId {
  return id.startsWith('cyberwitch-kit:')
}

/** The whole-page looks, in the design's order. A Space's Spotlight stores one of these (`preferences.spotlight.look`). */
const SPOTLIGHT_LOOKS = ['stack', 'card-wall', 'story', 'calendar-first', 'shop-front', 'profile'] as const
export type SpotlightLook = (typeof SPOTLIGHT_LOOKS)[number]

/** A stored look name, or null when it is not one of the six. */
export function asSpotlightLook(v: unknown): SpotlightLook | null {
  return typeof v === 'string' && (SPOTLIGHT_LOOKS as readonly string[]).includes(v) ? (v as SpotlightLook) : null
}

/** A Space's website theme id to the registry key that holds its Spotlight layouts. A theme missing here (Nocturne, Bold,
 *  Wildheart, the older Network and Temple) has no whole-page layouts, so its Spotlight stays the block page. */
const SPACE_THEME_LAYOUT_KEY: Record<string, string> = {
  'new-world': 'new-world', services: 'services', cyberwitch: 'cyberwitch', designer: 'designer-kit',
  'temple-kit': 'temple-kit', 'free-human': 'free-human', 'network-kit': 'network-kit',
}

/** The looks a Space on `siteTheme` can pick for its Spotlight (empty for a theme with none). */
export function spaceLooksFor(siteTheme: string): readonly { look: SpotlightLook; label: string; blurb: string }[] {
  const key = SPACE_THEME_LAYOUT_KEY[siteTheme]
  if (!key) return []
  return spotlightLayoutsFor(key).map((l) => ({ look: l.id.split(':')[1] as SpotlightLook, label: l.label, blurb: l.blurb }))
}

/** The registered layout id for a Space's theme and look, or null when the theme has none. */
export function spaceLayoutId(siteTheme: string, look: SpotlightLook): SpotlightLayoutId | null {
  const key = SPACE_THEME_LAYOUT_KEY[siteTheme]
  const hit = key ? spotlightLayoutsFor(key).find((l) => l.id.endsWith(`:${look}`)) : undefined
  return hit?.id ?? null
}
