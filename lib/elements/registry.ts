// The EMBEDDABLE ELEMENTS registry (docs/EMBEDDABLE-ELEMENTS.md). ONE catalog of the reusable
// in-product elements (mini-apps): the Loom picker today; QR Studio / Email editor / CRM board next.
// A page requests an element by key and gets the ONE canonical implementation, configured from the
// shared `element_settings` layer with per-feature ROLE GATING. PURE + framework-free (types + data
// only) so it is client-safe and trivially testable, like the menu catalogs (SPACE_MODULES).

/** Every registrable element. Extend the union as elements adopt the framework. */
export type ElementKey = 'loom-picker' | 'header' | 'qr-studio' | 'email-editor' | 'crm-board'

/** The generic role tier a feature gates on. Resolved BY CONTEXT (docs §3): in a Space it maps to the
 *  SpaceRole ladder; globally to the community_role ladder + platform staff. So one vocabulary gates
 *  both scopes without a second permission system. */
export type ElementRole = 'everyone' | 'member' | 'editor' | 'admin' | 'staff'

/** The role tiers, ascending, for the settings-editor dropdown. */
export const ELEMENT_ROLES: readonly ElementRole[] = ['everyone', 'member', 'editor', 'admin', 'staff']

export const ELEMENT_ROLE_LABEL: Record<ElementRole, string> = {
  everyone: 'Everyone',
  member: 'Signed-in members',
  editor: 'Editors and up',
  admin: 'Admins and up',
  staff: 'Platform staff only',
}

/** One tunable feature of an element: a toggle (on/off) or a choice (a value from a list). Each
 *  carries a default value AND a default min-role; the operator may override both in element_settings. */
export interface ElementFeature {
  key: string
  label: string
  help?: string
  kind: 'toggle' | 'choice'
  /** Default for a toggle feature. */
  defaultOn?: boolean
  /** Options + default for a choice feature. */
  choices?: { value: string; label: string }[]
  default?: string
  /** The default lowest role that unlocks the feature (overridable per element_settings.roles). */
  defaultRole: ElementRole
}

/** One registered element: its identity, where its own studio lives, and its tunable features. */
export interface ElementDef {
  key: ElementKey
  label: string
  description: string
  /** The element's own admin studio (where its content lives), for a "manage" link. */
  studioHref?: string
  features: readonly ElementFeature[]
}

/** THE registry. Every element + its features. Loom is the first citizen (docs §"First citizen"). */
export const ELEMENTS: readonly ElementDef[] = [
  {
    key: 'loom-picker',
    label: 'Loom picker',
    description: 'The one image picker popup every image upload opens: browse your Loom, per-space categories, upload, and pick.',
    studioHref: '/admin/library',
    features: [
      { key: 'tab.images', label: 'Images tab', kind: 'toggle', defaultOn: true, defaultRole: 'everyone', help: 'Your uploaded images.' },
      { key: 'tab.icons', label: 'Icons tab', kind: 'toggle', defaultOn: true, defaultRole: 'everyone', help: 'Site icons + icons you upload.' },
      { key: 'tab.elements', label: 'Elements tab', kind: 'toggle', defaultOn: true, defaultRole: 'everyone', help: 'AI-created images.' },
      { key: 'tab.tags', label: 'Tags tab', kind: 'toggle', defaultOn: true, defaultRole: 'everyone', help: 'Browse by tag.' },
      { key: 'tab.spaces', label: 'Per-space categories', kind: 'toggle', defaultOn: true, defaultRole: 'everyone', help: 'A category for each Space you run.' },
      { key: 'tab.airwaves', label: 'Airwaves tab', kind: 'toggle', defaultOn: false, defaultRole: 'everyone', help: 'Recordings in the Loom (coming soon).' },
      { key: 'aiCreate', label: 'AI Create', kind: 'toggle', defaultOn: false, defaultRole: 'editor', help: 'Generate a new Element with AI from inside Elements.' },
      { key: 'defaultScope', label: 'Opens on', kind: 'choice', choices: [{ value: 'mine', label: 'My uploads' }, { value: 'space', label: 'A space' }], default: 'mine', defaultRole: 'everyone', help: 'Which library the picker shows first.' },
    ],
  },
  {
    // The one page header/hero band (components/templates/page-hero.tsx). ONE component, a few LAYOUTS,
    // the SAME editing functions everywhere; each function gated by role. Server-rendered, so it is
    // registered here for config + role gates but is NOT in the client component map — templates import
    // the canonical PageHero directly (that is the one mount). See docs/EMBEDDABLE-ELEMENTS.md.
    key: 'header',
    label: 'Page header',
    description: 'The one header/hero band every page uses: one look, a few layouts (overlay, entity, minimal), the same height / focal-point / links controls site-wide.',
    features: [
      { key: 'layout', label: 'Layout', kind: 'choice', choices: [{ value: 'overlay', label: 'Overlay (centered)' }, { value: 'identity', label: 'Entity (bottom-left)' }, { value: 'minimal', label: 'Minimal (cover only)' }], default: 'overlay', defaultRole: 'editor', help: 'Which header layout this surface uses.' },
      { key: 'height', label: 'Height', kind: 'choice', choices: [{ value: 'short', label: 'Short' }, { value: 'standard', label: 'Standard' }, { value: 'large', label: 'Large' }, { value: 'tall', label: 'Tall' }], default: 'large', defaultRole: 'editor', help: 'The band height.' },
      { key: 'focus', label: 'Focal point', kind: 'toggle', defaultOn: true, defaultRole: 'editor', help: 'Let editors set the cover image focal point.' },
      { key: 'links', label: 'Header links', kind: 'toggle', defaultOn: true, defaultRole: 'editor', help: 'Show the header buttons / call-to-action links.' },
      { key: 'scrim', label: 'Darken cover', kind: 'toggle', defaultOn: true, defaultRole: 'admin', help: 'Keep the ink scrim so overlaid text stays legible.' },
      { key: 'overlayStyle', label: 'Overlay', kind: 'choice', choices: [{ value: 'shadow', label: 'Shadow (dark)' }, { value: 'none', label: 'None (clean)' }, { value: 'fade', label: 'Fade (from bottom)' }], default: 'shadow', defaultRole: 'editor', help: 'The overlay treatment over the cover image.' },
    ],
  },
  {
    // QR Studio — the one QR design editor (app/(main)/admin/qr/style-editor.tsx, StyleEditor). One
    // canonical, un-forked component mounted on every code surface; client-mountable via <AppElement>.
    // The features declare the design controls + who may use each (role-gated); consuming them per-viewer
    // is the resolveQrStudio() follow-up (mirrors resolveHeaderElement). See docs/EMBEDDABLE-ELEMENTS.md.
    key: 'qr-studio',
    label: 'QR Studio',
    description: 'The one QR design editor every code surface opens: colors, shapes, a center logo (via the Loom picker), a scan-me frame, live scannability, and PNG/SVG output.',
    studioHref: '/admin/qr',
    features: [
      { key: 'colors', label: 'Colors', kind: 'toggle', defaultOn: true, defaultRole: 'everyone', help: 'Module + background color swatches.' },
      { key: 'eyeColor', label: 'Eye color', kind: 'toggle', defaultOn: true, defaultRole: 'editor', help: 'A distinct color for the finder eyes.' },
      { key: 'gradient', label: 'Gradient fill', kind: 'toggle', defaultOn: true, defaultRole: 'editor', help: 'Two-color gradient across the modules.' },
      { key: 'shapes', label: 'Shapes', kind: 'toggle', defaultOn: true, defaultRole: 'everyone', help: 'Module / eye / pupil shape pickers.' },
      { key: 'logo', label: 'Center logo', kind: 'toggle', defaultOn: true, defaultRole: 'editor', help: 'Add a logo (via the Loom picker) with crop + tint.' },
      { key: 'frame', label: 'Scan-me frame', kind: 'toggle', defaultOn: true, defaultRole: 'editor', help: 'A card label frame under the code.' },
      { key: 'presets', label: 'Preset set', kind: 'choice', choices: [{ value: 'full', label: 'All presets' }, { value: 'core', label: 'Core four' }], default: 'full', defaultRole: 'everyone', help: 'How many starter looks to show.' },
    ],
  },
] as const

/** An element def by key, or null. */
export function elementDef(key: string): ElementDef | null {
  return ELEMENTS.find((e) => e.key === key) ?? null
}
