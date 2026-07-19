// The `header` element's config resolver (ADR-793, docs/EMBEDDABLE-ELEMENTS.md). Reads the page header's
// role-tunable settings from the shared element_settings layer (platform master + optional per-space
// override) and hands a server-rendered header surface its effective DISPLAY config: which layout +
// height to paint, and whether the focal point / links / scrim are on. Editing WHO may change these is
// the `roles` layer (enforced when inline header editing lands); the public render just reads the
// operator's chosen settings. FAIL-SAFE: any error / missing table resolves to the registry defaults.
//
// Per-surface model: a surface passes its intrinsic `defaults` (e.g. a Journey wants the identity layout,
// standard height). An operator value set in /admin/elements (or a Space override) WINS over that
// default and applies without a deploy; absent an operator value the surface keeps its own default. So
// tuning the master retunes every header that defers, while each section still has a sensible baseline.

import { readElementLayers } from './store'
import { elementDef } from './registry'
import { resolveElementConfig, type StoredElementConfig } from './config'
import { asHeaderSize } from '@/lib/layout/header-sizes'
import type { PageHeroSize, PageHeroVariant } from '@/components/templates/page-hero'

/** The effective, ready-to-render header config for a surface. */
export interface HeaderElementConfig {
  layout: PageHeroVariant
  height: PageHeroSize
  /** Apply the operator focal point on the cover. */
  focus: boolean
  /** Show the header links / call-to-action cluster. */
  links: boolean
  /** Keep the ink scrim so overlaid text stays legible. */
  scrim: boolean
}

/** A surface's intrinsic baseline, used unless the operator has set a master/space value. */
export interface HeaderDefaults {
  layout?: PageHeroVariant
  height?: PageHeroSize
}

const LAYOUTS: readonly PageHeroVariant[] = ['overlay', 'identity', 'minimal']

export const DEFAULT_HEADER_CONFIG: HeaderElementConfig = {
  layout: 'overlay',
  height: 'large',
  focus: true,
  links: true,
  scrim: true,
}

function asLayout(v: unknown): PageHeroVariant | undefined {
  return typeof v === 'string' && (LAYOUTS as readonly string[]).includes(v) ? (v as PageHeroVariant) : undefined
}

/** PURE: fold the stored layers + a surface's defaults into the effective header config. The layout /
 *  height precedence is: an operator-set value (space override → platform master) → the surface default →
 *  the registry default. The three toggles read the fully-resolved boolean (default on). Exported so it
 *  is unit-testable without a database. */
export function pickHeaderConfig(
  layers: { platform: StoredElementConfig; space: StoredElementConfig | null },
  defaults?: HeaderDefaults,
): HeaderElementConfig {
  const def = elementDef('header')
  if (!def) return { ...DEFAULT_HEADER_CONFIG, ...defaults }
  const resolved = resolveElementConfig(def, layers.platform, layers.space)
  // An operator's EXPLICIT (sparse) layout/height, if any, wins over the surface default.
  const setLayout = asLayout(layers.space?.settings?.layout ?? layers.platform.settings?.layout)
  const setHeight = asHeaderSize(layers.space?.settings?.height ?? layers.platform.settings?.height)
  return {
    layout: setLayout ?? defaults?.layout ?? asLayout(resolved.settings.layout) ?? DEFAULT_HEADER_CONFIG.layout,
    height: setHeight ?? defaults?.height ?? asHeaderSize(resolved.settings.height) ?? DEFAULT_HEADER_CONFIG.height,
    focus: resolved.settings.focus !== false,
    links: resolved.settings.links !== false,
    scrim: resolved.settings.scrim !== false,
  }
}

/** Resolve the header element config for a surface (optionally scoped to a Space). FAIL-SAFE. */
export async function resolveHeaderElement(
  opts: { spaceId?: string | null; defaults?: HeaderDefaults } = {},
): Promise<HeaderElementConfig> {
  try {
    const layers = await readElementLayers('header', opts.spaceId ?? null)
    return pickHeaderConfig(layers, opts.defaults)
  } catch {
    return { ...DEFAULT_HEADER_CONFIG, ...opts.defaults }
  }
}
