// The Loom element catalog — the single source of truth for every code-drawn
// element the library holds, beyond the marketing illustration kit. Each entry maps
// a config `{registry, name}` (what a library_assets row stores) to its display
// title, category, and tags. The client resolver (lib/library/element-registry.tsx)
// renders from these registries; the DB seed mirrors this list. Adding art here +
// seeding a row is all it takes for it to appear (and sort) in Loom Studio.
//
// The marketing illustration kit (registry 'illustration') is enumerated from
// components/marketing/illustrations (illustrationNames) and is NOT repeated here,
// except for the onboarding/On-Air pieces that were folded into that kit and want a
// non-default category. See docs/LIBRARY.md.

export type ElementRegistry = 'illustration' | 'icon' | 'spot' | 'circle-template' | 'texture' | 'render'

export type PillarSlug = 'mind' | 'body' | 'spirit' | 'expression'

export type ElementDef = {
  registry: ElementRegistry
  /** Stored as config.name; unique within its registry. */
  name: string
  title: string
  category: string
  tags: string[]
  /** circle-template scenes render with a Pillar palette. */
  pillar?: PillarSlug
}

// On Air control icon kit (components/on-air/icons.tsx) — 24×24 currentColor marks.
const ON_AIR_ICONS: ElementDef[] = [
  { registry: 'icon', name: 'lotus', title: 'Lotus (meditation)', category: 'On Air icons', tags: ['icon', 'on-air', 'meditation', 'lotus'] },
  { registry: 'icon', name: 'breathe', title: 'Breathe visualizer', category: 'On Air icons', tags: ['icon', 'on-air', 'breathe'] },
  { registry: 'icon', name: 'dial', title: 'Timer dial', category: 'On Air icons', tags: ['icon', 'on-air', 'timer', 'dial'] },
  { registry: 'icon', name: 'bolt', title: 'Zap bolt', category: 'On Air icons', tags: ['icon', 'on-air', 'zap', 'bolt'] },
  { registry: 'icon', name: 'bell-cue', title: 'Bell cue', category: 'On Air icons', tags: ['icon', 'on-air', 'bell', 'sound'] },
  { registry: 'icon', name: 'vibration', title: 'Vibration', category: 'On Air icons', tags: ['icon', 'on-air', 'vibration', 'haptic'] },
  { registry: 'icon', name: 'on-air', title: 'On air', category: 'On Air icons', tags: ['icon', 'on-air', 'broadcast', 'live'] },
]

// Zap-menu / On Air row spot art (components/feed/zap-menu-art.tsx) — 120×80 tiles.
const SPOT_ART: ElementDef[] = [
  { registry: 'spot', name: 'event', title: 'Event poster', category: 'Spot art', tags: ['spot', 'zap-menu', 'event'] },
  { registry: 'spot', name: 'contact', title: 'Contact card', category: 'Spot art', tags: ['spot', 'zap-menu', 'contact', 'crm'] },
  { registry: 'spot', name: 'partners', title: 'Partners storefront', category: 'Spot art', tags: ['spot', 'zap-menu', 'partners'] },
  { registry: 'spot', name: 'check-in', title: 'Event check-in', category: 'Spot art', tags: ['spot', 'zap-menu', 'check-in'] },
  { registry: 'spot', name: 'ghost', title: 'Ghost node', category: 'Spot art', tags: ['spot', 'zap-menu', 'ghost', 'map'] },
  { registry: 'spot', name: 'mindless', title: 'Mindless lotus', category: 'Spot art', tags: ['spot', 'on-air', 'mindless', 'meditation'] },
  { registry: 'spot', name: 'movement', title: 'Movement runner', category: 'Spot art', tags: ['spot', 'on-air', 'movement', 'runner'] },
  { registry: 'spot', name: 'connect', title: 'Connect QR', category: 'Spot art', tags: ['spot', 'zap-menu', 'connect', 'qr'] },
]

// The twelve Starter Circle template scenes (components/circles/template-art.tsx),
// grouped by their primary Pillar (drives the palette).
const CIRCLE_TEMPLATES: ElementDef[] = [
  { registry: 'circle-template', name: 'the-reading-room', title: 'The Reading Room', category: 'Circle templates', pillar: 'mind', tags: ['circle-template', 'mind', 'reading'] },
  { registry: 'circle-template', name: 'compound', title: 'Compound', category: 'Circle templates', pillar: 'mind', tags: ['circle-template', 'mind', 'money'] },
  { registry: 'circle-template', name: 'game-night', title: 'Game Night', category: 'Circle templates', pillar: 'mind', tags: ['circle-template', 'mind', 'games'] },
  { registry: 'circle-template', name: 'run-club', title: 'Run Club', category: 'Circle templates', pillar: 'body', tags: ['circle-template', 'body', 'running'] },
  { registry: 'circle-template', name: 'the-trailhead', title: 'The Trailhead', category: 'Circle templates', pillar: 'body', tags: ['circle-template', 'body', 'hiking'] },
  { registry: 'circle-template', name: 'pickup', title: 'Pickup', category: 'Circle templates', pillar: 'body', tags: ['circle-template', 'body', 'sport'] },
  { registry: 'circle-template', name: 'still', title: 'Still', category: 'Circle templates', pillar: 'spirit', tags: ['circle-template', 'spirit', 'meditation'] },
  { registry: 'circle-template', name: 'the-deep-end', title: 'The Deep End', category: 'Circle templates', pillar: 'spirit', tags: ['circle-template', 'spirit', 'connection'] },
  { registry: 'circle-template', name: 'the-table', title: 'The Table', category: 'Circle templates', pillar: 'spirit', tags: ['circle-template', 'spirit', 'dinner'] },
  { registry: 'circle-template', name: 'the-makers', title: 'The Makers', category: 'Circle templates', pillar: 'expression', tags: ['circle-template', 'expression', 'art'] },
  { registry: 'circle-template', name: 'sound', title: 'Sound', category: 'Circle templates', pillar: 'expression', tags: ['circle-template', 'expression', 'music'] },
  { registry: 'circle-template', name: 'the-writers-room', title: "The Writers' Room", category: 'Circle templates', pillar: 'expression', tags: ['circle-template', 'expression', 'writing'] },
]

// Beta-induction product-page mockups (components/onboarding/renders/*) — landscape browser
// "screens" of the app. TEMPORARY (ADR-068, removed with the induction at launch); catalogued at
// the owner's request so they're browsable while they exist.
const ONBOARDING_SCREENS: ElementDef[] = [
  { registry: 'render', name: 'feed', title: 'Feed screen', category: 'Onboarding screens', tags: ['onboarding', 'screen', 'induction', 'temporary', 'feed'] },
  { registry: 'render', name: 'circles', title: 'Circles screen', category: 'Onboarding screens', tags: ['onboarding', 'screen', 'induction', 'temporary', 'circles'] },
  { registry: 'render', name: 'events', title: 'Events screen', category: 'Onboarding screens', tags: ['onboarding', 'screen', 'induction', 'temporary', 'events'] },
]

// Abstract brand textures (components/marketing/vector-art.tsx) — currentColor motifs.
const TEXTURES: ElementDef[] = [
  { registry: 'texture', name: 'frequency-arcs', title: 'Frequency arcs', category: 'Textures', tags: ['texture', 'abstract', 'frequency', 'brand'] },
  { registry: 'texture', name: 'ripple-rings', title: 'Ripple rings', category: 'Textures', tags: ['texture', 'abstract', 'ripple', 'brand'] },
  { registry: 'texture', name: 'circle-constellation', title: 'Circle constellation', category: 'Textures', tags: ['texture', 'abstract', 'network', 'brand'] },
  { registry: 'texture', name: 'organic-blob', title: 'Organic blob', category: 'Textures', tags: ['texture', 'abstract', 'blob', 'brand'] },
]

/** Pillar for a circle-template slug (for the render palette). */
export const TEMPLATE_PILLARS: Record<string, PillarSlug> = Object.fromEntries(
  CIRCLE_TEMPLATES.map((d) => [d.name, d.pillar as PillarSlug]),
)

/** Valid element names per non-illustration registry (for validation at render). */
export const REGISTRY_NAMES: Record<Exclude<ElementRegistry, 'illustration'>, Set<string>> = {
  icon: new Set(ON_AIR_ICONS.map((d) => d.name)),
  spot: new Set(SPOT_ART.map((d) => d.name)),
  'circle-template': new Set(CIRCLE_TEMPLATES.map((d) => d.name)),
  render: new Set(ONBOARDING_SCREENS.map((d) => d.name)),
  texture: new Set(TEXTURES.map((d) => d.name)),
}
