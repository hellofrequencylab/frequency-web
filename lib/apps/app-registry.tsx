// The Loom's App resolver (LP5b / ADR-500, docs/LOOM-PLATFORM.md §4, docs/LIBRARY.md). Presents the
// code-drawn App catalog (lib/apps/catalog.ts `APPS`) as Loom-browsable rows the SAME way the element
// registry presents code-drawn SVG (lib/library/element-registry.tsx): the code is the source of truth
// and The Loom indexes it read-only, so the lane never drifts into a stale copy.
//
// This mirrors renderRegistryElement / isRenderableElement:
//   • appsAsLibraryItems()  → a card model per App (the browse rows), pure metadata.
//   • isPreviewableApp(app) → true when an App has a safe, side-effect-free preview (element surface).
//   • resolveAppPreview(id) → the live element render (via componentFor) where safe, else a schematic
//                              placeholder card drawn in the Loom design language.
//
// SERVER-SIDE ONLY for the render path: resolveAppPreview imports lib/apps/bindings (componentFor),
// which reaches the editor/page render layers (Server Components). Compute previews in a Server
// Component and pass the resulting nodes to the client lane as props (the RSC "slot" pattern). The
// pure appsAsLibraryItems() metadata is safe to type-import anywhere.

import type { ReactNode } from 'react'
import { REGISTRY_NAMES } from '@/lib/library/element-catalog'
import { APPS, appById } from './catalog'
import type {
  App,
  AppGate,
  AppSurfaceKind,
  AppConfigField,
  AppConnection,
} from './types'

// ── Card model ──────────────────────────────────────────────────────────────────────────────────

/** The Loom-browsable view of an App — pure, serializable metadata (no React). Mirrors the shape the
 *  asset gallery card reads, so the Apps lane composes the same grid + drawer as images/elements. */
export interface AppLibraryItem {
  id: string
  /** = App.label (voice canon). */
  title: string
  description?: string
  /** The raw spine slot ('basics' … 'danger') or 'element'. */
  category: App['category']
  /** Human category label for the rail + drawer. */
  categoryLabel: string
  /** Always 'app' — the Loom `kind` this lane manages. */
  kind: 'app'
  /** Which surfaces the App presents (editor / page / rail / element), in a stable order. */
  surfaces: AppSurfaceKind[]
  /** The single bridged gate (view). */
  gate: AppGate
  /** One-line human description of the gate (capability / space-function / staff / always-on). */
  gateLabel: string
  status: App['status']
  version: number
  /** The read-only global-config schema (Layer 2); empty when the App has none. */
  config: readonly AppConfigField[]
  /** External wiring the App declares. */
  connections: readonly AppConnection[]
  themeable: boolean
  /** Whether resolveAppPreview draws the live element (vs a schematic placeholder). */
  previewable: boolean
}

const SURFACE_ORDER: readonly AppSurfaceKind[] = ['editor', 'page', 'rail', 'element']

/** The surfaces an App presents, in a stable display order. */
function surfaceKinds(app: App): AppSurfaceKind[] {
  return SURFACE_ORDER.filter((k) => app.surfaces[k] != null)
}

/** Human labels for the 9-category spine + the element lane (voice canon: plain, no em dashes). */
const CATEGORY_LABELS: Record<App['category'], string> = {
  account: 'You',
  basics: 'Basics',
  place: 'Place',
  people: 'People',
  layout: 'Layout',
  engage: 'Engage',
  reach: 'Reach',
  comms: 'Comms',
  safety: 'Safety',
  insights: 'Insights',
  billing: 'Billing',
  danger: 'Danger',
  element: 'Elements',
}

export function categoryLabel(category: App['category']): string {
  return CATEGORY_LABELS[category] ?? category
}

/** Human labels for a surface badge. */
export const SURFACE_LABELS: Record<AppSurfaceKind, string> = {
  editor: 'Editor',
  page: 'Page',
  rail: 'Rail',
  element: 'Element',
}

/** One plain line describing which gate an App sits behind (docs/LOOM-PLATFORM.md §7). */
export function describeGate(gate: AppGate): string {
  switch (gate.system) {
    case 'none':
      return 'Always on'
    case 'capability':
      return `Capability: ${gate.capability}`
    case 'spaceFunction':
      return gate.entitlement
        ? `Space function: ${gate.fn} (needs ${gate.entitlement})`
        : `Space function: ${gate.fn}`
    case 'staff':
      return gate.domain ? `Staff: ${gate.domain}` : 'Staff'
    default:
      return 'Restricted'
  }
}

/** THE catalog as Loom browse rows — the read-direction adapter, mirroring the element registry. */
export function appsAsLibraryItems(): AppLibraryItem[] {
  return APPS.map((a) => ({
    id: a.id,
    title: a.label,
    ...(a.description !== undefined ? { description: a.description } : {}),
    category: a.category,
    categoryLabel: categoryLabel(a.category),
    kind: 'app' as const,
    surfaces: surfaceKinds(a),
    gate: a.gate,
    gateLabel: describeGate(a.gate),
    status: a.status,
    version: a.version,
    config: a.config ?? [],
    connections: a.connections ?? [],
    themeable: a.themeable,
    previewable: isPreviewableApp(a),
  }))
}

/** Smart-folder facets for the rail: each category with a count, in spine order. */
export function appCategoryFacets(
  items: readonly AppLibraryItem[],
): { category: App['category']; label: string; count: number }[] {
  const order = Object.keys(CATEGORY_LABELS) as App['category'][]
  return order
    .map((category) => ({
      category,
      label: CATEGORY_LABELS[category],
      count: items.filter((i) => i.category === category).length,
    }))
    .filter((f) => f.count > 0)
}

/** Surface facets for the rail: each surface with a count. */
export function appSurfaceFacets(
  items: readonly AppLibraryItem[],
): { surface: AppSurfaceKind; label: string; count: number }[] {
  return SURFACE_ORDER.map((surface) => ({
    surface,
    label: SURFACE_LABELS[surface],
    count: items.filter((i) => i.surfaces.includes(surface)).length,
  })).filter((f) => f.count > 0)
}

// ── Preview (render path — server-side) ───────────────────────────────────────────────────────────

/** True when an App has a safe, side-effect-free preview — i.e. a renderable code-drawn element.
 *  Mirrors isRenderableElement, over the pure REGISTRY_NAMES data (element Apps never use the
 *  'illustration' registry). Editor / page / rail surfaces fetch data + need request scope, so they
 *  get a schematic placeholder instead (docs/LOOM-PLATFORM.md §4, §10: The Loom indexes Layer 1). */
export function isPreviewableApp(app: App): boolean {
  const el = app.surfaces.element
  if (!el) return false
  const names = (REGISTRY_NAMES as Record<string, Set<string>>)[el.registry]
  return !!names && names.has(el.name)
}

/**
 * A preview node for an App id — mirrors renderRegistryElement. Element Apps render live through
 * componentFor (the same binding the render path uses, so the preview never goes stale); every other
 * surface gets a schematic placeholder card in the Loom design language. Never returns null: an
 * unknown or unrenderable App still yields a placeholder.
 *
 * Async + lazy: `bindings` reaches the editor/page render layers (heavy Server Component graph); it is
 * imported ONLY to draw a real element, so the pure metadata above stays cheap to import (and tests
 * can load the registry without pulling the render graph).
 */
export async function resolveAppPreview(appId: string): Promise<ReactNode> {
  const app = appById(appId)

  // The ONLY safe live preview is a code-drawn element (pure SVG, no IO, no scope). Editor and page
  // surfaces are Server Components that fetch from request context; they are shown schematically.
  //
  // `renderRegistryElement` is a CLIENT function (element-registry is 'use client'), so it cannot be
  // invoked here on the server — doing so threw and crashed the whole lane. Instead we return a client
  // wrapper element (`ElementPreview`) and let it render the element on the client. The wrapper is
  // dynamically imported so this module's static graph stays free of the render layer (tests load it
  // without pulling the client component tree). Any failure falls through to the schematic.
  if (app && isPreviewableApp(app) && app.surfaces.element) {
    try {
      const { ElementPreview } = await import('@/components/admin/library/element-preview')
      const { registry, name, pillar } = app.surfaces.element
      return <ElementPreview registry={registry} name={name} {...(pillar !== undefined ? { pillar } : {})} />
    } catch {
      // fall through to the schematic on any preview-resolution failure
    }
  }

  return (
    <div className="flex h-full w-full items-center justify-center p-4">
      <AppSchematic surfaces={app ? surfaceKinds(app) : []} />
    </div>
  )
}

/**
 * The schematic placeholder — a flat, warm "product screen" in the Loom design language
 * (docs/LOOM-DESIGN-LANGUAGE.md): filled shapes, DAWN token fills only, one clear focal point, no
 * hex, no <text>. Stands in for an App whose real surface can't be safely previewed in the browser.
 */
function AppSchematic({ surfaces }: { surfaces: readonly AppSurfaceKind[] }) {
  return (
    <svg viewBox="0 0 240 150" className="h-full w-auto" role="img" aria-hidden focusable="false">
      {/* Screen / window — the induction's signature "product moment" frame. */}
      <rect x="24" y="16" width="192" height="118" rx="18" className="fill-surface stroke-border-strong" strokeWidth="2" />
      {/* Header band + browser chrome dots. */}
      <rect x="24" y="16" width="192" height="26" rx="18" className="fill-primary-bg" />
      <rect x="24" y="30" width="192" height="12" className="fill-primary-bg" />
      <circle cx="40" cy="29" r="3" className="fill-primary" />
      <circle cx="52" cy="29" r="3" className="fill-border-strong" />
      <circle cx="64" cy="29" r="3" className="fill-border-strong" />
      {/* Warm focal card + placeholder lines. */}
      <rect x="40" y="56" width="72" height="56" rx="12" className="fill-primary-bg" />
      <circle cx="58" cy="76" r="9" className="fill-primary" />
      <rect x="76" y="72" width="26" height="5" rx="2.5" className="fill-border-strong" opacity="0.5" />
      <rect x="76" y="84" width="18" height="5" rx="2.5" className="fill-border-strong" opacity="0.4" />
      <rect x="52" y="98" width="42" height="7" rx="3.5" className="fill-surface" />
      {/* Two faint inner content cards. */}
      <rect x="122" y="56" width="78" height="24" rx="10" className="fill-surface-elevated stroke-border" strokeWidth="1.5" />
      <rect x="122" y="88" width="78" height="24" rx="10" className="fill-surface-elevated stroke-border" strokeWidth="1.5" />
      {/* A "done" signal chip when this App presents more than one surface — a filled teal tick. */}
      {surfaces.length > 1 && (
        <>
          <rect x="176" y="60" width="16" height="16" rx="8" className="fill-signal" />
          <path d="M180 68 l3 3 l5 -6" className="stroke-on-signal" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round" />
        </>
      )}
    </svg>
  )
}
