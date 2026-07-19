// The `qr-studio` element's config resolver (docs/EMBEDDABLE-ELEMENTS.md §3). Reads the QR design
// editor's per-feature toggles + preset choice from the shared element_settings layer (platform master +
// optional per-space override) and answers, FOR THIS VIEWER, which design controls are available. Unlike
// the header (display-only settings any reader sees), QR Studio's features are ROLE-GATED: each toggle is
// unlocked only for a viewer whose role meets the feature's min-role, so the resolver folds the stored
// layers AND the viewer's role context. FAIL-SAFE: any error / missing def resolves to the full config.
//
// This is plumbing only: it mirrors resolveHeaderElement so a QR mount can later ask "what may this
// viewer tune?" without re-implementing the layering. Consuming it in StyleEditor is a separate follow-up
// (the header shipped its resolver the same way before consumption).

import { readElementLayers } from './store'
import { elementDef } from './registry'
import {
  resolveElementConfig,
  elementFeatureOn,
  elementChoice,
  type StoredElementConfig,
  type ViewerRoleCtx,
  type ResolvedElement,
} from './config'
import type { ElementDef } from './registry'

/** The effective, per-viewer QR Studio config: which design controls this viewer may use, plus the
 *  resolved preset set. Each toggle is on only when its feature is enabled AND the viewer's role meets
 *  the feature's min-role. */
export interface QrStudioConfig {
  /** Module + background color swatches. */
  colors: boolean
  /** A distinct color for the finder eyes. */
  eyeColor: boolean
  /** Two-color gradient across the modules. */
  gradient: boolean
  /** Module / eye / pupil shape pickers. */
  shapes: boolean
  /** Add a center logo (via the Loom picker) with crop + tint. */
  logo: boolean
  /** A scan-me card label frame under the code. */
  frame: boolean
  /** How many starter looks to show. */
  presets: 'full' | 'core'
}

const PRESETS: readonly QrStudioConfig['presets'][] = ['full', 'core']

/** The fail-safe: every control on, all presets. Used when there is no def / on any error. */
export const DEFAULT_QR_STUDIO_CONFIG: QrStudioConfig = {
  colors: true,
  eyeColor: true,
  gradient: true,
  shapes: true,
  logo: true,
  frame: true,
  presets: 'full',
}

function asPresets(v: string): QrStudioConfig['presets'] {
  return (PRESETS as readonly string[]).includes(v) ? (v as QrStudioConfig['presets']) : DEFAULT_QR_STUDIO_CONFIG.presets
}

/** PURE: fold the stored layers + the viewer's role into the effective QR Studio config. Each toggle
 *  reads `elementFeatureOn` (enabled AND role met); `presets` reads `elementChoice`. A missing def
 *  returns the full default. Exported so it is unit-testable without a database. */
export function pickQrStudioConfig(
  def: ElementDef | null,
  layers: { platform: StoredElementConfig; space: StoredElementConfig | null },
  ctx: ViewerRoleCtx,
): QrStudioConfig {
  if (!def) return DEFAULT_QR_STUDIO_CONFIG
  const resolved: ResolvedElement = resolveElementConfig(def, layers.platform, layers.space)
  return {
    colors: elementFeatureOn(def, resolved, 'colors', ctx),
    eyeColor: elementFeatureOn(def, resolved, 'eyeColor', ctx),
    gradient: elementFeatureOn(def, resolved, 'gradient', ctx),
    shapes: elementFeatureOn(def, resolved, 'shapes', ctx),
    logo: elementFeatureOn(def, resolved, 'logo', ctx),
    frame: elementFeatureOn(def, resolved, 'frame', ctx),
    presets: asPresets(elementChoice(resolved, 'presets')),
  }
}

/** Resolve the QR Studio element config for a viewer (optionally scoped to a Space). FAIL-SAFE. */
export async function resolveQrStudio(
  opts: { spaceId?: string | null; viewer: ViewerRoleCtx },
): Promise<QrStudioConfig> {
  try {
    const layers = await readElementLayers('qr-studio', opts.spaceId ?? null)
    return pickQrStudioConfig(elementDef('qr-studio'), layers, opts.viewer)
  } catch {
    return DEFAULT_QR_STUDIO_CONFIG
  }
}
